-- Publishing Queues: per-profile slot templates that bulk content is distributed into.
-- Additive only: queue ownership is a nullable relation from PublishingQueueItem to Post.

-- CreateEnum
CREATE TYPE "QueueFillMode" AS ENUM ('NEXT', 'LAST', 'AVAILABLE');
CREATE TYPE "QueueItemStatus" AS ENUM ('PENDING', 'SCHEDULED', 'CANCELLED', 'FAILED');
CREATE TYPE "BulkUploadKind" AS ENUM ('FILES', 'CSV', 'LIBRARY', 'API');
CREATE TYPE "BulkUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLING', 'CANCELLED');
CREATE TYPE "BulkUploadItemStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "PublishingQueue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingQueueSlot" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "time" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingQueueSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingQueueItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "queueId" TEXT,
    "bulkItemId" TEXT,
    "targetAccountId" TEXT,
    "postId" TEXT,
    "mode" "QueueFillMode" NOT NULL DEFAULT 'AVAILABLE',
    "status" "QueueItemStatus" NOT NULL DEFAULT 'PENDING',
    "slotId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkUploadBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT,
    "kind" "BulkUploadKind" NOT NULL,
    "status" "BulkUploadStatus" NOT NULL DEFAULT 'PENDING',
    "socialAccountIds" TEXT[],
    "label" TEXT,
    "mode" "QueueFillMode" NOT NULL DEFAULT 'AVAILABLE',
    "pillarId" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkUploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkUploadItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "caption" TEXT NOT NULL,
    "mediaId" TEXT,
    "requiresMedia" BOOLEAN NOT NULL DEFAULT false,
    "sourceName" TEXT,
    "status" "BulkUploadItemStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkUploadItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishingQueue_socialAccountId_label_key" ON "PublishingQueue"("socialAccountId", "label");
CREATE INDEX "PublishingQueue_organizationId_idx" ON "PublishingQueue"("organizationId");
CREATE INDEX "PublishingQueueSlot_queueId_idx" ON "PublishingQueueSlot"("queueId");
CREATE INDEX "PublishingQueueItem_bulkItemId_idx" ON "PublishingQueueItem"("bulkItemId");
CREATE UNIQUE INDEX "PublishingQueueItem_bulkItemId_targetAccountId_key" ON "PublishingQueueItem"("bulkItemId", "targetAccountId");
CREATE UNIQUE INDEX "PublishingQueueItem_postId_key" ON "PublishingQueueItem"("postId");
CREATE INDEX "PublishingQueueItem_queueId_status_scheduledAt_idx" ON "PublishingQueueItem"("queueId", "status", "scheduledAt");
CREATE INDEX "PublishingQueueItem_organizationId_status_idx" ON "PublishingQueueItem"("organizationId", "status");
CREATE INDEX "BulkUploadBatch_organizationId_status_createdAt_idx" ON "BulkUploadBatch"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "BulkUploadItem_batchId_position_key" ON "BulkUploadItem"("batchId", "position");
CREATE INDEX "BulkUploadItem_batchId_status_idx" ON "BulkUploadItem"("batchId", "status");

-- AddForeignKey
ALTER TABLE "PublishingQueue" ADD CONSTRAINT "PublishingQueue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingQueue" ADD CONSTRAINT "PublishingQueue_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingQueueSlot" ADD CONSTRAINT "PublishingQueueSlot_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "PublishingQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingQueueItem" ADD CONSTRAINT "PublishingQueueItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingQueueItem" ADD CONSTRAINT "PublishingQueueItem_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "PublishingQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishingQueueItem" ADD CONSTRAINT "PublishingQueueItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishingQueueItem" ADD CONSTRAINT "PublishingQueueItem_bulkItemId_fkey" FOREIGN KEY ("bulkItemId") REFERENCES "BulkUploadItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkUploadBatch" ADD CONSTRAINT "BulkUploadBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkUploadBatch" ADD CONSTRAINT "BulkUploadBatch_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ContentPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BulkUploadItem" ADD CONSTRAINT "BulkUploadItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BulkUploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkUploadItem" ADD CONSTRAINT "BulkUploadItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
