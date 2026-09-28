ALTER TABLE "Organization" ADD COLUMN "mediaAutoTagEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Media" ADD COLUMN "aiTagStatus" TEXT, ADD COLUMN "aiTagError" TEXT;
