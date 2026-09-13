CREATE TYPE "InboxWorkflowStatus" AS ENUM ('OPEN', 'RESOLVED', 'SNOOZED');
CREATE TYPE "InboxEntityType" AS ENUM ('COMMENT', 'MENTION', 'DM', 'REVIEW');

CREATE TABLE "InboxWorkflow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "type" "InboxEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "InboxWorkflowStatus" NOT NULL DEFAULT 'OPEN',
    "snoozedUntil" TIMESTAMP(3),
    "assignedToId" TEXT,
    "labelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboxWorkflow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InboxWorkflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxWorkflow_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxWorkflow_snooze_check" CHECK (("status" = 'SNOOZED' AND "snoozedUntil" IS NOT NULL) OR ("status" <> 'SNOOZED' AND "snoozedUntil" IS NULL))
);
CREATE UNIQUE INDEX "InboxWorkflow_organizationId_type_entityId_socialAccountId_key" ON "InboxWorkflow"("organizationId", "type", "entityId", "socialAccountId");
CREATE INDEX "InboxWorkflow_organizationId_status_snoozedUntil_idx" ON "InboxWorkflow"("organizationId", "status", "snoozedUntil");
CREATE INDEX "InboxWorkflow_organizationId_assignedToId_idx" ON "InboxWorkflow"("organizationId", "assignedToId");
CREATE INDEX "InboxWorkflow_socialAccountId_idx" ON "InboxWorkflow"("socialAccountId");

-- Preserve existing assignment/labels. DM workflow follows the latest message
-- at migration time and is subsequently independent of incoming messages.
INSERT INTO "InboxWorkflow" ("id", "organizationId", "socialAccountId", "type", "entityId", "assignedToId", "labelIds", "updatedAt")
SELECT 'iw_' || md5("organizationId" || ':' || kind || ':' || "socialAccountId" || ':' || entity),
       "organizationId", "socialAccountId", kind::"InboxEntityType", entity, "assignedToId", COALESCE("labelIds", ARRAY[]::TEXT[]), CURRENT_TIMESTAMP
FROM (
    SELECT "organizationId", "socialAccountId", 'COMMENT' AS kind, "id" AS entity, "assignedToId", "labelIds" FROM "Comment"
    UNION ALL
    SELECT "organizationId", "socialAccountId", 'MENTION', "id", "assignedToId", "labelIds" FROM "Mention"
    UNION ALL
    SELECT "organizationId", "socialAccountId", 'DM', "conversationId", "assignedToId", "labelIds" FROM (
        SELECT DISTINCT ON ("organizationId", "socialAccountId", "conversationId") * FROM "DirectMessage"
        ORDER BY "organizationId", "socialAccountId", "conversationId", "createdAt" DESC, "id" DESC
    ) latest
) legacy
WHERE "assignedToId" IS NOT NULL OR cardinality("labelIds") > 0;
