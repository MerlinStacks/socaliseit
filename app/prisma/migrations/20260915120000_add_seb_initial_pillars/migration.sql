ALTER TABLE "Organization" ADD COLUMN "pillarsInitializedAt" TIMESTAMP(3);
ALTER TABLE "ContentPillar" ADD COLUMN "createdBySeb" BOOLEAN NOT NULL DEFAULT false;

-- Existing taxonomies are user-owned, including after their last pillar is removed.
UPDATE "Organization" o SET "pillarsInitializedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "ContentPillar" p WHERE p."organizationId" = o.id);
