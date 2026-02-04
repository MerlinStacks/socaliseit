-- SocialiseIT Database Schema (Fresh Install)
-- Essential tables for auth and core functionality
-- NOTE: For production, use prisma migrate deploy instead

-- This file is deprecated - use prisma migrations instead
-- Kept for reference only

-- =============================================================================
-- AUTHENTICATION
-- =============================================================================

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
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
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
    UNIQUE(provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "Session" (
    id TEXT PRIMARY KEY,
    "sessionToken" TEXT UNIQUE NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    expires TIMESTAMP NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "deviceName" TEXT,
    "lastUsedAt" TIMESTAMP DEFAULT NOW(),
    "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
    identifier TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires TIMESTAMP NOT NULL,
    UNIQUE(identifier, token)
);

-- =============================================================================
-- ORGANIZATION (PRIMARY TENANT)
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "OrganizationTier" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'CUSTOM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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
    "organizationId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    role "Role" DEFAULT 'MEMBER',
    "customRoleId" TEXT,
    "joinedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("organizationId", "userId")
);

-- =============================================================================
-- SOCIAL ACCOUNTS
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS', 'LINKEDIN', 'BLUESKY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "SocialAccount" (
    id TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
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
    UNIQUE("organizationId", platform, "platformId")
);
