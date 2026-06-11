-- =====================================================
-- Add Social Listening Monitors and Normalized Results
-- =====================================================

CREATE TABLE IF NOT EXISTS "SocialListeningMonitor" (
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[] NOT NULL,
    "excludedTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "platforms" "Platform"[] NOT NULL DEFAULT ARRAY[]::"Platform"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialListeningMonitor_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SocialListeningItem" (
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "platform" "Platform" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "authorName" TEXT,
    "authorAvatar" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "matchedKeywords" TEXT[] NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialListeningItem_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialListeningItem_monitorId_fkey"
        FOREIGN KEY ("monitorId") REFERENCES "SocialListeningMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialListeningItem_socialAccountId_fkey"
        FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialListeningItem_monitorId_sourceType_sourceId_key"
    ON "SocialListeningItem"("monitorId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "SocialListeningMonitor_organizationId_isActive_idx"
    ON "SocialListeningMonitor"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "SocialListeningItem_organizationId_occurredAt_idx"
    ON "SocialListeningItem"("organizationId", "occurredAt");
CREATE INDEX IF NOT EXISTS "SocialListeningItem_organizationId_sentiment_idx"
    ON "SocialListeningItem"("organizationId", "sentiment");
CREATE INDEX IF NOT EXISTS "SocialListeningItem_monitorId_occurredAt_idx"
    ON "SocialListeningItem"("monitorId", "occurredAt");

CREATE TABLE IF NOT EXISTS "SocialListeningSource" (
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'auto',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "crawlDepth" INTEGER NOT NULL DEFAULT 0,
    "lastCrawledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialListeningSource_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SocialListeningSource_organizationId_isActive_idx"
    ON "SocialListeningSource"("organizationId", "isActive");
