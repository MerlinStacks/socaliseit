---
name: add-platform-api
description: How to add or modify a social platform integration (OAuth, publishing, analytics, comments)
---

# Add / Modify a Platform API Integration

Use this skill when adding a new social platform (e.g. Threads, Lemon8) or modifying an existing one.

## Architecture Overview

Each platform integration touches **6 files** minimum:

```
prisma/schema.prisma          → Add to Platform enum
src/lib/platform-config.ts    → PlatformSpec (limits, media, post types)
src/lib/platform-api/<name>-api.ts  → API client
src/lib/validation/rules/<name>.ts  → Validation rules
src/app/api/accounts/callback/route.ts → OAuth callback
src/workers/publish-helpers.ts → Publish dispatch
```

---

## Step-by-Step

### 1. Add Platform to Prisma Enum

In `app/prisma/schema.prisma`, add the new platform to the `Platform` enum:

```prisma
enum Platform {
  INSTAGRAM
  FACEBOOK
  // ... existing
  NEW_PLATFORM   // <-- add here
}
```

Then run:
```powershell
cd app
npx prisma migrate dev --name add-new-platform
npx prisma generate
```

### 2. Add Platform Spec

In `src/lib/platform-config.ts`, add a `PlatformSpec` entry to `PLATFORM_SPECS` and add the platform to `PLATFORM_ORDER`.

Follow the existing shape:
```typescript
new_platform: {
    id: 'new_platform',
    name: 'New Platform',
    color: '#HEX',
    icon: 'icon-name',
    characterLimits: { caption: { max: 2200, recommended: 150 } },
    supportedPostTypes: ['feed', 'reel'],
    hashtagLimit: 30,
    mediaConstraints: { /* per post type */ },
    variation: { hashtagPosition: 'end', linkBehavior: 'bio', tone: 'casual', emojiDensity: 'medium' },
},
```

### 3. Create API Client

Create `src/lib/platform-api/<name>-api.ts`.

Follow the pattern from [tiktok-api.ts](file:///c:/Users/ratte/Desktop/SocialiseIT/app/src/lib/platform-api/tiktok-api.ts) or [facebook-api.ts](file:///c:/Users/ratte/Desktop/SocialiseIT/app/src/lib/platform-api/facebook-api.ts):

- Import `ApiResponse`, `AccountMetrics`, `PostMetrics`, `PlatformComment` from `./types`
- Import `platformFetch` from `@/lib/fetch-with-timeout`
- Import `logger` from `@/lib/logger`
- Export async functions: `get<Platform>Analytics`, `get<Platform>Comments`, `publish<Platform>Post`
- Always return `ApiResponse<T>` — never throw
- Use `platformFetch` for HTTP calls (has built-in timeout)

### 4. Add Validation Rules

Create `src/lib/validation/rules/<name>.ts`.

Reference [existing rules](file:///c:/Users/ratte/Desktop/SocialiseIT/app/src/lib/validation/rules/) for the pattern. Each rule file exports platform-specific validation (caption length, media constraints, hashtag limits).

### 5. OAuth Callback

If the platform uses OAuth:
1. Add a callback handler in `src/app/api/accounts/callback/route.ts` (or a platform-specific file under `src/app/api/accounts/<name>/`)
2. Store tokens to `SocialAccount` using `db.socialAccount.create()`
3. Encrypt tokens using `@/lib/token-encryption`

If the platform uses API keys instead of OAuth, add a manual connection flow under `src/app/api/accounts/manual/`.

### 6. Wire Up Publishing

In `src/workers/publish-helpers.ts`, add a case to the publish dispatch:

```typescript
case 'NEW_PLATFORM':
    return await publishNewPlatformPost(accessToken, payload);
```

### 7. Add OAuth Profile Fetching (Optional)

If the platform has a user profile endpoint, add a handler in `src/lib/platform-api/oauth-profile.ts`.

---

## Conventions

- **Never `console.log`** — use `logger` from `@/lib/logger`
- **All tokens must be encrypted** at rest via `@/lib/token-encryption`
- **Return `ApiResponse<T>`** from every API function, never throw
- **Timeout**: use `platformFetch` (default 30s) or `UPLOAD_TIMEOUT_MS` (120s) for uploads
- **Platform IDs are SCREAMING_SNAKE_CASE** in the DB enum, `lowercase` everywhere else
- **File limit**: keep API client files under 200 lines; split upload logic into a subfolder if needed (see `platform-api/instagram/`)

## Reference Files

| Purpose | Path |
|---------|------|
| Platform config | `src/lib/platform-config.ts` |
| API types | `src/lib/platform-api/types.ts` |
| TikTok example | `src/lib/platform-api/tiktok-api.ts` |
| Facebook example | `src/lib/platform-api/facebook-api.ts` |
| Bluesky example | `src/lib/platform-api/bluesky-api.ts` |
| Instagram subfolder | `src/lib/platform-api/instagram/` |
| Validation rules | `src/lib/validation/rules/` |
| Publish helpers | `src/workers/publish-helpers.ts` |
| OAuth profiles | `src/lib/platform-api/oauth-profile.ts` |
| Token encryption | `src/lib/token-encryption.ts` |
