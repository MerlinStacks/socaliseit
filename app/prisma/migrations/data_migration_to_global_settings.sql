-- =====================================================
-- Data Migration: Org-Level Settings → Global Settings
-- =====================================================
-- Run this BEFORE deploying the new schema migration
-- This script copies existing data to the new global tables
-- =====================================================

-- Step 1: Create global tables if they don't exist yet
-- (These will be created by Prisma migration, but this is safe to run regardless)

-- Step 2: Migrate Platform Credentials
-- Strategy: Take the most recently updated credential for each platform
-- (In case multiple orgs have the same platform configured)

INSERT INTO "GlobalPlatformCredential" (id, platform, "clientId", "clientSecret", "webhookVerifyToken", "isConfigured", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    platform,
    "clientId",
    "clientSecret",
    "webhookVerifyToken",
    "isConfigured",
    NOW(),
    NOW()
FROM "PlatformCredential"
WHERE (platform, "updatedAt") IN (
    SELECT platform, MAX("updatedAt")
    FROM "PlatformCredential"
    GROUP BY platform
)
ON CONFLICT (platform) DO UPDATE SET
    "clientId" = EXCLUDED."clientId",
    "clientSecret" = EXCLUDED."clientSecret",
    "webhookVerifyToken" = EXCLUDED."webhookVerifyToken",
    "isConfigured" = EXCLUDED."isConfigured",
    "updatedAt" = NOW();

-- Step 3: Migrate AI Settings
-- Strategy: Take the most recently updated AI settings

INSERT INTO "GlobalAISettings" (id, "apiKey", "selectedModel", "modelName", "isConfigured", "createdAt", "updatedAt")
SELECT 
    'global_ai_settings',
    "apiKey",
    "selectedModel",
    "modelName",
    "isConfigured",
    NOW(),
    NOW()
FROM "AISettings"
WHERE "isConfigured" = true
ORDER BY "updatedAt" DESC
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
    "apiKey" = EXCLUDED."apiKey",
    "selectedModel" = EXCLUDED."selectedModel",
    "modelName" = EXCLUDED."modelName",
    "isConfigured" = EXCLUDED."isConfigured",
    "updatedAt" = NOW();

-- Step 4: Migrate Integration Settings (Late.dev)
-- Strategy: Take the most recently updated integration settings

INSERT INTO "GlobalIntegrationSettings" (id, "lateApiKey", "lateProfileId", "createdAt", "updatedAt")
SELECT 
    'global_integration_settings',
    "lateApiKey",
    "lateProfileId",
    NOW(),
    NOW()
FROM "IntegrationSettings"
WHERE "lateApiKey" IS NOT NULL
ORDER BY "updatedAt" DESC
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
    "lateApiKey" = EXCLUDED."lateApiKey",
    "lateProfileId" = EXCLUDED."lateProfileId",
    "updatedAt" = NOW();

-- =====================================================
-- Verification Queries (run these to check the migration)
-- =====================================================

-- Check migrated platform credentials:
-- SELECT * FROM "GlobalPlatformCredential";

-- Check migrated AI settings:
-- SELECT * FROM "GlobalAISettings";

-- Check migrated integration settings:
-- SELECT * FROM "GlobalIntegrationSettings";

-- =====================================================
-- IMPORTANT: After verifying the migration worked,
-- you can deploy the new schema which will drop the old tables.
-- =====================================================
