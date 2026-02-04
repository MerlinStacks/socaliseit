-- Fix organizationId Migration
-- This script populates organizationId for existing rows before making it required
-- Run this BEFORE prisma db push

-- ============================================================================
-- STEP 1: Create a default organization if none exists
-- ============================================================================

INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
SELECT 
    'default_org_migration',
    'Default Organization',
    'default-org',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Organization" LIMIT 1);

-- ============================================================================
-- STEP 2: Get the first organization ID to use as default
-- ============================================================================

DO $$
DECLARE
    default_org_id TEXT;
BEGIN
    -- Get the first available organization
    SELECT id INTO default_org_id FROM "Organization" LIMIT 1;
    
    IF default_org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found! Cannot proceed with migration.';
    END IF;
    
    RAISE NOTICE 'Using organization ID: %', default_org_id;
    
    -- ========================================================================
    -- STEP 3: Update tables with NULL organizationId
    -- ========================================================================
    
    -- AISettings
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AISettings' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "AISettings" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated AISettings';
    END IF;
    
    -- Activity
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Activity' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "Activity" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated Activity';
    END IF;
    
    -- Comment
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Comment' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "Comment" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated Comment';
    END IF;
    
    -- IntegrationSettings
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'IntegrationSettings' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "IntegrationSettings" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated IntegrationSettings';
    END IF;
    
    -- Media
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Media' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "Media" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated Media';
    END IF;
    
    -- Mention
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mention' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "Mention" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated Mention';
    END IF;
    
    -- PlatformCredential
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PlatformCredential' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "PlatformCredential" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated PlatformCredential';
    END IF;
    
    -- Post
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Post' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "Post" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated Post';
    END IF;
    
    -- SocialAccount
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SocialAccount' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "SocialAccount" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated SocialAccount';
    END IF;
    
    -- VapidKeyPair
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'VapidKeyPair' AND column_name = 'organizationId') THEN
        EXECUTE format('UPDATE "VapidKeyPair" SET "organizationId" = %L WHERE "organizationId" IS NULL', default_org_id);
        RAISE NOTICE 'Updated VapidKeyPair';
    END IF;
    
END $$;

-- ============================================================================
-- STEP 4: Add organizationId columns if they don't exist yet
-- (for tables that never had the column)
-- ============================================================================

DO $$
DECLARE
    default_org_id TEXT;
BEGIN
    SELECT id INTO default_org_id FROM "Organization" LIMIT 1;
    
    -- AISettings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AISettings' AND column_name = 'organizationId') THEN
        ALTER TABLE "AISettings" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "AISettings" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- Activity
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Activity' AND column_name = 'organizationId') THEN
        ALTER TABLE "Activity" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "Activity" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- Comment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Comment' AND column_name = 'organizationId') THEN
        ALTER TABLE "Comment" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "Comment" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- IntegrationSettings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'IntegrationSettings' AND column_name = 'organizationId') THEN
        ALTER TABLE "IntegrationSettings" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "IntegrationSettings" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- Media
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Media' AND column_name = 'organizationId') THEN
        ALTER TABLE "Media" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "Media" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- Mention
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mention' AND column_name = 'organizationId') THEN
        ALTER TABLE "Mention" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "Mention" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- PlatformCredential
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PlatformCredential' AND column_name = 'organizationId') THEN
        ALTER TABLE "PlatformCredential" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "PlatformCredential" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- Post
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Post' AND column_name = 'organizationId') THEN
        ALTER TABLE "Post" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "Post" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- SocialAccount
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SocialAccount' AND column_name = 'organizationId') THEN
        ALTER TABLE "SocialAccount" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "SocialAccount" SET "organizationId" = %L', default_org_id);
    END IF;
    
    -- VapidKeyPair
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'VapidKeyPair' AND column_name = 'organizationId') THEN
        ALTER TABLE "VapidKeyPair" ADD COLUMN "organizationId" TEXT;
        EXECUTE format('UPDATE "VapidKeyPair" SET "organizationId" = %L', default_org_id);
    END IF;

END $$;

-- Migration complete - now prisma db push should succeed
