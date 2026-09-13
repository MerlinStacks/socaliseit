# Inbox reporting (backend)

`GET /api/inbox/reporting?socialAccountId=<optional>&platform=<optional>`

Requires an authenticated user and **current** membership in the session's organization, including read-only members. Membership and the aggregate use one repeatable-read transaction. Account and platform filters intersect; platform accepts case-insensitive Prisma platform names. Invalid/unknown parameters return 400, missing authentication 401, removed membership 403. A foreign, nonexistent, or nonmatching account returns a zero snapshot and cannot expose its existence. Responses use `Cache-Control: private, no-store`.

## Exact response

```ts
{
  data: {
    generatedAt: string; // ISO, one clock used for snoozes and ages
    summary: {
      open: number; resolved: number; snoozed: number;
      unassignedOpen: number;
      openOlderThan24h: number; openOlderThan72h: number;
    };
    byType: Array<{
      type: 'comment' | 'mention' | 'dm' | 'review';
      open: number; resolved: number; snoozed: number;
    }>;
    byAssignee: Array<{
      userId: string | null; name: string;
      open: number; olderThan24h: number;
    }>;
    ageBuckets: Array<{
      key: 'under24h' | '24to72h' | 'over72h';
      label: string; count: number;
    }>;
  };
  definitions: { aging: string; resolutions: string };
}
```

`byType` always contains all four types in the order above, including zero rows. `byAssignee` includes unassigned first (even at zero), then all distinct effective assignee IDs on matching items ordered by ID, including assignees whose only work is resolved/snoozed (zero open). Current same-organization member names are used, blank names fall back to `Teammate`; deleted users and former/nonmember assignees retain their ID with `Deleted assignee`, without looking up another tenant's names. An empty inbox still has four type rows, the zero unassigned row and three zero age buckets.

## Definitions and correctness

The list and reporting share `../query.ts`'s `buildInboxCTE`: root comments only (activity includes latest direct reply in the same tenant/account), mentions, reviews, and DMs grouped by **social account + conversation** (latest inbound or outbound activity). Sources and social accounts both belong to the requesting organization. Future snoozes are snoozed; expired snoozes are effectively open, including at the exact expiry instant. Workflow assignment, including explicit null, overrides legacy assignment; without a workflow, legacy assignment comes from the same canonical source as the inbox list (latest message for DMs). Read/replied flags do not imply resolved status.

Aging is **elapsed time since latest conversation activity**, not waiting time, first-response time, or response duration. Only effectively open items enter aging and unassigned-open counts. Older-than thresholds are strict `>24h` and `>72h`. Age buckets are `<24h` (`Under 24 hours`), `24h <= age <= 72h` (`24–72 hours`), and `>72h` (`Over 72 hours`). Future timestamps count in under24h. `definitions.aging` explicitly describes this.

**`recentResolutions` is intentionally omitted**, not returned as an empty array or inferred from the current resolved state. Inspection of `InboxActivity` and `workflow/service.ts` shows only kind/description, with no from/to metadata or initial-state marker. The writer excludes no-ops but emits the identical `kind: status`, `description: Status changed to resolved` for a known-state transition and a first workflow write using an assumed initial open state. These cannot reliably distinguish the requested events excluding unknown initial states. `definitions.resolutions` explains this omission. Accurate last-seven-UTC-day event reporting needs a reliably identifiable transition audit format and an explicit historical coverage policy first. No response-time metrics are guessed.

All counting/grouping is parameterized PostgreSQL SQL returning **one aggregate row**, not an unbounded list of inbox items fetched into Node. Four type groups and three age buckets are fixed; the exact assignee breakdown necessarily scales with distinct effective assignees, not item count, and is not truncated. Scanning the matching canonical dataset is necessary for exact totals. No new migration is needed; existing inbox workflow/collaboration migrations remain prerequisites for their respective APIs.

## Verification

From `app/`:

```sh
INBOX_TEST_PGLITE_MODULE=/tmp/opencode/inbox-sql-check/node_modules/@electric-sql/pglite/dist/index.js /tmp/opencode/node-v22.17.0-linux-x64/bin/node node_modules/vitest/vitest.mjs run src/app/api/inbox/__tests__
bun x tsc --noEmit
```

Alternatively set `INBOX_TEST_DATABASE_URL` to a disposable PostgreSQL database. Integration suites use isolated schemas and apply existing inbox migrations. Aggregate tests cover canonical list/report parity, account/tenant/platform filters, root replies, account-separated DMs, effective snoozes, legacy/explicit-null assignment, deleted/former assignees, threshold boundaries, future activity and empty snapshots. Collaboration integration runs actual Prisma keyset queries through the PostgreSQL adapter (PGlite bridges the pg query interface) for both streams across timestamp ties, more than two pages, inserts, deleted anchors and scoped histories. Endpoint/schema tests cover live access, exact envelopes, independent cursors, validation and error handling. PGlite verifies SQL semantics, not production query plans or multi-connection concurrency/load.
