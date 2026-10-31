CREATE TABLE "PublishingApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PublishingApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublishingApiKey_keyHash_key" ON "PublishingApiKey"("keyHash");
CREATE INDEX "PublishingApiKey_organizationId_idx" ON "PublishingApiKey"("organizationId");
ALTER TABLE "PublishingApiKey" ADD CONSTRAINT "PublishingApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingApiKey" ADD CONSTRAINT "PublishingApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PublishingRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublishingRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublishingRequest_organizationId_requestId_key" ON "PublishingRequest"("organizationId", "requestId");
ALTER TABLE "PublishingRequest" ADD CONSTRAINT "PublishingRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
