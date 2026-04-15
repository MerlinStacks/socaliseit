# Graph API v25 Migration & New Features Plan

Reference: https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/

---

## Phase 1: Breaking Changes & Migration (Before June 2026)

### 1.1 Consolidate Hardcoded API Versions
**Status: Done**
**Why:** Many files hardcoded `v24.0`, `v21.0`, or `v18.0` instead of using the shared `META_API_VERSION` constant from `app/src/lib/platform-api/constants.ts`.

**What was done:**
- Added `META_OAUTH_VERSION` constant to `constants.ts` (defaults to `META_API_VERSION` but can be pinned independently if OAuth breaks on a newer version)
- All files now import `GRAPH_API_URL` or `META_OAUTH_VERSION` from the shared constants

Files updated:
- [x] `app/src/lib/platforms/config.ts` — OAuth auth/token URLs use `META_OAUTH_VERSION`, apiBase uses `GRAPH_API_URL`
- [x] `app/src/lib/platforms/oauth.ts` — token exchange, long-lived token, refresh all use `META_OAUTH_VERSION`
- [x] `app/src/lib/platforms/publishing/facebook.ts` — stories/reels endpoints use `GRAPH_API_URL`
- [x] `app/src/lib/platform-api/dm-sync.ts` — conversations, messages, avatar URLs use `GRAPH_API_URL`
- [x] `app/src/lib/services/comments-sync.ts` — comment fetching uses `GRAPH_API_URL`
- [x] `app/src/lib/services/instagram-stories.ts` — removed local `GRAPH_API_VERSION` constant, now imports `GRAPH_API_URL`
- [x] `app/src/app/api/accounts/[id]/test/route.ts` — account health check uses `GRAPH_API_URL` (was v21.0!)
- [x] `app/src/lib/api/meta-commerce.ts` — product catalog API uses `GRAPH_API_URL` (was v18.0! — not in original plan)

All should import `GRAPH_API_URL` or `META_API_VERSION` from `app/src/lib/platform-api/constants.ts`.

**Note:** `app/src/lib/platform-api/oauth-profile.ts` mentions v24.0 in comments only (lines 28, 77) but already uses `GRAPH_API_URL` from constants for actual API calls — no change needed.

**Edge case — OAuth URLs:** `config.ts` hardcodes v24.0 in OAuth dialog/token URLs (`www.facebook.com/v24.0/dialog/oauth`, `graph.facebook.com/v24.0/oauth/access_token`). Meta OAuth endpoints are generally stable across versions, but test OAuth login flow after bumping to v25.0 before deploying. If v25.0 OAuth breaks, these specific URLs may need to stay on v24.0 while all other endpoints use the shared constant — in that case, add a separate `META_OAUTH_VERSION` constant with a comment explaining why.

**Edge case — OAuth version consistency:** If OAuth dialog URLs are pinned to a separate `META_OAUTH_VERSION`, the token exchange endpoint in `oauth.ts` (`graph.facebook.com/v24.0/oauth/access_token`) must use the **same** version as the dialog URL — mismatched versions between the OAuth dialog and the token endpoint can cause token format mismatches. Keep both on the same `META_OAUTH_VERSION` constant.

**UI impact:** None — these are all backend API URL changes.

### 1.2 Verify/Migrate Story Metrics
**Priority: Medium | Deadline: Before v26 release (~Sept 2026)**
**Why:** The v25 changelog deprecates `PAGE_STORY_IMPRESSIONS_BY_STORY_ID` and `PAGE_STORY_IMPRESSIONS_BY_STORY_ID_UNIQUE` (page-level story aggregation metrics). Our app uses per-story `total_unique_impressions` in `getFacebookStoryAnalytics()`, which is a **different metric** and is NOT explicitly listed in the v25 deprecation. However, given Meta's broader insights overhaul, it should be tested and potentially migrated proactively.

- [ ] Test that `total_unique_impressions` still works on v25 for individual story nodes
- [ ] If it breaks or returns empty, migrate to `STORY_TOTAL_MEDIA_VIEW_UNIQUE` in `app/src/lib/platform-api/facebook-api.ts` (line ~240)
- Note: `app/src/lib/services/platform-analytics-sync.ts` (line ~407) just routes to `getFacebookStoryAnalytics()` — no metric references to update there

**UI impact:** None — analytics data flows into existing dashboard, no UI changes needed.

### 1.3 Verify Surviving Page Metrics
**Priority: Medium | Deadline: June 2026**
**Why:** Meta is overhauling the insights API. While `page_post_engagements` and `page_views_total` aren't explicitly listed as deprecated in the blog, they should be verified against the full v25 changelog to confirm they survive.

- [ ] Verify `page_post_engagements` still works on v25 (`app/src/lib/platform-api/facebook-api.ts:91`)
- [ ] Verify `page_views_total` still works on v25 (`app/src/lib/platform-api/facebook-api.ts:91`)
- [ ] Check if `page_total_media_view_unique` should replace `page_views_total` for the impressions/profileViews fields

**UI impact:** None — these feed into the existing analytics dashboard via `AccountMetrics`.

### 1.4 Adopt New Replacement Metrics
**Priority: Medium | Deadline: June 2026**
**Why:** Meta is introducing new unified metrics that work cross-platform (Facebook + Instagram). Adopting them now avoids a scramble when legacy metrics are removed.

New endpoints available:
- `GET {page-id}/insights/page_total_media_view_unique` — replaces legacy reach
- `GET {post-id}/insights/post_total_media_view_unique` — replaces legacy post reach
- `GET {stories-id}/insights/STORY_MEDIA_VIEW` — replaces `PAGE_STORY_IMPRESSIONS_BY_STORY_ID`
- `GET {stories-id}/insights/STORY_TOTAL_MEDIA_VIEW_UNIQUE` — replaces `PAGE_STORY_IMPRESSIONS_BY_STORY_ID_UNIQUE`

**UI impact:** None — metrics map to existing `AccountMetrics` and `PostMetrics` fields.

---

## Phase 2: New Features — Threads API

### 2.1 Topic Tags
**Status: Done**
**Why:** Helps post discoverability on Threads. Single `topic_tag` parameter (1-50 chars, no periods or ampersands) added to container creation.

**What was done:**
- Added `threadsTopicTag` field across all 5 architecture layers + Prisma schema + server persistence (posts-service, post-handlers, publish-helpers)
- Created `ThreadsPostOptions` interface in `threads-api.ts` for extensible optional params
- All 4 post types (text, image, video, carousel) pass `topic_tag` to the API when set
- Created `threads-settings.tsx` component with sanitized input (strips periods/ampersands), character counter, 50-char limit
- Added `ThreadsSettings` to customization panel for Threads platform

Files changed:
- [x] `app/prisma/schema.prisma` — added `threadsTopicTag String?` to Post model
- [x] `app/src/components/compose/customization-panel.tsx` — added field + ThreadsSettings block
- [x] `app/src/components/compose/threads-settings.tsx` — new component
- [x] `app/src/types/platform-settings.ts` — added `threadsTopicTag`
- [x] `app/src/lib/compose-actions.ts` — added mapping
- [x] `app/src/lib/platforms/types.ts` — added to PublishPayload
- [x] `app/src/lib/posts-service.ts` — persist on create
- [x] `app/src/app/api/posts/[id]/post-handlers.ts` — persist on update, include in GET, include in duplicate
- [x] `app/src/workers/publish-helpers.ts` — forward to PublishPayload
- [x] `app/src/lib/platforms/publishing/threads.ts` — build ThreadsPostOptions and pass through
- [x] `app/src/lib/platform-api/threads-api.ts` — all 4 create functions accept opts, pass `topic_tag`

### 2.2 Quote Posts
**Status: Done**
**Why:** High-engagement feature — lets users quote/repost another thread with their own commentary.

**What was done:**
- Added `threadsQuotePostId` across all 5 layers + Prisma schema + server persistence
- Extended `ThreadsPostOptions` with `quotePostId` — all 4 post types pass `quote_post_id` to the API when set
- Added quote post ID input to `threads-settings.tsx` — requires numeric post ID (not URL shortcode)
- Added to post-handlers GET, UPDATE, and DUPLICATE flows

**Note — URL-to-ID resolution (deferred):** The UI currently accepts numeric post IDs only. Shortcode-to-ID resolution from Threads URLs is deferred to a follow-up — see edge case below.

**Edge case — URL-to-ID resolution:** The `ABC123` portion in Threads URLs is a shortcode, not the actual numeric media ID that the API expects for `quote_post_id`. Passing the shortcode directly will fail silently with an "invalid post ID" error. You need to either: (a) call the Threads API to resolve shortcode → media ID (similar to Instagram's URL resolution), or (b) require users to paste the numeric post ID directly (current implementation). Meta may also change URL formats — don't rely on regex extraction of the shortcode without a fallback.

### 2.3 Link Attachments
**Status: Done**
**Why:** Rich link preview cards on text-only posts. Parameter: `link_attachment`. Only works on text-only posts (no media).

**What was done:**
- Added `linkAttachment` to `ThreadsPostOptions`
- `link_attachment` passed only in `createThreadsTextPost()` — guarded: never sent for image/video/carousel posts
- Auto-extracts first URL from caption in the Threads publisher (no UI needed)
- Guard in publisher: only extracts URL when `mediaUrls` is empty (text-only posts)
- No UI changes needed — automatic for text posts containing URLs

### 2.4 GIF Attachments
**Priority: Medium | Effort: Medium**
**Why:** Attach GIPHY GIFs to text posts via `gif_attachment` param (`gif_id` + `provider: "GIPHY"`). Only works on text-only posts.

Backend changes:
- [ ] Add `threadsGifId?: string` to settings types
- [ ] Pass `gif_attachment: { gif_id, provider: "GIPHY" }` in container creation

UI changes:
- [ ] Integrate GIPHY search API (requires GIPHY API key — new env var)
- [ ] Add GIF picker component to compose UI (could be shared across platforms)
- [ ] Show GIF picker only when Threads is selected and no media is attached
- [ ] Note: This is a larger UI effort — needs a search modal with GIF preview grid

### 2.5 Polls
**Priority: Low | Effort: Medium**
**Why:** Interactive poll posts for Threads. New post type with poll options.

- [ ] Research Threads poll API parameters and constraints (not fully documented yet)
- [ ] Add poll option inputs to compose UI (conditionally shown for Threads)
- [ ] Implement poll container creation in `threads-api.ts`
- [ ] Handle poll results in analytics/insights

---

## Phase 3: New Features — Instagram API

### 3.1 Alt Text for Images
**Status: Done**
**Why:** Accessibility feature added March 2025. Single `alt_text` parameter on image container creation. Good practice and may improve reach.

**Design decision resolved:** Kept `altText: string` for single-image use (preserves Pinterest compatibility). Added `altTexts: string[]` for per-image carousel alt text (index-aligned with `mediaUrls`). Carousel publishers fall back to `altText` if `altTexts` entry is missing for a given index.

**What was done:**
- Added `altText` + `altTexts` to `FeedPostPayload` and `PublishPayload`
- Added `altText` to `PlatformSettings`, `PlatformSettingsInput`, `buildPostPayload()`, Prisma schema
- Wired through `posts-service`, `post-handlers` (GET, UPDATE, DUPLICATE), `publish-helpers`
- Instagram publisher: passes `alt_text` on single image containers + per-image on carousel children
- Facebook publisher: passes `alt_text` on single photo (local FormData + remote URL) + per-image on carousel uploads
- Pinterest: already worked — unchanged (`publishing/pinterest.ts:125`)
- UI: alt text textarea in customization panel, shown when `activeSpec.features.altText` and media has images

**Remaining follow-ups:**
- [ ] Add "Generate with AI" button using existing `/api/ai/generate-alt-text` endpoint
- [ ] Per-image carousel UI (currently shows single alt text input — per-image inputs need carousel-aware UI)
- [ ] Verify Threads, LinkedIn, and Bluesky APIs actually accept alt text on media. If not, set `altText: false` in their platform specs to hide the UI for those platforms

### 3.2 User Tags on Carousel Items
**Status: Done**
**Why:** User tags were supported on single image posts but not passed to carousel child containers.

**What was done:**
- [x] User tags now passed to each carousel image child container in `publishInstagramFeedPost()`
- Same tags applied to all images (flat array approach — matches how most users expect tagging to work)
- No UI changes needed — existing user tag input already works, tags now apply to carousel images too

**Follow-up:** Per-image user tags (different people tagged on different carousel slides) would require adding `mediaIndex` to the tag data model, similar to how product tags work. Deferred — current implementation covers the common case.

---

## Phase 5: Instagram Feed Grid Planner (New Feature)

**Priority: High | Effort: Medium**
**Why:** High-demand feature for Instagram-focused users. Shows a visual 3-column grid preview of how their Instagram profile feed will look with upcoming scheduled posts mixed in with their existing published feed. Competitors like Rella, Later, and Planoly all offer this.

### Existing infrastructure we can reuse

| What exists | Where | How it helps |
|---|---|---|
| Instagram post sync (last 50 posts with thumbnails) | `app/src/lib/platform-api/posts-sync.ts:43` (`getInstagramMedia()`) | Fetches published feed with `media_url`, `thumbnail_url`, `media_type` |
| External post storage with thumbnails | Prisma `Post.externalThumbnailUrl`, `Media.thumbnailUrl` | Already stores images for synced posts |
| Instagram phone mockup preview | `app/src/components/compose/platform-previews/instagram-preview.tsx` | Reference for visual styling (profile ring, action buttons, etc.) |
| Drag-and-drop calendar infrastructure | `app/src/hooks/use-drag-drop-calendar.ts` | Can adapt for grid cell reordering |
| Post status color coding | `app/src/components/calendar/draggable-post-card.tsx` | Draft (gray), Scheduled (blue), Published (green) |
| Calendar API with media thumbnails | `app/src/app/api/calendar/route.ts` | Already fetches first media per post |
| Post sync service | `app/src/lib/services/posts-sync-service.ts` | Batch sync for pulling latest Instagram feed |
| Calendar page with view switching | `app/src/app/(dashboard)/calendar/page.tsx` | Month/week/day/timeline views — add "Grid" as 5th view |

### Implementation plan

**5.1 Backend — Grid Data API**
**Status: Done**
- [x] Created `GET /api/instagram/grid?accountId=X&limit=N` endpoint
  - Fetches pending (DRAFT/SCHEDULED) posts sorted by scheduledAt ASC (top of grid)
  - Fetches published posts sorted by publishedAt DESC (flow below)
  - Excludes stories (don't appear in Instagram profile grid)
  - Returns `{ grid: GridPost[], account: { id, username, avatarUrl }, totalPending, totalPublished }`
  - Each GridPost: `{ id, thumbnailUrl, mediaType, status, scheduledAt, publishedAt, caption, postType, isExternal, externalUrl }`
  - Media type detection: postType for reel/carousel, mimeType fallback for video
  - Auth: validates account belongs to user's org and is Instagram platform
- [ ] Extend `getInstagramMedia()` to optionally fetch more than 50 posts for deeper grid history (follow-up)
- [ ] Consider caching grid data with Redis (follow-up)

**5.2 Frontend — Grid View Component**
**Status: Done**
- [x] Created `app/src/components/calendar/grid-planner.tsx`
  - 3-column CSS grid matching Instagram's profile layout (aspect-square cells)
  - Thumbnail with lazy loading, placeholder for posts without media
  - Media type overlays: Layers icon (carousel), Play icon (reel/video)
  - Status badges: blue ring + "Scheduled"/"Draft" badge on pending posts, reduced opacity
  - Hover: dark overlay with caption preview (truncated to 60 chars)
  - Click cell → navigates to `/compose?edit={postId}` for editing
  - Profile header with avatar, username, post count + upcoming count
  - Account selector dropdown when multiple Instagram accounts are connected
  - Loading skeleton: 3x3 pulsing grid
  - Error state with retry button, empty state with guidance
- [x] Extended `CalendarViewMode` type to include `'grid'`
- [x] Added "Grid" tab to calendar page view switcher (5th view after timeline)
- [x] Grid view dynamically imported with skeleton fallback
- [x] Accounts fetched from existing React Query cache (same as composer)

**5.3 Frontend — Drag-and-Drop Reordering**
**Status: Done**
- [x] Created `app/src/hooks/use-drag-drop-grid.ts` — dedicated hook for grid reordering
  - `computeInsertTime()` computes new `scheduledAt` from neighboring posts
  - Midpoint strategy when between two posts; +1 hour when at edges
  - Gap < 2 minutes → places 1 minute after the earlier post (avoids sub-minute collisions)
- [x] Pending posts (scheduled/draft) are draggable with grip handle on hover
  - Published posts locked in place (not draggable)
  - Visual feedback: dragged post goes transparent, drop target gets gold ring + scale + left indicator bar
  - Drag hint text shown when 2+ pending posts exist
- [x] On drop: `PATCH /api/posts/{id}` with `{ action: 'reschedule', scheduledAt }`, then re-fetch grid
- [x] Image elements have `draggable={false}` to prevent browser image drag interference

**5.4 Frontend — Grid Preview in Compose**
- [ ] Optional: Add mini grid preview to compose customization panel when Instagram is selected
  - **Edge case — multi-platform compose:** If composing for Instagram + other platforms simultaneously, the mini grid only shows Instagram context. Consider only showing the mini grid when Instagram is the sole selected platform, or add a subtle note that the preview is Instagram-only, to avoid users optimizing for grid aesthetics at the expense of other platforms.
  - Shows 3x3 thumbnail grid: top-left is the post being composed, rest are the latest 8 published posts
  - Gives immediate visual feedback of how the new post fits into the existing feed aesthetic
  - Reuse profile header from `instagram-preview.tsx` (avatar, username, post/follower/following counts)

### Key design decisions
- **Grid order:** Instagram shows newest posts top-left. Scheduled posts should appear at the top of the grid (they'll be newest when published), with published posts flowing below.
- **Multiple scheduled posts:** If 3 posts are scheduled for the same day, show them in chronological order (earliest first in the top-left position).
- **Carousel posts:** Show first image only in grid cell (matches Instagram behavior). Carousel icon overlay in top-right corner.
- **Reels:** Show thumbnail with Reel play icon overlay (matches Instagram behavior).
- **Stories:** Exclude from grid — stories don't appear in the Instagram profile grid.

### Edge cases
- **Empty grid on new accounts:** If posts haven't been synced yet (freshly connected account), the grid will be empty. Trigger a sync on first grid load if no external posts exist for the account.
- **Cross-posted content:** A post scheduled for both Instagram and Facebook should only show the Instagram version in the grid. Filter by platform + account ID.
- **Draft posts without media:** Drafts that have no media attached yet should still appear in the grid with a placeholder thumbnail (e.g., text icon or caption preview).
- **External posts without thumbnails (P1 follow-up):** Some synced posts may have expired `media_url` / `thumbnail_url` CDN links (Instagram CDN URLs expire). On first grid load, many users will see broken thumbnails for older posts. Concrete approach: proxy thumbnails through your own endpoint that re-fetches from Instagram on 403/404, then cache to S3/MinIO. Short-term fallback: show a placeholder image with a "Refresh" button that triggers a re-sync for that post. Do not defer this — broken thumbnails on first load will make the feature feel broken.
- **Grid pagination:** 50 posts = ~16 rows. For accounts with deep history, consider infinite scroll with lazy loading rather than fetching everything upfront.
- **Multi-account:** User may have multiple Instagram accounts connected. Grid should be per-account with a selector — not a merged view.

---

## Phase 4: Analytics Gaps (Fixed & Remaining)

### 4.1 Fixed — Threads Dashboard Metrics
**Status: Done**
- Added `followers` to Threads `PLATFORM_METRICS` set (was collected but not displayed)
- Removed `reach` from Threads set (was displayed but always 0 — Threads API doesn't expose reach)
- File: `app/src/app/(dashboard)/analytics/AnalyticsDesktop.tsx:65`

### 4.2 Fixed — Facebook Website Clicks
**Status: Done**
- Wired `page_website_clicks_logged_in_unique` metric in `getFacebookPageAnalytics()` (was commented out)
- Added `websiteClicks` to Facebook `PLATFORM_METRICS` set in dashboard
- Files: `app/src/lib/platform-api/facebook-api.ts:91,124`, `AnalyticsDesktop.tsx:57`
- **Fix applied:** Split `page_website_clicks_logged_in_unique` into a separate API call with non-fatal error handling. Core metrics (`page_post_engagements`, `page_views_total`) and the page object fetch now run in `Promise.all` for parallel performance. If the website clicks metric fails (deprecated, incompatible with `period=day`, etc.), it logs a warning and returns 0 — core analytics are unaffected.
- [x] Split `page_website_clicks_logged_in_unique` into a separate API call with its own try/catch
- [x] Core metrics, page object, and website clicks all fetched in parallel via `Promise.all`
- [x] Dashboard unaffected — same `AccountMetrics` shape returned

### 4.3 Fixed — Stale Sync Comments
**Status: Done**
- Updated comment on line 28 of `platform-analytics-sync.ts` (incorrectly listed Threads as skipped)
- Updated comment on line 305 (incorrectly listed Threads as not supporting post-level analytics)

### 4.4 Fixed — Bluesky Dashboard Ghost Metrics
**Status: Done**
- Commented out Bluesky from `PLATFORM_METRICS` — no analytics sync exists, so displaying metrics showed empty cards
- File: `app/src/app/(dashboard)/analytics/AnalyticsDesktop.tsx:67`

### 4.5 LinkedIn Analytics
**Priority: Medium | Effort: Medium**
**Why:** LinkedIn added Member Creator analytics APIs in June 2025 (v202506) that are still active in the latest v202603. We have zero LinkedIn analytics despite publishing working fine. These new endpoints are specifically designed for creator/member analytics (not just organization pages).

**Current state:** App is on `LINKEDIN_VERSION = '202603'` (latest, in `app/src/lib/platform-api/linkedin-api.ts:22`). No analytics functions exist for LinkedIn.

**New LinkedIn endpoints to use (verified active as of April 2026):**

| Endpoint | Metrics | Permission |
|---|---|---|
| `GET /memberFollowersCount?q=me` | Lifetime follower count | `r_member_profileAnalytics` |
| `GET /memberFollowersCount?q=dateRange` | Follower growth over time | `r_member_profileAnalytics` |
| `GET /memberCreatorPostAnalytics?q=me` | Aggregated: impressions, reach, reactions, comments, reshares | `r_member_postAnalytics` |
| `GET /memberCreatorPostAnalytics?q=entity` | Per-post: impressions, reach, reactions, comments, reshares | `r_member_postAnalytics` |
| `GET /memberCreatorVideoAnalytics?q=entity` | Per-video: plays, watch time, unique viewers | `r_member_postAnalytics` |

Backend changes:
- [ ] Add `r_member_profileAnalytics` and `r_member_postAnalytics` to LinkedIn OAuth scopes (`app/src/lib/platforms/config.ts`)
- [ ] Implement `getLinkedInMemberAnalytics()` using `memberFollowersCount` + `memberCreatorPostAnalytics` endpoints
- [ ] Implement `getLinkedInPostAnalytics()` using `memberCreatorPostAnalytics?q=entity` endpoint
- [ ] Implement `getLinkedInVideoAnalytics()` using `memberCreatorVideoAnalytics?q=entity` for video posts
- [ ] Add `'LINKEDIN'` to `SUPPORTED_ANALYTICS_PLATFORMS` in `platform-analytics-sync.ts`
- [ ] Add case handlers in `fetchAccountMetrics()` and `fetchPostMetrics()` in sync service

UI changes:
- [ ] Add LinkedIn to `PLATFORM_METRICS` in `AnalyticsDesktop.tsx` — metrics: `followers, impressions, reach, likes, comments, shares`
- [ ] Note: Users will need to reconnect LinkedIn accounts to grant new `r_member_postAnalytics` permission

Implementation requirement — account type detection:
- [ ] Before calling analytics endpoints, check URN prefix: `urn:li:person:X` → use `memberCreatorPostAnalytics` / `memberFollowersCount` endpoints. `urn:li:organization:X` → use `/organizationalEntityShareStatistics` endpoints (different API, different permissions). Calling member endpoints on an org URN will return 403 with no useful error message.
- [ ] Add a helper like `isPersonalProfile(ownerUrn: string): boolean` and branch analytics logic accordingly

Edge cases:
- **Personal profiles vs Company Pages:** The `memberCreatorPostAnalytics` and `memberFollowersCount` endpoints are for **individual member profiles**, not organization/company pages. Check which LinkedIn account type users connect — if they connect Company Pages (organization URN), these endpoints won't work. Organization pages use different analytics endpoints (`/organizationalEntityShareStatistics`). The publish handler uses `ownerUrn` which could be either `urn:li:person:X` or `urn:li:organization:X` — the analytics implementation needs to handle both.
- **Permission prompt:** Adding new scopes means existing users see a re-authorization prompt on next login. Consider surfacing a notice in the UI ("Reconnect LinkedIn to enable analytics").

### 4.6 Bluesky Analytics
**Priority: Low | Effort: Low-Medium**
**Why:** Bluesky AT Protocol exposes like/reply/repost counts per post. Account-level aggregation would need to be computed from post data.

- [ ] Implement `getBlueskyPostAnalytics()` — likes, replies, reposts from AT Protocol
- [ ] Implement basic `getBlueskyAccountMetrics()` — followers from profile, aggregate post engagement
- [ ] Add `'BLUESKY'` to `SUPPORTED_ANALYTICS_PLATFORMS`
- [ ] Uncomment and update Bluesky entry in `PLATFORM_METRICS`

### 4.7 LinkedIn CTAs (BUY_NOW / SHOP_NOW)
**Status: Done**
**Why:** LinkedIn Posts API added `BUY_NOW` and `SHOP_NOW` CTA types in v202504 (April 2025).

**What was done:**
- [x] Added 8 CTAs to LinkedIn platform spec: APPLY, DOWNLOAD, LEARN_MORE, REGISTER, SIGN_UP, SUBSCRIBE, BUY_NOW, SHOP_NOW
- [x] Added `callToAction` to `LinkedInPostPayload` interface
- [x] Passes `contentCallToActionLabel` in LinkedIn Posts API body when CTA is selected
- [x] Added `callToAction` to `PublishPayload` + forwarded from Post record in `publish-helpers.ts`
- [x] Wired from LinkedIn publisher (`publishing/linkedin.ts`) to API payload
- CTA dropdown in compose UI already rendered automatically — no UI changes needed

---

## No Action Required

**Meta Graph API v25:**
- **Webhooks mTLS certificate change (March 31, 2026):** Our deployment uses Nginx Proxy Manager on Digital Ocean/Portainer which handles standard TLS termination — no mTLS client cert verification configured. Meta webhooks (`/api/webhooks/instagram`, `/api/webhooks/facebook`) verify via `x-hub-signature-256` HMAC which is unaffected.
- **Marketing API ASC/AAC deprecation:** We don't manage ad campaigns.
- **`metadata=1` parameter removal:** Not used in our codebase.
- **Graph API v19 sunset (May 21, 2026):** We're on v25.0/v24.0.
- **Graph API v20 sunset (Sept 24, 2026):** We're on v25.0/v24.0.

**Other platforms (verified April 2026):**
- **LinkedIn API version:** Already on latest `202603`. No migration needed.
- **YouTube Shorts view count change (March 2025):** Views now count plays/replays with no minimum watch time. Not a breaking change — just means Shorts view numbers are higher. Our analytics use `viewCount` which is the same field.
- **YouTube upload quota reduction (Dec 2025):** Upload cost dropped from ~1600 to ~100 units. Good news, no action needed.
- **TikTok Content Posting API:** No new fields or breaking changes found. Our implementation matches the current API spec.
- **Pinterest API:** No known breaking changes (changelog requires auth to verify).
- **Bluesky AT Protocol:** Changes are infrastructure-level (relay transitions, OAuth session lifetimes). No new publishing or analytics endpoints relevant to us.

---

## Architecture Notes

**Compose UI data flow** (for context on where new fields need to be added):

```
Compose UI (customization-panel.tsx)
  → PlatformSettings interface (customization-panel.tsx:34)
  → useCompose hook stores in accountSettings (use-compose.ts)
  → buildPostPayload() maps to PlatformSettingsInput (compose-actions.ts:46)
  → POST /api/posts sends PlatformSettingsInput (platform-settings.ts:8)
  → Server stores in Post.platformSettings JSON
  → Worker reads and builds PublishPayload (platforms/types.ts:103)
  → Platform-specific publisher maps to API payload (e.g., FeedPostPayload)
  → API call to Meta
```

Any new per-platform field must be added to ALL of these layers:
1. `PlatformSettings` (UI interface) — `customization-panel.tsx:34`
2. `PlatformSettingsInput` (API payload type) — `platform-settings.ts:8`
3. `buildPostPayload()` (UI → API mapping) — `compose-actions.ts:49`
4. `PublishPayload` (worker type) — `platforms/types.ts`
5. Platform publisher (API call) — e.g., `threads-api.ts`, `instagram/publishing.ts`

**Key compose files:**
- `app/src/components/compose/customization-panel.tsx` — Platform-specific settings panel
- `app/src/components/compose/instagram-settings.tsx` — Instagram toggles (share to feed, trial reel)
- `app/src/components/compose/tiktok-settings.tsx` — TikTok privacy/disclosure settings
- `app/src/components/compose/youtube-settings.tsx` — YouTube title/privacy/category
- `app/src/components/compose/pinterest-settings.tsx` — Pinterest title/link/board
- `app/src/components/compose/linkedin-settings.tsx` — LinkedIn visibility
- No `threads-settings.tsx` exists yet — needs to be created for topic tags/quote posts

---

## Timeline

| When | What |
|------|------|
| Done | Phase 4.1-4.4 — Threads dashboard, Facebook websiteClicks (split into separate call), stale comments, Bluesky ghost metrics |
| Done | Phase 1.1 — Consolidated all hardcoded API versions (v24.0, v21.0, v18.0) to shared constants |
| Done | Phase 2.1 — Threads topic tags (full stack: schema → types → API → UI) |
| Done | Phase 2.2 — Threads quote posts (full stack, numeric ID input) |
| Done | Phase 3.1 — Alt text for images (Instagram, Facebook, carousel support) |
| Done | Phase 5.1-5.2 — Instagram Grid Planner (API endpoint + grid view component) |
| Next sprint | Phase 1.2 — Test `total_unique_impressions` on v25, migrate if needed |
| Next sprint | Phase 1.3 — Verify `page_post_engagements` and `page_views_total` survive |
| Before June 2026 | Phase 1.4 — Adopt new replacement metrics |
| Done | Phase 5.3 — Grid drag-drop reordering (use-drag-drop-grid hook + visual feedback) |
| Backlog | Phase 5.4 — Grid preview in compose (mini 3x3 grid) |
| Backlog | Phase 4.5 — LinkedIn analytics (new Member Creator APIs from v202506) |
| Backlog | Phase 4.6 — Bluesky analytics implementation |
| Done | Phase 4.7 — LinkedIn CTAs (8 CTA types, full publish wiring) |
| Done | Phase 2.3 — Threads link attachments (auto-extract from caption) |
| Done | Phase 3.2 — Carousel user tags (applied to all carousel images) |
| Backlog | Phase 2.4-2.5 — GIFs, Polls |
