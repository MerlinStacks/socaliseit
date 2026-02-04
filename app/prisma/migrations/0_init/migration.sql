-- =============================================================================
-- SocialiseIT Baseline Migration
-- Creates all tables for a fresh database installation
-- =============================================================================

-- ============================================================================
-- AUTHENTICATION & CORE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    image TEXT,
    password TEXT,
    "emailVerified" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "isSuperAdmin" BOOLEAN DEFAULT FALSE,
    "twoFactorEnabled" BOOLEAN DEFAULT FALSE,
    "twoFactorSecret" TEXT,
    "backupCodes" TEXT[]
);

CREATE TABLE IF NOT EXISTS "Account" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    UNIQUE(provider, "providerAccountId"),
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Session" (
    id TEXT PRIMARY KEY,
    "sessionToken" TEXT UNIQUE NOT NULL,
    "userId" TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "deviceName" TEXT,
    "lastUsedAt" TIMESTAMP DEFAULT NOW(),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
    identifier TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires TIMESTAMP NOT NULL,
    UNIQUE(identifier, token)
);

-- ============================================================================
-- ORGANIZATION (PRIMARY TENANT)
-- ============================================================================

CREATE TYPE "OrganizationTier" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE');
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'CUSTOM');

CREATE TABLE IF NOT EXISTS "Organization" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo TEXT,
    tier "OrganizationTier" DEFAULT 'FREE',
    "maxMembers" INTEGER DEFAULT 5,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    timezone TEXT DEFAULT 'UTC',
    "accentColor" TEXT DEFAULT '#D4A574',
    "accentColorAlt" TEXT DEFAULT '#E8B4B8',
    "darkMode" BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "OrganizationMember" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    role "Role" DEFAULT 'MEMBER',
    "customRoleId" TEXT,
    "joinedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", "userId"),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_customRoleId_idx" ON "OrganizationMember"("customRoleId");
CREATE INDEX IF NOT EXISTS "Organization_tier_idx" ON "Organization"(tier);

-- ============================================================================
-- PLATFORM SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    id TEXT PRIMARY KEY DEFAULT 'platform_settings',
    "registrationEnabled" BOOLEAN DEFAULT TRUE,
    "maintenanceMode" BOOLEAN DEFAULT FALSE,
    "maintenanceMessage" TEXT,
    "maxOrganizationsPerUser" INTEGER DEFAULT 5,
    "maxMembersPerOrganization" INTEGER DEFAULT 20,
    "rateLimitRequestsPerMinute" INTEGER DEFAULT 100,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AuditLog" (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT,
    "targetType" TEXT,
    metadata JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_targetId_idx" ON "AuditLog"("targetId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"(action);
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ============================================================================
-- SOCIAL ACCOUNTS
-- ============================================================================

CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS', 'LINKEDIN', 'BLUESKY');

CREATE TABLE IF NOT EXISTS "SocialAccount" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    platform "Platform" NOT NULL,
    "platformId" TEXT NOT NULL,
    name TEXT NOT NULL,
    username TEXT,
    avatar TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", platform, "platformId"),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SocialAccount_organizationId_idx" ON "SocialAccount"("organizationId");

-- ============================================================================
-- PLATFORM CREDENTIALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PlatformCredential" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    platform "Platform" NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "webhookVerifyToken" TEXT,
    "isConfigured" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", platform),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

-- ============================================================================
-- AI SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AISettings" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT UNIQUE NOT NULL,
    "apiKey" TEXT NOT NULL,
    "selectedModel" TEXT,
    "modelName" TEXT,
    "isConfigured" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

-- ============================================================================
-- INTEGRATION SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "IntegrationSettings" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT UNIQUE NOT NULL,
    "lateApiKey" TEXT,
    "lateProfileId" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

-- ============================================================================
-- CONTENT & POSTS
-- ============================================================================

CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');
CREATE TYPE "PostType" AS ENUM ('FEED', 'REEL', 'STORY', 'CAROUSEL', 'PIN', 'VIDEO', 'ARTICLE', 'THREAD');

CREATE TABLE IF NOT EXISTS "ContentPillar" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#D4A574',
    icon TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", name),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Post" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    caption TEXT NOT NULL,
    status "PostStatus" DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP,
    "publishedAt" TIMESTAMP,
    "autoPublish" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "firstComment" TEXT,
    "viralityScore" FLOAT,
    "brandVoiceScore" FLOAT,
    "isExternal" BOOLEAN DEFAULT FALSE,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "externalThumbnailUrl" TEXT,
    "syncedAt" TIMESTAMP,
    "pillarId" TEXT,
    UNIQUE("organizationId", "externalId"),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
    FOREIGN KEY ("pillarId") REFERENCES "ContentPillar"(id)
);

CREATE INDEX IF NOT EXISTS "Post_organizationId_status_idx" ON "Post"("organizationId", status);
CREATE INDEX IF NOT EXISTS "Post_organizationId_scheduledAt_idx" ON "Post"("organizationId", "scheduledAt");

CREATE TABLE IF NOT EXISTS "PostPlatform" (
    id TEXT PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platformPostId" TEXT,
    caption TEXT,
    "postType" "PostType" DEFAULT 'FEED',
    "callToAction" TEXT,
    "customMediaIds" TEXT[],
    "firstComment" TEXT,
    status "PostStatus" DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP,
    UNIQUE("postId", "socialAccountId"),
    FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE CASCADE,
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"(id) ON DELETE CASCADE
);

-- ============================================================================
-- MEDIA LIBRARY
-- ============================================================================

CREATE TABLE IF NOT EXISTS "MediaFolder" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", name),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MediaFolder_organizationId_idx" ON "MediaFolder"("organizationId");

CREATE TABLE IF NOT EXISTS "Media" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "folderId" TEXT,
    filename TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration FLOAT,
    url TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "altText" TEXT,
    tags TEXT[],
    "aiTags" TEXT[],
    "createdAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
    FOREIGN KEY ("folderId") REFERENCES "MediaFolder"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Media_organizationId_createdAt_idx" ON "Media"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Media_folderId_idx" ON "Media"("folderId");

CREATE TABLE IF NOT EXISTS "PostMedia" (
    id TEXT PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    UNIQUE("postId", "mediaId"),
    FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE CASCADE,
    FOREIGN KEY ("mediaId") REFERENCES "Media"(id)
);

-- ============================================================================
-- HASHTAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Hashtag" (
    id TEXT PRIMARY KEY,
    tag TEXT UNIQUE NOT NULL,
    "isBanned" BOOLEAN DEFAULT FALSE,
    "usageCount" INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "PostHashtag" (
    id TEXT PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,
    UNIQUE("postId", "hashtagId"),
    FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE CASCADE,
    FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"(id)
);

-- ============================================================================
-- BRAND VOICE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "BrandVoice" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT UNIQUE NOT NULL,
    samples TEXT[],
    "toneProfile" JSONB,
    guidelines TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

-- ============================================================================
-- COMMERCE
-- ============================================================================

CREATE TYPE "CatalogSource" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'MANUAL');
CREATE TYPE "ShopSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED');

CREATE TABLE IF NOT EXISTS "ProductCatalog" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT UNIQUE NOT NULL,
    source "CatalogSource" NOT NULL,
    "externalId" TEXT,
    "syncedAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Product" (
    id TEXT PRIMARY KEY,
    "catalogId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price FLOAT NOT NULL,
    currency TEXT DEFAULT 'USD',
    "imageUrl" TEXT,
    "productUrl" TEXT,
    "isActive" BOOLEAN DEFAULT TRUE,
    "syncedAt" TIMESTAMP DEFAULT NOW(),
    "instagramProductId" TEXT,
    "facebookProductId" TEXT,
    "pinterestProductId" TEXT,
    "tiktokProductId" TEXT,
    "youtubeProductId" TEXT,
    UNIQUE("catalogId", "externalId"),
    FOREIGN KEY ("catalogId") REFERENCES "ProductCatalog"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "PostProduct" (
    id TEXT PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    UNIQUE("postId", "productId"),
    FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE CASCADE,
    FOREIGN KEY ("productId") REFERENCES "Product"(id)
);

CREATE TABLE IF NOT EXISTS "ShopConnection" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    platform "Platform" NOT NULL,
    "catalogId" TEXT NOT NULL,
    name TEXT NOT NULL,
    "isActive" BOOLEAN DEFAULT TRUE,
    "syncStatus" "ShopSyncStatus" DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", platform),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ShopConnection_organizationId_idx" ON "ShopConnection"("organizationId");

CREATE TABLE IF NOT EXISTS "ProductTag" (
    id TEXT PRIMARY KEY,
    "postPlatformId" TEXT NOT NULL,
    "productId" TEXT,
    "platformProductId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productPrice" FLOAT,
    "productCurrency" TEXT,
    "productImageUrl" TEXT,
    "mediaIndex" INTEGER DEFAULT 0,
    "positionX" FLOAT,
    "positionY" FLOAT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("postPlatformId") REFERENCES "PostPlatform"(id) ON DELETE CASCADE,
    FOREIGN KEY ("productId") REFERENCES "Product"(id)
);

CREATE INDEX IF NOT EXISTS "ProductTag_postPlatformId_idx" ON "ProductTag"("postPlatformId");
CREATE INDEX IF NOT EXISTS "ProductTag_productId_idx" ON "ProductTag"("productId");

-- ============================================================================
-- ERROR LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PublishError" (
    id TEXT PRIMARY KEY,
    "postId" TEXT NOT NULL,
    platform "Platform" NOT NULL,
    "errorCode" TEXT NOT NULL,
    "errorRaw" TEXT NOT NULL,
    "errorHuman" TEXT NOT NULL,
    suggestion TEXT,
    "occurredAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PublishError_postId_idx" ON "PublishError"("postId");

-- ============================================================================
-- ACTIVITY TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Activity" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    action TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    metadata JSONB,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Activity_organizationId_createdAt_idx" ON "Activity"("organizationId", "createdAt");

-- ============================================================================
-- AUTOMATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Automation" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    trigger TEXT NOT NULL,
    conditions JSONB,
    actions JSONB NOT NULL,
    "isActive" BOOLEAN DEFAULT TRUE,
    "lastTriggeredAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Automation_organizationId_idx" ON "Automation"("organizationId");

-- ============================================================================
-- COMPETITORS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Competitor" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    platform "Platform" NOT NULL,
    "platformId" TEXT NOT NULL,
    username TEXT,
    avatar TEXT,
    notes TEXT,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Competitor_organizationId_idx" ON "Competitor"("organizationId");

-- ============================================================================
-- VAPID KEYS FOR PUSH NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "VapidKeyPair" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT UNIQUE NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    auth TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- ============================================================================
-- ENGAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Comment" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "postPlatformId" TEXT,
    "parentId" TEXT,
    content TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUsername" TEXT,
    "authorAvatar" TEXT,
    "authorPlatformId" TEXT,
    sentiment TEXT,
    "isReplied" BOOLEAN DEFAULT FALSE,
    "repliedAt" TIMESTAMP,
    "replyContent" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "fetchedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"(id) ON DELETE CASCADE,
    FOREIGN KEY ("parentId") REFERENCES "Comment"(id)
);

CREATE INDEX IF NOT EXISTS "Comment_organizationId_idx" ON "Comment"("organizationId");
CREATE INDEX IF NOT EXISTS "Comment_socialAccountId_idx" ON "Comment"("socialAccountId");

CREATE TABLE IF NOT EXISTS "Mention" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platformMentionId" TEXT NOT NULL,
    content TEXT,
    "authorName" TEXT NOT NULL,
    "authorUsername" TEXT,
    "authorAvatar" TEXT,
    "authorPlatformId" TEXT,
    url TEXT,
    sentiment TEXT,
    "isReplied" BOOLEAN DEFAULT FALSE,
    "repliedAt" TIMESTAMP,
    "replyContent" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "fetchedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Mention_organizationId_idx" ON "Mention"("organizationId");
CREATE INDEX IF NOT EXISTS "Mention_socialAccountId_idx" ON "Mention"("socialAccountId");

-- ============================================================================
-- ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PlatformAnalytics" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    date DATE NOT NULL,
    followers INTEGER,
    "followersGrowth" INTEGER,
    impressions INTEGER,
    reach INTEGER,
    engagement INTEGER,
    "engagementRate" FLOAT,
    clicks INTEGER,
    shares INTEGER,
    saves INTEGER,
    "profileViews" INTEGER,
    "websiteClicks" INTEGER,
    "emailClicks" INTEGER,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("socialAccountId", date),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlatformAnalytics_organizationId_idx" ON "PlatformAnalytics"("organizationId");
CREATE INDEX IF NOT EXISTS "PlatformAnalytics_socialAccountId_date_idx" ON "PlatformAnalytics"("socialAccountId", date);

CREATE TABLE IF NOT EXISTS "PostAnalytics" (
    id TEXT PRIMARY KEY,
    "postPlatformId" TEXT UNIQUE NOT NULL,
    impressions INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    "videoViews" INTEGER DEFAULT 0,
    "engagementRate" FLOAT,
    "fetchedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("postPlatformId") REFERENCES "PostPlatform"(id) ON DELETE CASCADE
);

-- ============================================================================
-- CAPTION TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS "CaptionTemplate" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    caption TEXT NOT NULL,
    hashtags TEXT[],
    category TEXT,
    "usageCount" INTEGER DEFAULT 0,
    "thumbnailUrl" TEXT,
    "mediaIds" TEXT[],
    platforms "Platform"[],
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", name),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CaptionTemplate_organizationId_idx" ON "CaptionTemplate"("organizationId");

-- ============================================================================
-- VIDEO EDITOR
-- ============================================================================

CREATE TYPE "VideoProjectStatus" AS ENUM ('DRAFT', 'RENDERING', 'RENDERED', 'PUBLISHED');
CREATE TYPE "HighlightStatus" AS ENUM ('PENDING', 'ANALYZING', 'READY', 'FAILED');

CREATE TABLE IF NOT EXISTS "VideoProject" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    "aspectRatio" TEXT DEFAULT 'LANDSCAPE',
    fps INTEGER DEFAULT 30,
    clips JSONB,
    "textOverlays" JSONB,
    "audioClips" JSONB,
    transcription JSONB,
    "audioAnalysis" JSONB,
    "sceneMarkers" JSONB,
    highlights JSONB,
    "highlightStatus" "HighlightStatus" DEFAULT 'PENDING',
    "thumbnailUrl" TEXT,
    duration FLOAT,
    status "VideoProjectStatus" DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "VideoProject_organizationId_updatedAt_idx" ON "VideoProject"("organizationId", "updatedAt");

CREATE TABLE IF NOT EXISTS "VideoTemplate" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    "aspectRatio" TEXT DEFAULT 'LANDSCAPE',
    "durationSec" FLOAT DEFAULT 10,
    config JSONB NOT NULL,
    "thumbnailUrl" TEXT,
    "isBuiltIn" BOOLEAN DEFAULT FALSE,
    "isFeatured" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "VideoTemplate_category_idx" ON "VideoTemplate"(category);
CREATE INDEX IF NOT EXISTS "VideoTemplate_organizationId_idx" ON "VideoTemplate"("organizationId");

CREATE TABLE IF NOT EXISTS "VideoCaption" (
    id TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    segments JSONB NOT NULL,
    style JSONB NOT NULL,
    language TEXT DEFAULT 'en',
    "srtContent" TEXT,
    "vttContent" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("projectId") REFERENCES "VideoProject"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "VideoCaption_projectId_idx" ON "VideoCaption"("projectId");

-- ============================================================================
-- RBAC - CUSTOM ROLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Permission" (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Permission_category_idx" ON "Permission"(category);

CREATE TABLE IF NOT EXISTS "CustomRole" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6B7280',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", name),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CustomRole_organizationId_idx" ON "CustomRole"("organizationId");

-- Add FK for OrganizationMember.customRoleId
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_customRoleId_fkey" 
    FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"(id);

CREATE TABLE IF NOT EXISTS "RolePermission" (
    id TEXT PRIMARY KEY,
    "customRoleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    UNIQUE("customRoleId", "permissionId"),
    FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"(id) ON DELETE CASCADE,
    FOREIGN KEY ("permissionId") REFERENCES "Permission"(id) ON DELETE CASCADE
);

-- ============================================================================
-- UTM & REPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UtmTemplate" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT,
    medium TEXT,
    campaign TEXT,
    term TEXT,
    content TEXT,
    "isDefault" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", name),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "UtmTemplate_organizationId_idx" ON "UtmTemplate"("organizationId");

CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE IF NOT EXISTS "ScheduledReport" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    frequency "ReportFrequency" NOT NULL,
    recipients TEXT[] NOT NULL,
    "socialAccountIds" TEXT[],
    metrics TEXT[],
    "lastSentAt" TIMESTAMP,
    "nextSendAt" TIMESTAMP,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ScheduledReport_organizationId_idx" ON "ScheduledReport"("organizationId");

-- ============================================================================
-- COLLABORATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PostComment" (
    id TEXT PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    content TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY ("postId") REFERENCES "Post"(id) ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PostComment_postId_idx" ON "PostComment"("postId");

-- =============================================================================
-- Baseline migration complete
-- =============================================================================
