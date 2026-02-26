-- =====================================================
-- Data Migration: Org-Level Settings → Global Settings
-- =====================================================
-- Idempotent: Each block checks whether the legacy source table still exists
-- before attempting to read from it. Once the old tables are dropped by
-- Prisma schema push, these blocks become no-ops with zero errors.
-- =====================================================

-- Step 1: Migrate Platform Credentials
-- Why guard: "PlatformCredential" was replaced by "GlobalPlatformCredential"
-- and may no longer exist in the database.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PlatformCredential'
    ) THEN
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
    END IF;
END $$;

-- Step 2: Migrate AI Settings
-- Why guard: "AISettings" was replaced by "GlobalAISettings"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'AISettings'
    ) THEN
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
    END IF;
END $$;

-- Step 3: Migrate Integration Settings (Late.dev)
-- Why guard: "IntegrationSettings" was replaced by "GlobalIntegrationSettings"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'IntegrationSettings'
    ) THEN
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
    END IF;
END $$;
