CREATE UNIQUE INDEX "InboxWorkflow_id_organizationId_key" ON "InboxWorkflow"("id", "organizationId");

CREATE TABLE "InboxNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "mentions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InboxNote_workflowId_organizationId_fkey" FOREIGN KEY ("workflowId", "organizationId") REFERENCES "InboxWorkflow"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InboxNote_workflowId_authorId_requestId_key" ON "InboxNote"("workflowId", "authorId", "requestId");
CREATE INDEX "InboxNote_organizationId_workflowId_createdAt_id_idx" ON "InboxNote"("organizationId", "workflowId", "createdAt", "id");

CREATE TABLE "InboxActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InboxActivity_workflowId_organizationId_fkey" FOREIGN KEY ("workflowId", "organizationId") REFERENCES "InboxWorkflow"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InboxActivity_organizationId_workflowId_createdAt_id_idx" ON "InboxActivity"("organizationId", "workflowId", "createdAt", "id");
