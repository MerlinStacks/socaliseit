-- CreateEnum
CREATE TYPE "SebExperimentStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "GlobalAISettings"
ADD COLUMN "sebMaxReportsPerDay" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "sebMaxChatsPerDay" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "sebMaxVideosPerReport" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "SebReport" ADD COLUMN "scoreBreakdown" JSONB;

-- AlterTable
ALTER TABLE "SebRecommendation"
ADD COLUMN "citations" JSONB,
ADD COLUMN "impactBaseline" JSONB,
ADD COLUMN "impactResult" JSONB,
ADD COLUMN "impactCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SebBrandKnowledge" ADD COLUMN "pendingInsights" JSONB;

-- AlterTable
ALTER TABLE "SebPlatformKnowledge"
ADD COLUMN "effectiveAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8;

-- AlterTable
ALTER TABLE "SebMediaAnalysis"
ADD COLUMN "ocrText" TEXT,
ADD COLUMN "transcript" TEXT,
ADD COLUMN "sceneSummary" TEXT;

-- CreateTable
CREATE TABLE "SebExperiment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT,
    "title" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "platform" "Platform",
    "metric" TEXT NOT NULL,
    "status" "SebExperimentStatus" NOT NULL DEFAULT 'PLANNED',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "baseline" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SebExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SebExperiment_organizationId_status_idx" ON "SebExperiment"("organizationId", "status");
CREATE INDEX "SebExperiment_reportId_idx" ON "SebExperiment"("reportId");

-- AddForeignKey
ALTER TABLE "SebExperiment" ADD CONSTRAINT "SebExperiment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SebExperiment" ADD CONSTRAINT "SebExperiment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SebReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
