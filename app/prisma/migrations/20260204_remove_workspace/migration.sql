-- Workspace to Organization Migration
-- This migration consolidates the 3-tier model (Organization → Workspace → User) 
-- into a 2-tier model (Organization → User)
--
-- Strategy: Merge workspace data into the organization it belonged to

-- ============================================================================
-- STEP 1: Add organizationId columns where they don't exist yet
-- ============================================================================

-- For tables that had workspaceId, we need to add organizationId
-- Most should already have it from the old org relation, but ensure they exist

-- Skip if column already exists (using DO block for safety)
DO $$ 
BEGIN
    -- Post
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Post' AND column_name = 'organizationId') THEN
        ALTER TABLE "Post" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- SocialAccount
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SocialAccount' AND column_name = 'organizationId') THEN
        ALTER TABLE "SocialAccount" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- ContentPillar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ContentPillar' AND column_name = 'organizationId') THEN
        ALTER TABLE "ContentPillar" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- Media
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Media' AND column_name = 'organizationId') THEN
        ALTER TABLE "Media" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- MediaFolder  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MediaFolder' AND column_name = 'organizationId') THEN
        ALTER TABLE "MediaFolder" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- Template
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Template' AND column_name = 'organizationId') THEN
        ALTER TABLE "Template" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- CannedResponse
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CannedResponse' AND column_name = 'organizationId') THEN
        ALTER TABLE "CannedResponse" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- HashtagGroup
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'HashtagGroup' AND column_name = 'organizationId') THEN
        ALTER TABLE "HashtagGroup" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- Competitor
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Competitor' AND column_name = 'organizationId') THEN
        ALTER TABLE "Competitor" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- PlatformAnalytics
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PlatformAnalytics' AND column_name = 'organizationId') THEN
        ALTER TABLE "PlatformAnalytics" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- PlatformCredential
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PlatformCredential' AND column_name = 'organizationId') THEN
        ALTER TABLE "PlatformCredential" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- ScheduledReport
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ScheduledReport' AND column_name = 'organizationId') THEN
        ALTER TABLE "ScheduledReport" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- ApprovalWorkflow
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ApprovalWorkflow' AND column_name = 'organizationId') THEN
        ALTER TABLE "ApprovalWorkflow" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- Team
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Team' AND column_name = 'organizationId') THEN
        ALTER TABLE "Team" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- IntegrationConfig
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'IntegrationConfig' AND column_name = 'organizationId') THEN
        ALTER TABLE "IntegrationConfig" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- Conversation
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Conversation' AND column_name = 'organizationId') THEN
        ALTER TABLE "Conversation" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- TrendingAudio
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TrendingAudio' AND column_name = 'organizationId') THEN
        ALTER TABLE "TrendingAudio" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- UGCContent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UGCContent' AND column_name = 'organizationId') THEN
        ALTER TABLE "UGCContent" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- ListeningTopic
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ListeningTopic' AND column_name = 'organizationId') THEN
        ALTER TABLE "ListeningTopic" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- ShopProduct
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ShopProduct' AND column_name = 'organizationId') THEN
        ALTER TABLE "ShopProduct" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- ProductTag
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProductTag' AND column_name = 'organizationId') THEN
        ALTER TABLE "ProductTag" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- AuditLog
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AuditLog' AND column_name = 'organizationId') THEN
        ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
    END IF;
    
    -- VideoProject
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'VideoProject' AND column_name = 'organizationId') THEN
        ALTER TABLE "VideoProject" ADD COLUMN "organizationId" TEXT;
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Migrate data from workspaceId to organizationId
-- For each record, look up the workspace's organizationId and use that
-- ============================================================================

-- Only run these if the Workspace table exists (meaning we haven't migrated yet)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Workspace') THEN
        -- Post
        UPDATE "Post" p SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE p."workspaceId" = w.id AND p."organizationId" IS NULL;
        
        -- SocialAccount
        UPDATE "SocialAccount" s SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE s."workspaceId" = w.id AND s."organizationId" IS NULL;
        
        -- ContentPillar
        UPDATE "ContentPillar" c SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE c."workspaceId" = w.id AND c."organizationId" IS NULL;
        
        -- Media
        UPDATE "Media" m SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE m."workspaceId" = w.id AND m."organizationId" IS NULL;
        
        -- MediaFolder
        UPDATE "MediaFolder" mf SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE mf."workspaceId" = w.id AND mf."organizationId" IS NULL;
        
        -- Template
        UPDATE "Template" t SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE t."workspaceId" = w.id AND t."organizationId" IS NULL;
        
        -- CannedResponse
        UPDATE "CannedResponse" cr SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE cr."workspaceId" = w.id AND cr."organizationId" IS NULL;
        
        -- HashtagGroup
        UPDATE "HashtagGroup" hg SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE hg."workspaceId" = w.id AND hg."organizationId" IS NULL;
        
        -- Competitor
        UPDATE "Competitor" c SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE c."workspaceId" = w.id AND c."organizationId" IS NULL;
        
        -- PlatformAnalytics
        UPDATE "PlatformAnalytics" pa SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE pa."workspaceId" = w.id AND pa."organizationId" IS NULL;
        
        -- PlatformCredential
        UPDATE "PlatformCredential" pc SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE pc."workspaceId" = w.id AND pc."organizationId" IS NULL;
        
        -- ScheduledReport
        UPDATE "ScheduledReport" sr SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE sr."workspaceId" = w.id AND sr."organizationId" IS NULL;
        
        -- ApprovalWorkflow
        UPDATE "ApprovalWorkflow" aw SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE aw."workspaceId" = w.id AND aw."organizationId" IS NULL;
        
        -- Team
        UPDATE "Team" t SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE t."workspaceId" = w.id AND t."organizationId" IS NULL;
        
        -- IntegrationConfig
        UPDATE "IntegrationConfig" ic SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE ic."workspaceId" = w.id AND ic."organizationId" IS NULL;
        
        -- Conversation
        UPDATE "Conversation" c SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE c."workspaceId" = w.id AND c."organizationId" IS NULL;
        
        -- TrendingAudio
        UPDATE "TrendingAudio" ta SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE ta."workspaceId" = w.id AND ta."organizationId" IS NULL;
        
        -- UGCContent
        UPDATE "UGCContent" uc SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE uc."workspaceId" = w.id AND uc."organizationId" IS NULL;
        
        -- ListeningTopic
        UPDATE "ListeningTopic" lt SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE lt."workspaceId" = w.id AND lt."organizationId" IS NULL;
        
        -- ShopProduct
        UPDATE "ShopProduct" sp SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE sp."workspaceId" = w.id AND sp."organizationId" IS NULL;
        
        -- ProductTag
        UPDATE "ProductTag" pt SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE pt."workspaceId" = w.id AND pt."organizationId" IS NULL;
        
        -- AuditLog
        UPDATE "AuditLog" al SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE al."workspaceId" = w.id AND al."organizationId" IS NULL;
        
        -- VideoProject
        UPDATE "VideoProject" vp SET "organizationId" = w."organizationId"
        FROM "Workspace" w WHERE vp."workspaceId" = w.id AND vp."organizationId" IS NULL;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Migrate WorkspaceMember to OrganizationMember
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'WorkspaceMember') THEN
        -- Insert workspace members as organization members (if not already members)
        INSERT INTO "OrganizationMember" ("id", "organizationId", "userId", "role", "joinedAt")
        SELECT 
            gen_random_uuid()::text,
            w."organizationId",
            wm."userId",
            wm."role",
            wm."joinedAt"
        FROM "WorkspaceMember" wm
        JOIN "Workspace" w ON wm."workspaceId" = w.id
        ON CONFLICT ("organizationId", "userId") DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Migrate user's currentWorkspaceId to currentOrganizationId
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'currentWorkspaceId') THEN
        -- Add currentOrganizationId if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'currentOrganizationId') THEN
            ALTER TABLE "User" ADD COLUMN "currentOrganizationId" TEXT;
        END IF;
        
        -- Migrate the data
        UPDATE "User" u SET "currentOrganizationId" = w."organizationId"
        FROM "Workspace" w WHERE u."currentWorkspaceId" = w.id AND u."currentOrganizationId" IS NULL;
    END IF;
END $$;

-- ============================================================================
-- STEP 5: Drop old workspaceId columns (after data migration)
-- ============================================================================

DO $$
BEGIN
    -- Only drop if Workspace table still exists (meaning we just migrated)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Workspace') THEN
        -- Drop foreign key constraints first
        ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_workspaceId_fkey";
        ALTER TABLE "SocialAccount" DROP CONSTRAINT IF EXISTS "SocialAccount_workspaceId_fkey";
        ALTER TABLE "ContentPillar" DROP CONSTRAINT IF EXISTS "ContentPillar_workspaceId_fkey";
        ALTER TABLE "Media" DROP CONSTRAINT IF EXISTS "Media_workspaceId_fkey";
        ALTER TABLE "MediaFolder" DROP CONSTRAINT IF EXISTS "MediaFolder_workspaceId_fkey";
        ALTER TABLE "Template" DROP CONSTRAINT IF EXISTS "Template_workspaceId_fkey";
        ALTER TABLE "CannedResponse" DROP CONSTRAINT IF EXISTS "CannedResponse_workspaceId_fkey";
        ALTER TABLE "HashtagGroup" DROP CONSTRAINT IF EXISTS "HashtagGroup_workspaceId_fkey";
        ALTER TABLE "Competitor" DROP CONSTRAINT IF EXISTS "Competitor_workspaceId_fkey";
        ALTER TABLE "PlatformAnalytics" DROP CONSTRAINT IF EXISTS "PlatformAnalytics_workspaceId_fkey";
        ALTER TABLE "PlatformCredential" DROP CONSTRAINT IF EXISTS "PlatformCredential_workspaceId_fkey";
        ALTER TABLE "ScheduledReport" DROP CONSTRAINT IF EXISTS "ScheduledReport_workspaceId_fkey";
        ALTER TABLE "ApprovalWorkflow" DROP CONSTRAINT IF EXISTS "ApprovalWorkflow_workspaceId_fkey";
        ALTER TABLE "Team" DROP CONSTRAINT IF EXISTS "Team_workspaceId_fkey";
        ALTER TABLE "IntegrationConfig" DROP CONSTRAINT IF EXISTS "IntegrationConfig_workspaceId_fkey";
        ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_workspaceId_fkey";
        ALTER TABLE "TrendingAudio" DROP CONSTRAINT IF EXISTS "TrendingAudio_workspaceId_fkey";
        ALTER TABLE "UGCContent" DROP CONSTRAINT IF EXISTS "UGCContent_workspaceId_fkey";
        ALTER TABLE "ListeningTopic" DROP CONSTRAINT IF EXISTS "ListeningTopic_workspaceId_fkey";
        ALTER TABLE "ShopProduct" DROP CONSTRAINT IF EXISTS "ShopProduct_workspaceId_fkey";
        ALTER TABLE "ProductTag" DROP CONSTRAINT IF EXISTS "ProductTag_workspaceId_fkey";
        ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_workspaceId_fkey";
        ALTER TABLE "VideoProject" DROP CONSTRAINT IF EXISTS "VideoProject_workspaceId_fkey";
        ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_currentWorkspaceId_fkey";
        
        -- Drop workspaceId columns
        ALTER TABLE "Post" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "SocialAccount" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "ContentPillar" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "Media" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "MediaFolder" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "Template" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "CannedResponse" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "HashtagGroup" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "Competitor" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "PlatformAnalytics" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "PlatformCredential" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "ScheduledReport" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "ApprovalWorkflow" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "Team" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "IntegrationConfig" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "TrendingAudio" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "UGCContent" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "ListeningTopic" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "ShopProduct" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "ProductTag" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "VideoProject" DROP COLUMN IF EXISTS "workspaceId";
        ALTER TABLE "User" DROP COLUMN IF EXISTS "currentWorkspaceId";
    END IF;
END $$;

-- ============================================================================
-- STEP 6: Drop Workspace and WorkspaceMember tables
-- ============================================================================

DROP TABLE IF EXISTS "WorkspaceMember" CASCADE;
DROP TABLE IF EXISTS "Workspace" CASCADE;

-- ============================================================================
-- STEP 7: Add foreign key constraints for organizationId
-- ============================================================================

-- Add FK constraints (skip if they already exist)
DO $$
BEGIN
    -- Post -> Organization
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Post_organizationId_fkey') THEN
        ALTER TABLE "Post" ADD CONSTRAINT "Post_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
    END IF;
    
    -- SocialAccount -> Organization
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'SocialAccount_organizationId_fkey') THEN
        ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
    END IF;
    
    -- And so on for other tables... (Prisma will handle this on next schema sync)
END $$;

-- ============================================================================
-- STEP 8: Remove maxWorkspaces from Organization (if it exists)
-- ============================================================================

ALTER TABLE "Organization" DROP COLUMN IF EXISTS "maxWorkspaces";

-- Migration complete!
-- The application now uses Organization directly instead of Workspace
