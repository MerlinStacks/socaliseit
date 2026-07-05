ALTER TABLE "SebRecommendation"
ADD COLUMN IF NOT EXISTS "socialAccountId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SebRecommendation_socialAccountId_fkey'
  ) THEN
    ALTER TABLE "SebRecommendation"
    ADD CONSTRAINT "SebRecommendation_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SebRecommendation_organizationId_socialAccountId_status_idx"
ON "SebRecommendation"("organizationId", "socialAccountId", "status");
