# Seb initial content pillars

Deploy this migration before starting the updated web app and workers. It adds a
durable workspace initialization timestamp and pillar provenance. Workspaces with
existing pillars are marked as initialized without changing any pillar.

With OpenRouter configured and Seb plus proactive mode enabled, connected account
workflows enqueue a debounced starter-pillar check. Successful scheduled post syncs
retry the check, and the daily Seb sweep covers existing workspaces and missed jobs.
Manual-only accounts do not qualify. Insufficient context or AI failures leave the
workspace eligible for a later attempt; account names alone are not grounding.

Pillars remain workspace-wide. Seb creates 3–5 themes, with explanations and a
workspace notification, without assigning historical posts or setting targets.
Pending website/AI insights are excluded from generation context.

The final initialization marker, pillar inserts, and notification are transactional.
Manual create/edit/delete operations lock the same organization row before mutation.
Existing pillars are never topped up or replaced. Deleting the last pillar does not
reset initialization. Duplicate queue deliveries may evaluate eligibility again but
cannot commit another starter set. Failed transactions leave no partial set.

Verification includes mocked transaction/concurrency, tenant-scoping, API and worker
regressions. Live PostgreSQL locking, Redis delivery, and real model output still
require deployment-environment smoke testing.
