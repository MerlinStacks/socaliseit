# Listening relevance and in-app alert rollout

Deploy the migration before starting the updated API and workers. Restart old
workers during rollout so all ingestion uses the monitor row-lock protocol.

## API contract

- Monitor create/PATCH: `matchMode: 'phrase' | 'substring'`, `alertsEnabled:
  boolean`, `alertCooldownMinutes: integer` (15–1440 inclusive). Create defaults
  are `phrase`, `false`, and `60`. Existing monitors migrate to `substring`.
- Monitor responses include server-managed nullable `alertsEnabledAt` and
  `nextAlertAt`. Clients cannot write these. Disabling alerts or pausing the
  monitor cancels its pending batch. Re-enabling/resuming starts a new epoch.
  Repeated enable and ordinary edits do not reset the epoch/cooldown.
- Item `sentiment` is positive/neutral/negative; `isQuestion` is independent.
  Dashboard `questionCount` uses the full filtered dataset, including unread
  filtering, rather than only the current page. `isQuestion=true` filters
  questions; legacy `sentiment=question` maps to the same filter. A polarity
  filter can be combined with `isQuestion=true`.
- Manual sync returns an `alerts: { notifications: number }` stage result,
  or null and a stage error. The count is per-user notification rows. Worker
  flush failures reject the job for retry, even on otherwise empty syncs.
- `NotificationSettings.listeningAlerts` defaults true; false vetoes delivery.
  The settings UI/API is a separate integration owner's responsibility.
- Only newly inserted matching items with **negative sentiment OR `isQuestion:
  true`** qualify for alerts. Positive/neutral non-questions remain dashboard
  items without alerts. A negative question counts once, not once per signal.

## Durability and eligibility

`SocialListeningItem.alertPending` is an internal durable marker, initially
false for every pre-migration row. Only the insert branch of ingestion may set
it true, and only for a negative item or a question. Repeated upserts, recrawls
and read changes never make an old item eligible, even if a formerly positive
item becomes negative later.
Delivery uses current stored analysis rather than a first-discovery sentiment
snapshot. Reanalysis that removes both negative sentiment and question status
cancels pending eligibility permanently; discovering an older publication date
also cancels it. Flushes count only negative/question pending items and consume
all pending markers in that batch, including obsolete markers from older code.
An entirely ineligible batch is discarded without starting a cooldown.
Published/source dates before the enable epoch suppress alerts. Crawled pages
without dates use first discovery after enable; their original publication age
cannot be inferred. Connected items use the source records' `createdAt`, as
that is the timestamp exposed by the existing ingestion pipeline. Dates equal
to the enable timestamp are eligible; strictly earlier dates are suppressed.

All ingestion, monitor transitions, and flushes lock the tenant-scoped monitor
row (`FOR UPDATE`) in a transaction. The shared lock serializes competing
Prisma upserts and batch consumers. Notification insert, marker consumption and
cooldown update are atomic. The first eligible batch is immediately deliverable;
subsequent items stay pending until a sync after the cooldown (scheduled syncs
run every 20 minutes). Cooldown edits apply when the next batch is delivered;
they do not move an already persisted `nextAlertAt`.

Recipients are current organization members with `discovery.view` and no
settings veto, evaluated during the flush transaction. A batch with no eligible
recipients is consumed, not replayed if membership/settings later change.
Notifications are per-user database rows, link to `/listening?monitorId=<id>`,
and contain only a count and monitor name, never item/DM content. No push/email
delivery is invoked.

## Backfill limitations

The migration identifies questions from old `question` sentiment or ASCII/full-
width question marks, and maps old `question` sentiment to neutral. That old
sentiment discarded polarity, so SQL does not guess it. Existing positive and
negative labels remain unchanged. Recrawled/resynced matching items receive the
new analysis without generating baseline alerts. Items outside the connected
90-day/row-limited sync window or no longer crawled retain their conservative
baseline; full historical reanalysis is not required for alert correctness.
No runtime bulk backfill is performed. Migration updates/index creation may
require a maintenance window on large listening tables.

Unit tests exercise transaction rollback and concurrent/retry behavior with a
serialized stateful database double; they do not replace a live PostgreSQL
concurrency/migration smoke test.
