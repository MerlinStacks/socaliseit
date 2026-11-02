# Publishing queues for bulk content

A publishing queue is a repeating list of days and times that one social profile
posts at. Bulk content is dropped in and the queue decides when each piece goes
out, so nobody has to pick publish times one post at a time.

This is a new feature layered on top of the existing scheduler. It never changes
how manual scheduling, publish-now, or the calendar behave: a queue only ever
*chooses* a datetime, then hands the post to the same locked schedule-replacement path the
composer already uses. Nothing outside these routes reads the new tables.

## Templates

Settings → **Publishing Queues** (`/settings?tab=publishing`).

Each queue belongs to one social profile and is either its **default** queue or
one of up to ten **labelled** variants (`weekends`, `promos`…). A queue holds
slot lines, each a wall-clock time plus the days it repeats on:

- Times are wall-clock in the queue's timezone, so a queue set to 09:00 in
  `Europe/Berlin` publishes at 07:00Z in summer and 08:00Z in winter. The human
  rhythm stays put across DST changes; slots landing inside a spring-forward gap
  are skipped rather than invented.
- Days are evaluated in the queue's timezone, not the server's.
- A profile can have several labelled queues; content queued with a label the
  profile does not have falls back to that profile's default queue.

Editing a template affects **future** queueing only. Posts already scheduled from
it keep their datetimes — including when a user drags one on the calendar, which
the allocator then respects as an occupancy rather than overwriting it.

## Placement modes

| Mode | Behaviour |
| --- | --- |
| Queue available | First open slot at or after now. Earlier gaps are left alone, so deleting a post does not reshuffle everyone. |
| Queue last | First open slot after the most recently filled one — bulk drops append. |
| Queue next | Earliest slot the queue may use; the queue's own later items shift back one slot each to make room. Capped at 200 moves. |

Two items never land on the same instant for one profile (60-second minimum
separation). Slots held by posts the queue does **not** own — scheduled by hand,
for instance — are routed around and never moved by a queue action. When every
slot inside 90 days is full, the search widens once before reporting the queue
as full.

## Getting content in

All four paths end as rows in a batch, which the worker places:

- **Upload files** — the dialog sends each file through `POST /api/media`, the
  existing streaming upload path, then batches the returned asset ids. No second
  upload implementation.
- **Media library multi-select** — select assets → **Add to queue**.
- **Spreadsheet** — CSV with a `caption` column; `media_urls` must already be in
  the workspace library. Any `scheduled_date` in the file is reported and
  ignored, because the queue owns the times.
- **API** — `POST /api/publishing-queues/bulk`.

One asset per row; a row that lists several uploads or URLs uses the first and
warns. A batch targets up to 20 profiles and 500 rows, creating one Post per
(profile, row) linked by `linkedGroupId` the way the composer links
multi-platform posts.

## HTTP surface

| Route | Purpose |
| --- | --- |
| `GET/POST /api/publishing-queues` | List templates; create a queue or labelled variant. `?accounts=true` for pickers |
| `GET/PATCH/DELETE /api/publishing-queues/:id` | One queue's template, items and upcoming open slots |
| `GET/POST /api/publishing-queues/items` | Queue contents; `action: queue \| cancel \| reslot` |
| `POST /api/publishing-queues/bulk` | Start a batch (`202` with `batchId`) |
| `GET /api/publishing-queues/bulk`, `GET/DELETE /:id` | Batch progress; request cancellation |
| `POST /api/publishing-queues/bulk/:id` | Retry failed placements of a failed/partial batch |

Reading templates needs `settings.view`; editing them needs `settings.edit`;
placing content needs `posts.schedule`; starting/retrying bulk creation or cloning
to another profile also needs `posts.create`. Every query is scoped by
`organizationId`, and cross-workspace ids are rejected rather than filtered
down.

## Background work

The `bulk-upload` queue processes batches with renewable distributed locks for
each batch and each profile. Local worker concurrency is a load limit, not the
correctness guarantee. Each row/profile has a unique durable reservation and a
stable post ID. Validated draft creation and reservation commit together; retries
reuse existing placements and reconcile interrupted schedule writes. If
queueing to Redis fails, the batch row is deleted instead of left stranded.

Cancellation returns `202` with `CANCELLING`, not a claim that publishing has
already stopped. The worker stops new placements, cancels remaining schedules,
then records `CANCELLED`. Failures stay visible in batch details and can be retried;
posts already publishing/published cannot be recalled and are reported explicitly.
Partial target failures are shown as partial/failed rows, never silently completed.
Required creative removed after intake fails that row instead of publishing text-only.

Occupancy comes from two places: this queue's own items, and every other
scheduled post on the same profile. Times are read from `Post.scheduledAt`
rather than the queue's copy, which is what makes hand-move respect work. Other
labels and manual schedules are immovable occupancy through the entire 180-day
search window. Cancelled posts are not revived by a queue-next cascade.

Worker-safe creation lives in `lib/post-creation.ts`. The existing
`lib/posts-service.ts` is the web wrapper that adds Next.js cache invalidation;
background services must import the worker-safe core instead. Batch-progress
polling invalidates server cache tags from the web runtime. Without a web request,
the existing dashboard/analytics cache TTLs still bound staleness.

The Docker worker build runs `scripts/verify-worker-imports.mjs` after bundling and
must reject `next/*` or `next-auth/*` runtime imports. The worker-bundle regression
test exercises the same esbuild configuration without executing jobs.

## Deployment

1. Apply `app/prisma/migrations/20261102000000_publishing_queues` with
   `npm run db:migrate` from `app/`.
2. `npm run db:generate`, then rebuild **both** app and worker so they share the
   regenerated Prisma client.
3. Nothing to configure: with no queues defined the feature stays inert, and
    existing scheduling is untouched.

The pending migration includes the row/profile uniqueness constraint, required-media
flag and cancellation states. It must be applied before deploying this feature.
If an earlier version of this migration has already been deployed elsewhere, add a
new forward migration there instead of editing an applied migration's checksum.

## Limits

60 slots per queue · 10 labels per profile · 20 profiles and 500 rows per batch
· 200 posts per "queue next" cascade · 90-day allocation horizon, widened once
when starved.
