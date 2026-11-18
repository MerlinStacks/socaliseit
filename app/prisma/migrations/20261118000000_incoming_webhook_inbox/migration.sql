CREATE TABLE "IncomingWebhook" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "IncomingWebhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncomingWebhook_runAt_idx" ON "IncomingWebhook"("runAt");
CREATE INDEX "IncomingWebhook_expiresAt_idx" ON "IncomingWebhook"("expiresAt");
