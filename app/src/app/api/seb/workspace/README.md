# Seb workspace backend contract

`GET /api/seb/workspace` requires a session with `user.id` and
`user.currentOrganizationId`; missing either returns 401. Every data query is
scoped to that organization. Successful responses use `Cache-Control: private,
no-store`. All dates below serialize as ISO strings; nullable database fields
remain null.

## Response fields

- `latest`: latest **COMPLETED** report by creation date, or null. Scalar fields:
  `id`, `organizationId`, `trigger`, `status`, `title`, `summary`, `overallScore`,
  `scoreBreakdown`, `confidence`, `model`, `inputHash`, `dataStartDate`,
  `dataEndDate`, `generatedById`, `metadata`, `createdAt`, `updatedAt`.
  Nested recommendations/experiments are omitted; use the workspace arrays.
- `review`: newest GENERATING report if present, otherwise newest report, or
  null. Fields: `id`, `status` (`QUEUED | RUNNING | COMPLETED | FAILED`),
  `stage` (string or null), `createdAt`, `updatedAt`. Legacy GENERATING rows
  without lifecycle metadata map to RUNNING with no stage; their exact queue
  versus execution state was not recorded.
- `recommendations`: cross-report and reportless rows, up to 100 active
  (`NEW`, `IN_PROGRESS`) plus 50 most recently updated closed (`DONE`,
  `DISMISSED`). Each group sorts by `updatedAt DESC, id DESC`. Fields: `id`,
  `organizationId`, `socialAccountId`, `reportId`, `platform`, `category`,
  `priority`, `status`, `title`, `advice`, `rationale`, `evidence`, `citations`,
  `impactBaseline`, `impactResult`, `impactCheckedAt`, `confidence`, `dueAt`,
  `completedAt`, `createdAt`, `updatedAt`, `socialAccount` (null or
  `{ id, name, username }`). No account credentials are returned.
- `experiments`: cross-report and reportless rows, up to 100 active (`PLANNED`,
  `RUNNING`) plus 50 most recently updated finished (`COMPLETED`, `CANCELLED`).
  Same group ordering as recommendations. Fields: `id`, `organizationId`,
  `reportId`, `title`, `hypothesis`, `platform`, `metric`, `status`, `startAt`,
  `endAt`, `baseline`, `result`, `createdAt`, `updatedAt`.
- `history`: newest 20 reports, including generating and failed attempts.
  Fields: `id`, `title`, `summary`, `status`, `overallScore`, `confidence`,
  `trigger`, `createdAt`, `updatedAt`.
- `activity`: newest 50 milestones drawn from the returned history and backlog.
  Fields: `id`, `title`, `createdAt`, `actor` (`Seb | You | System`), `detail`.
  Review transitions are recorded events. Other entries explicitly say
  **Record-derived milestone** in `detail`; the UI should show that provenance.
  Unknown creators use System, not You. This is not a complete audit log.
- `hasMore`: `{ recommendations: { active: boolean, closed: boolean },
  experiments: { active: boolean, closed: boolean }, history: boolean,
  activity: boolean }`. Activity indicates truncation of the bounded candidate
  set, not whether older milestones exist outside those source windows.

“Recent” closed rows means the latest 50 by update time, without a time cutoff.
Active rows have no age/report filter but are capped at 100; `hasMore` makes
truncation explicit. There is no cursor on this endpoint.

## Lifecycle and compatibility

Existing database status remains GENERATING while metadata distinguishes
QUEUED/RUNNING. `metadata.review` stores `{ status, stage, createdAt }`, and
`metadata.reviewEvents` retains up to 30 transitions per report. Worker phases
are actual boundaries: waiting, generating, completed or failed. The advisor's
internal collection/model/save phases have no callback and are not fabricated.
Prior events are merged back after the advisor replaces metadata, preserving
its progress notes. A process crash between its save and that merge can lose
prior events; database status remains authoritative. Existing recommendation
and experiment status transitions have no event history or actor attribution.

Manual and proactive reservations use the same PostgreSQL transaction-scoped
organization advisory lock; the manual daily quota is checked within that lock.
Concurrent requests reuse the active report and do not enqueue duplicate work.
Generation errors are terminal for that job to avoid retrying partial saves;
new requests may reserve a new report. Terminal job redeliveries are ignored.
Enqueue errors mark the reserved report FAILED.

Workspace reads, manual requests, and proactive attempts reconcile up to 100
GENERATING rows untouched for five minutes against BullMQ. Missing or terminal
jobs mark the report FAILED; pending/live jobs are retained. Proactive reports
store their scheduler job ID for this check. Queue outages do not hide workspace
data, but prevent new generation reservations. There is no arbitrary execution
timeout: an active queue job is left for BullMQ stalled-job handling.

Existing `/api/seb/report` and detail/list consumers retain their response
contracts. Generation still returns `{ report, jobId }` with HTTP 202, adding
`existing: true` when reusing a review. No schema migration is required.
