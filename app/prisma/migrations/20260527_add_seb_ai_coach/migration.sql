-- CreateEnum
CREATE TYPE "SebReportTrigger" AS ENUM ('PROACTIVE', 'MANUAL', 'CHAT');

-- CreateEnum
CREATE TYPE "SebReportStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SebRecommendationCategory" AS ENUM ('CONTENT_STRATEGY', 'CAPTION', 'CREATIVE', 'VIDEO', 'TIMING', 'HASHTAG', 'PLATFORM', 'COMPETITOR', 'BRAND');

-- CreateEnum
CREATE TYPE "SebRecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SebRecommendationStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SebChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- AlterTable
ALTER TABLE "GlobalAISettings"
ADD COLUMN "sebEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sebProactiveEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sebModel" TEXT,
ADD COLUMN "sebModelName" TEXT,
ADD COLUMN "sebSystemPrompt" TEXT,
ADD COLUMN "sebTemperature" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
ADD COLUMN "sebRefreshCadence" TEXT NOT NULL DEFAULT 'daily',
ADD COLUMN "sebMaxVideoFrames" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "SebReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trigger" "SebReportTrigger" NOT NULL DEFAULT 'PROACTIVE',
    "status" "SebReportStatus" NOT NULL DEFAULT 'COMPLETED',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "model" TEXT,
    "inputHash" TEXT,
    "dataStartDate" TIMESTAMP(3),
    "dataEndDate" TIMESTAMP(3),
    "generatedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SebReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SebRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT,
    "platform" "Platform",
    "category" "SebRecommendationCategory" NOT NULL,
    "priority" "SebRecommendationPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "SebRecommendationStatus" NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "advice" TEXT NOT NULL,
    "rationale" TEXT,
    "evidence" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SebRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SebBrandKnowledge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "audience" TEXT,
    "positioning" TEXT,
    "products" TEXT,
    "offers" TEXT,
    "voiceRules" TEXT,
    "bannedTopics" TEXT,
    "learnedInsights" JSONB,
    "updatedBySebAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SebBrandKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SebChatSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Seb chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SebChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SebChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "SebChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SebChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SebPlatformKnowledge" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SebPlatformKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SebMediaAnalysis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "mediaHash" TEXT,
    "model" TEXT,
    "frameCount" INTEGER NOT NULL DEFAULT 0,
    "analysis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SebMediaAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SebReport_organizationId_createdAt_idx" ON "SebReport"("organizationId", "createdAt");
CREATE INDEX "SebReport_organizationId_status_idx" ON "SebReport"("organizationId", "status");
CREATE INDEX "SebRecommendation_organizationId_status_idx" ON "SebRecommendation"("organizationId", "status");
CREATE INDEX "SebRecommendation_organizationId_platform_idx" ON "SebRecommendation"("organizationId", "platform");
CREATE INDEX "SebRecommendation_reportId_idx" ON "SebRecommendation"("reportId");
CREATE UNIQUE INDEX "SebBrandKnowledge_organizationId_key" ON "SebBrandKnowledge"("organizationId");
CREATE INDEX "SebChatSession_organizationId_updatedAt_idx" ON "SebChatSession"("organizationId", "updatedAt");
CREATE INDEX "SebChatSession_userId_idx" ON "SebChatSession"("userId");
CREATE INDEX "SebChatMessage_sessionId_createdAt_idx" ON "SebChatMessage"("sessionId", "createdAt");
CREATE INDEX "SebPlatformKnowledge_platform_isActive_idx" ON "SebPlatformKnowledge"("platform", "isActive");
CREATE UNIQUE INDEX "SebMediaAnalysis_mediaId_mediaHash_key" ON "SebMediaAnalysis"("mediaId", "mediaHash");
CREATE INDEX "SebMediaAnalysis_organizationId_idx" ON "SebMediaAnalysis"("organizationId");

-- AddForeignKey
ALTER TABLE "SebReport" ADD CONSTRAINT "SebReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebRecommendation" ADD CONSTRAINT "SebRecommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebRecommendation" ADD CONSTRAINT "SebRecommendation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SebReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebBrandKnowledge" ADD CONSTRAINT "SebBrandKnowledge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebChatSession" ADD CONSTRAINT "SebChatSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebChatMessage" ADD CONSTRAINT "SebChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SebChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebMediaAnalysis" ADD CONSTRAINT "SebMediaAnalysis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebMediaAnalysis" ADD CONSTRAINT "SebMediaAnalysis_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
