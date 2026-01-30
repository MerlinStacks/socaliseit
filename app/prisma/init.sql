-- SocialiseIT Database Schema
-- Essential tables for auth and core functionality

CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  "emailVerified" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
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
  expires TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  identifier TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires TIMESTAMP NOT NULL,
  UNIQUE(identifier, token)
);

CREATE TABLE IF NOT EXISTS "Workspace" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  timezone TEXT DEFAULT 'UTC',
  "accentColor" TEXT DEFAULT '#D4A574',
  "accentColorAlt" TEXT DEFAULT '#E8B4B8',
  "darkMode" BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP DEFAULT NOW(),
  UNIQUE("workspaceId", "userId")
);

CREATE TABLE IF NOT EXISTS "SocialAccount" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
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
  UNIQUE("workspaceId", platform, "platformId")
);
