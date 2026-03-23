-- =============================================================================
-- Backfill: Link resized media copies to their originals
-- =============================================================================
-- Why: The auto-resize feature creates Media records with filename "resized-<original>"
-- but previously didn't set sourceMediaId. This links them retroactively.
-- Idempotent: only updates rows where sourceMediaId IS NULL.
-- =============================================================================

UPDATE "Media" AS resized
SET "sourceMediaId" = original.id
FROM "Media" AS original
WHERE resized."sourceMediaId" IS NULL
  AND resized."filename" LIKE 'resized-%'
  AND original."filename" = SUBSTRING(resized."filename" FROM 9)
  AND original."organizationId" = resized."organizationId"
  AND original."sourceMediaId" IS NULL;
