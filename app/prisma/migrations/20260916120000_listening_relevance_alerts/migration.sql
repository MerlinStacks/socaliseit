ALTER TABLE "SocialListeningMonitor"
  ADD COLUMN "matchMode" TEXT NOT NULL DEFAULT 'substring',
  ADD COLUMN "alertsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "alertCooldownMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "alertsEnabledAt" TIMESTAMP(3),
  ADD COLUMN "nextAlertAt" TIMESTAMP(3);
ALTER TABLE "SocialListeningMonitor" ALTER COLUMN "matchMode" SET DEFAULT 'phrase';
ALTER TABLE "SocialListeningMonitor" ADD CONSTRAINT "listening_match_mode" CHECK ("matchMode" IN ('phrase', 'substring'));
ALTER TABLE "SocialListeningMonitor" ADD CONSTRAINT "listening_alert_cooldown" CHECK ("alertCooldownMinutes" BETWEEN 15 AND 1440);
ALTER TABLE "SocialListeningItem"
  ADD COLUMN "isQuestion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "alertPending" BOOLEAN NOT NULL DEFAULT false;
UPDATE "SocialListeningItem" SET "isQuestion" = true WHERE "sentiment" = 'question' OR "content" ~ '[?？]';
-- Old question sentiment lost polarity; neutral is the conservative baseline.
UPDATE "SocialListeningItem" SET "sentiment" = 'neutral' WHERE "sentiment" = 'question';
ALTER TABLE "NotificationSettings" ADD COLUMN "listeningAlerts" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "SocialListeningItem_organizationId_monitorId_alertPending_idx" ON "SocialListeningItem"("organizationId", "monitorId", "alertPending");
CREATE INDEX "SocialListeningItem_organizationId_isQuestion_idx" ON "SocialListeningItem"("organizationId", "isQuestion");
