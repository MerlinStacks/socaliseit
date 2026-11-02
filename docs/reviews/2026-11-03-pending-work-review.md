# Pending-work review — 3 November 2026

## Fix follow-up

The fifteen findings below have now been addressed in the working tree. The original
review is retained as the rationale and regression checklist; statements below about
unfixed behaviour describe the reviewed version, not the current implementation.

- Bulk drafts and row/profile reservations are created transactionally using the shared
  post service. Stable post IDs and a database uniqueness constraint prevent duplicate
  creation after interruption. Reservations survive removal of their queue or post, so
  retries do not recreate deliberately deleted content.
- Renewable distributed batch/profile locks cover HTTP and worker allocation. Occupancy
  includes other labels and the expanded horizon. Cascades move tail-first and revalidate
  the expected post schedule under the publisher's lock.
- Cancellation uses `CANCELLING` → cleanup → `CANCELLED`, with visible errors rather than
  an immediate success claim. Partial failures are surfaced and can resume through the
  retry endpoint without recreating successful placements. Already-live posts are
  explicitly reported as non-recallable.
- Schedule replacement removes old publish/reminder jobs; obsolete delayed publisher
  jobs are rejected. Seb scheduling preserves the real automatic/manual publish mode.
- Queue editor identity/reset, disabled-queue detail lookup, scoped cache invalidation,
  batch details/retry, drag click suppression, topic updates/cleanup and storage/deep-link
  initialization are covered by regression tests.
- Shared artifact types now live in a dependency-free module, and Prisma mutation/enum
  types replace unsafe casts in the touched Seb paths. Unrelated schema formatting was
  deliberately not reverted.

Changes remain **uncommitted**. The pending migration was updated but **not applied**;
deploy the schema and regenerate both app/worker clients together. If an earlier version
has already been applied in another environment, use a forward migration there instead
of changing that environment's applied migration checksum.

Final verification is recorded at the end of this document.

## Outcome and scope

*Original review, before fixes:*

**Not ready to commit/deploy the publishing-queue feature unchanged.** There are publishing-safety and data-loss risks below, despite the existing tests passing.

- Fast-forwarded `main` to `9f1797d` (`feat: add global Seb chat drawer and workspace tools`). Nothing pushed.
- Preserved the pending publishing-queue and Seb-recommendation changes. Resolved the two `seb-advisor.ts` overlaps by retaining the shared time helpers and exported text normalizer.
- Retained a safety stash named `Safety backup: pending main work before Seb drawer merge`.
- Reviewed the pending files, migration, routes, workers, UI, and their integration with the newly merged Seb tools and existing scheduler.
- This is a review, not a feature rewrite. The findings below are **not fixed**. Temporary regression probes used to validate findings were removed after execution; the existing test suite was not weakened.

## High-priority findings

### 1. A retried bulk row can create duplicate, automatically scheduled posts

**Locations:** `app/src/lib/publishing-queue/bulk.ts:251-265,291-335`; `app/prisma/schema.prisma` (`PublishingQueueItem`).

`placeBulkItem` always creates new posts and placement rows. The bulk row only becomes `COMPLETED` after scheduling finishes. If the worker loses its database connection or crashes between those steps, a retry sees a `PENDING` row and creates another set of posts. There is no unique placement identity such as `(bulkItemId, queueId)` and no lookup/resume of the posts already created. Skipping completed rows is not sufficient idempotency.

**Verified with a temporary mocked regression:** simulate database failure after placement but before recording row completion, then retry; `post.create` runs twice for the same source row.

**Fix:** reserve a durable, unique row/account placement; create its post and link atomically; on retry resume existing placements and reconcile their post state instead of recreating them. Test failures after each durable write and after job enqueue.

### 2. Cancelling a running batch does not stop it

**Location:** `app/src/lib/publishing-queue/bulk.ts:235-280,430-448`.

`processBatch` takes one initial batch snapshot, then never checks cancellation while iterating. `cancelBatch` marks the batch `FAILED`, cancels the placements visible at that moment, and returns success. The running worker can create and schedule subsequent placements, then overwrite the cancellation with `COMPLETED`. Cancellation is also represented as generic `FAILED`, making it hard to distinguish terminal user intent from a retryable processing error.

**Verified with a temporary mocked regression:** cancel during the first row; the second row still creates a post.

**Fix:** explicit cancellation state plus coordinated batch ownership; check it before each placement and use conditional finalization. Close the cancellation/scheduling race, not just the between-row loop. Surface cancellation failures truthfully instead of always claiming posts returned to drafts.

### 3. Reslotting retains the old publish job and can publish at the old time

**Location:** `app/src/lib/publishing-queue/service.ts:395-400,560-564`.

`reslotQueueItem` delegates to `scheduleQueueItem`, which always uses `schedulePost`. That helper adds another delayed job; it does not remove the previous one. The old job can publish the post at its previous time, even when the calendar now shows the later time. The publisher checks post status but does not validate the job's scheduled timestamp against the post (`app/src/workers/post-publisher.ts:55-99`).

**Verified with a temporary mocked regression:** reslot a `SCHEDULED` post; the replacement helper is never called.

**Fix:** replace an existing schedule under the existing post lock, removing both obsolete publish and reminder jobs. Add an old-job timestamp guard as defense in depth.

### 4. Queue-next can resurrect a post cancelled in the composer/calendar

**Location:** `app/src/lib/publishing-queue/service.ts:312-334,380-391`.

The owned-item query checks only queue-item status, not the linked post's status. If a member cancels a scheduled post through the normal editor, its post becomes `DRAFT` with no scheduled date, but its queue bookkeeping still says `SCHEDULED`. `item.post?.scheduledAt ?? item.scheduledAt` restores the stale time as occupancy. A subsequent `NEXT` cascade calls `reschedulePost` for that cancelled draft, making it publishable again without the member asking.

**Verified with a temporary mocked regression:** provide an owned `DRAFT` post with null schedule and stale queue-item timing; NEXT reschedules that cancelled post for the next day.

**Fix:** use live post status and time as authoritative when a post exists. Never fall back to queue history for a cancelled/unscheduled post. Reconcile terminal/deleted/cancelled placements, and revalidate displacement targets under the post lock.

### 5. Occupancy and allocation concurrency can double-book a profile

**Locations:** `app/src/lib/publishing-queue/service.ts:309-338,349-404`; `app/src/workers/bulk-upload-worker.ts:8-18`.

- Owned occupancy includes only this label's items. External occupancy requires `queueItem: null`, excluding posts scheduled by *all other queue labels* on the same profile.
- External posts are read only through 90 days, but the allocator can widen its search to 180 days. It can choose a supposedly free later slot that already has a manually scheduled post.
- Occupancy-read → allocation → scheduling has no shared per-profile lock. Worker `concurrency: 1` applies to one Worker instance, not every process or simultaneous HTTP request; two allocators for different posts can both pick the same free slot. The existing per-post lock does not serialize different posts on one profile.

**Verified:** temporary query regression confirms the `queueItem: null` exclusion. The concurrency and horizon gaps are established from the read/write paths.

**Fix:** serialize allocation by workspace/profile across workers and HTTP callers; load all relevant live scheduled posts across the full possible search window; mark only this queue's live posts movable. Apply cascades from the tail backwards to avoid temporarily overlapping already-filled slots.

### 6. Switching profiles in settings can modify the previous profile's queue

**Location:** `app/src/components/publishing-queues/publishing-queue-settings.tsx:39-56`.

The effect returns early when the newly selected profile has no selected queue. It does not reset `queueId`, `label`, or `slots`. After viewing profile A's queue and selecting profile B, which has no queue, Save still PATCHes A's queue. Deleting the selected queue similarly leaves stale selection state; creating a first queue does not select its returned ID, so a second Save can attempt another create and hit the label uniqueness constraint.

**Verified with a temporary rendered regression:** select A, then empty B, then Save; the request is `/api/publishing-queues/queue-a`.

**Fix:** key editor state by the selected profile/queue identity, initialize a clean new-template state when no queue exists, and select/reset state using mutation results.

### 7. Bulk creation and queue cloning bypass the shared post-creation contract

**Locations:** `app/src/lib/publishing-queue/bulk.ts:304-323`; `app/src/lib/publishing-queue/service.ts:514-541`.

Both paths directly create posts and then schedule them. Unlike `createPosts`, they bypass platform content validation and creation activity logging. Bulk-created videos default to `FEED`; cloning drops fields such as first comment, video title, board selection, custom media settings and thumbnails. A cross-profile clone can therefore silently lose intended publishing content/settings or become invalid for its target platform. Media deleted between intake and processing is silently converted to an empty attachment set (`bulk.ts:359-364`).

The bulk route and the cloning action are gated only by `posts.schedule`, even though they create new posts; a custom role lacking `posts.create` can create content through this path.

**Fix:** extract/reuse a validated, transaction-friendly post creation/clone service, preserving applicable publishing fields and rejecting missing required media. Require creation permission on creation/clone operations, with scheduling permission checked separately.

### 8. Seb's reminder-only scheduling tool actually queues automatic publishing

**Locations:** `app/src/lib/ai/seb-tools.ts:553-560,688-690`; `app/src/lib/queue.ts:208-220,264-267`.

This issue is in the newly merged Seb implementation. `schedule_draft` promises a reminder only and reports that auto-publish is unchanged, but calls `reschedulePost`, which passes `autoPublish: true` to the schedule-replacement helper. A real publish job is therefore enqueued even for a draft whose `autoPublish` flag is false. The worker does not use that flag to reject the job. The tests mock `reschedulePost`, so their assertion about the returned reminder wording never exercises the actual effect.

**Fix:** use the existing locked schedule-replacement path with the post's real auto-publish setting and correct persisted schedule/status. Test the actual job selection: reminder-only drafts must not enqueue a publish job. Do not merely change the reassuring response text.

## Other correctness and maintainability findings

### 9. LAST can place a post before the queue's tail

**Location:** `app/src/lib/publishing-queue/slots.ts:292-298`.

When the finite search window has no free occurrence after `lastFilled`, `afterLast[0] ?? free[free.length - 1]` chooses an earlier gap. This violates “queue last.” Also, `>` rejects slots exactly one allowed gap apart although collision detection accepts equality.

**Verified with a temporary pure regression:** a tail outside the configured search horizon results in a successful placement *before* that tail.

**Fix:** extend the search after the tail or return `NO_CAPACITY`; never silently switch LAST to gap-filling. Match the minimum-gap boundary consistently.

### 10. Partial profile failures are reported as a completed bulk row

**Location:** `app/src/lib/publishing-queue/bulk.ts:340-355`.

If one profile succeeds and another fails, `placeBulkItem` only throws when *all* placements fail. The source row becomes `COMPLETED`, the failed count stays zero, and the whole batch can be `COMPLETED` while some targets were never scheduled. The summary-only batch UI does not expose those individual errors or a recovery action.

**Fix:** represent partial placement explicitly, count failures per the documented row/placement unit, and expose a retry that resumes only failed placements without recreating successful ones.

### 11. Disabled queue detail can return another queue's timeline or fail

**Locations:** `app/src/app/api/publishing-queues/[id]/route.ts:23-36`; `app/src/lib/publishing-queue/service.ts:489-510,571-575`.

The detail route loads the requested queue by ID, then asks for a timeline using label resolution. That resolver excludes disabled queues and may fall back to the default queue. Viewing a disabled labelled queue can thus combine its own template with the default queue's items/preview; viewing a disabled default can return 409 rather than its editable detail.

**Fix:** detail reads should load timeline by the already-authorized queue ID, independently of whether new placements are enabled. Reserve fallback resolution for new placement selection.

### 12. The Seb drag tab commits on pointer-up and then toggles again on click

**Location:** `app/src/components/seb/seb-drawer.tsx:62-70,127-128`.

A pointer drag commits the open/close state, but the browser's subsequent click on the captured button still invokes `toggleChat`. A successful drag-open can immediately close again. The existing drag test sends pointer events only, so misses the final click.

**Fix:** suppress the click associated with a completed drag; distinguish pointer cancellation from commit. Add a realistic pointer-up-followed-by-click test.

### 13. Discussion registration keeps stale content and cleans up the wrong IDs

**Location:** `app/src/components/seb/seb-chat-provider.tsx:51-54,106-115`.

Registration is keyed only on IDs, so updated advice with the same ID never refreshes the registered prompt (especially relevant now that recommendations are rewritten in place). Cleanup reads `latest.current` rather than the set originally registered: when a page changes topics from A to B, the old cleanup deletes B and leaves A registered.

**Fix:** capture the registered IDs in each effect's cleanup, and compare/update topic content or revisions rather than IDs alone. Avoid churn by memoizing stable topic projections instead of suppressing real updates.

### 14. Newly submitted batches and updated previews do not reliably refresh

**Locations:** `app/src/components/publishing-queues/publishing-queue-settings.tsx:211-216`; `bulk-batch-list.tsx:25-28`; `media-queue-action.tsx:35-40`.

The intake success callback revalidates accounts, not the SWR batch list or timeline keys. If the initial batch list is empty/idle, it has no polling timer and the newly created batch is not immediately shown. A saved slot template likewise does not invalidate its independent preview key. Queue changes also do not broadcast the normal post/calendar refresh event.

**Fix:** centralize publishing-queue mutation invalidation for batches, queue options, timelines, and post/calendar caches. Include workspace identity in client cache keys.

### 15. Restoring the drawer preference can close a deep link

**Locations:** `app/src/components/seb/seb-chat-provider.tsx:45-49`; `app/src/app/(dashboard)/seb/seb-client.tsx:33-40`.

On initial mount the page's effect opens the linked conversation, but the provider's storage-restoration effect can run afterwards and set `open` back to false. An explicit `?thread=` request loses to an incidental stored layout preference. This is reproducible when browser storage actually works; the earlier Node environment's unavailable `localStorage` masked it by throwing into the catch branch.

**Verified:** `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/components/seb/__tests__/workspace.test.tsx` consistently fails the existing contextual-deep-link test. Disabling Node's own experimental storage allows jsdom to provide browser-like storage; it does not disable jsdom storage.

**Fix:** restore the preference without overwriting a newer explicit open action; coordinate initialization and persistence, and retain the real-storage deep-link regression.

## Structural improvements worth making while fixing the above

- Keep the pure slot allocator separate; that is a good boundary. Add adversarial tests for a far-future tail, exact minimum-gap boundaries, other labels, cancellation, and expanded search horizons.
- Introduce a small, explicit placement lifecycle: reservation, post creation, schedule reconciliation, terminal result. The current lifecycle is spread across loops and optimistic status flags, so comments claim guarantees that the code does not enforce.
- Reuse the existing post lock and scheduling compensation helpers rather than building another version. Use a distinct per-profile allocation lock where the resource is a profile's occupied times, not a single post.
- Use explicit Prisma input/projection types instead of broad `Record<string, unknown>` and `as never` mutation payloads in Seb tools/report writes.
- Reduce duplicated server/client artifact type definitions and shared CSS primitives so they cannot drift.
- Remove unrelated schema-formatting churn from the eventual feature diff where practical; the migration is additive, but its introductory comment inaccurately mentions a `Post.queueItemId` column that it does not add.

## Verification

- Prisma client generation: passed.
- `npx tsc --noEmit`: passed after merging and restoring the pending schema.
- ESLint on publishing-queue code, affected Seb code, and affected workers: passed.
- `npx prisma validate`: passed. No migration applied to a database.
- Initial focused test run: 124 passed across nine files.
- Seven additional temporary regression probes confirmed the failures described in findings 1–6 and 9 (finding 5's cross-label exclusion was checked directly). These were deliberately assertions of safe behaviour, not tests asserting the bugs were correct.
- Full suite with browser-like jsdom storage (`NODE_OPTIONS=--no-experimental-webstorage npx vitest run`): **2,046 passed, 2 failed, 12 skipped**, across 180 test files. Failures were the Seb deep-link test above and inbox note pagination. On a focused rerun of both files, inbox passed while the Seb deep-link failure persisted: **17 passed, 1 failed**. Do not call the full suite green or dismiss the Seb failure as an environment-only problem.
- No production publishing calls, database migrations, or live-account writes were performed by this review. No production build/browser end-to-end certification is claimed.

## Final verification after fixes

- `npx tsc --noEmit`: passed.
- ESLint on affected queue, Seb, post-service and worker paths: passed.
- `npx prisma validate`: passed; Prisma client regenerated locally.
- `git diff --check`: passed.
- Full suite: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --maxWorkers=2`
  — **2,084 passed, 12 skipped** (183 passing files, three skipped).
- Focused regression suite: **176 passed** across sixteen files, covering batch crash
  recovery, transaction rollback, cancellation, partial retry, missing media, locks,
  schedule replacement, obsolete jobs, profile switching, cache invalidation, topics,
  drag cancellation/click suppression and the real-storage Seb deep link.
- No migrations applied, live posts published, commits created or changes pushed during
  this fix pass. Database-backed deployment/migration verification and live browser E2E
  testing remain deployment checks, not claims made by these mocked regressions.

## Deployment-build follow-up

The first deployment attempt exposed a missing validation step: the bulk worker's
shared creation and invalidation paths pulled `next/cache` into its plain-Node bundle.
The production worker import guard correctly rejected it; the earlier TypeScript and
unit checks alone did not establish that this Docker build step would succeed.

Creation is now split into the worker-safe `lib/post-creation.ts` core and the existing
`lib/posts-service.ts` web wrapper. Queue mutation invalidation and batch-progress
invalidation run in API routes, not background services. The import guard is unchanged.

- The exact Dockerfile esbuild command and `verify-worker-imports.mjs` now pass locally.
- A production worker-bundle regression test asserts no Next.js/NextAuth runtime imports.
- TypeScript, targeted ESLint and 117 focused tests passed after this correction.
- Full regression suite after the build fix: **2,086 passed, 12 skipped** across
  184 passing files and three skipped files.
- This verifies the reported worker build step, not an entire live stack deployment.
