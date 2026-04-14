# Graph API v25 Migration & New Features Plan

Reference: https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/

---

## Phase 1: Breaking Changes & Migration (Before June 2026)

### 1.1 Consolidate Hardcoded API Versions
**Priority: High**
**Why:** Many files hardcode `v24.0` or `v21.0` instead of using the shared `META_API_VERSION` constant from `app/src/lib/platform-api/constants.ts`. This defeats the single-source-of-truth pattern and creates version drift risk.

Files to update:
- [ ] `app/src/lib/platforms/config.ts` — OAuth auth/token URLs and apiBase (v24.0, lines 29-30, 43, 72-73, 86)
- [ ] `app/src/lib/platforms/oauth.ts` — token exchange, long-lived token URLs (v24.0, lines 178, 403, 424)
- [ ] `app/src/lib/platforms/publishing/facebook.ts` — stories/reels endpoints (v24.0, lines 127, 224-225, 327)
- [ ] `app/src/lib/platform-api/dm-sync.ts` — conversations, messages, avatar URLs (v24.0, lines 96, 221, 311, 553-554)
- [ ] `app/src/lib/services/comments-sync.ts` — comment fetching (v24.0, lines 129, 176)
- [ ] `app/src/lib/services/instagram-stories.ts` — GRAPH_API_VERSION constant (v24.0, line 12)
- [ ] `app/src/app/api/accounts/[id]/test/route.ts` — account health check (v21.0!, line 39)

All should import `GRAPH_API_URL` or `META_API_VERSION` from `app/src/lib/platform-api/constants.ts`.

**Note:** `app/src/lib/platform-api/oauth-profile.ts` mentions v24.0 in comments only (lines 28, 77) but already uses `GRAPH_API_URL` from constants for actual API calls — no change needed.

**Edge case — OAuth URLs:** `config.ts` hardcodes v24.0 in OAuth dialog/token URLs (`www.facebook.com/v24.0/dialog/oauth`, `graph.facebook.com/v24.0/oauth/access_token`). Meta OAuth endpoints are generally stable across versions, but test OAuth login flow after bumping to v25.0 before deploying. If v25.0 OAuth breaks, these specific URLs may need to stay on v24.0 while all other endpoints use the shared constant — in that case, add a separate `META_OAUTH_VERSION` constant with a comment explaining why.

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
**Priority: High | Effort: Very Low**
**Why:** Helps post discoverability on Threads. Single `topic_tag` parameter (1-50 chars, no periods or ampersands) added to container creation.

**Current state:** No Threads-specific settings component exists. The customization panel (`app/src/components/compose/customization-panel.tsx`) has no `threads` case — Threads posts currently only get the shared settings (caption, media, first comment, post type, auto publish).

Backend changes (all 5 layers from Architecture Notes):
- [ ] Add `threadsTopicTag?: string` to `PlatformSettings` interface (`app/src/components/compose/customization-panel.tsx:34`)
- [ ] Add `threadsTopicTag?: string` to `PlatformSettingsInput` (`app/src/types/platform-settings.ts:8`)
- [ ] Add `threadsTopicTag` to `buildPostPayload()` mapping (`app/src/lib/compose-actions.ts:49`, after line ~89)
- [ ] Add `threadsTopicTag?: string` to `PublishPayload` interface (`app/src/lib/platforms/types.ts:33`)
- [ ] Wire through the publish handler (`app/src/lib/platforms/publishing/threads.ts`) to pass it from `PublishPayload` to the API functions
- [ ] Pass `topic_tag` param in `createAndPublish()` in `app/src/lib/platform-api/threads-api.ts:226`

UI changes:
- [ ] Create `app/src/components/compose/threads-settings.tsx` — new component (similar to `instagram-settings.tsx`)
- [ ] Add topic tag text input (single string, 1-50 chars, validate no periods/ampersands)
- [ ] Add `{activePlatform === 'threads' && <ThreadsSettings ... />}` block in customization-panel.tsx (after LinkedIn settings, ~line 410)

### 2.2 Quote Posts
**Priority: High | Effort: Low**
**Why:** High-engagement feature — lets users quote/repost another thread with their own commentary.

Backend changes (all 5 layers):
- [ ] Add `threadsQuotePostId?: string` to `PlatformSettings` (`customization-panel.tsx:34`)
- [ ] Add `threadsQuotePostId?: string` to `PlatformSettingsInput` (`platform-settings.ts:8`)
- [ ] Add to `buildPostPayload()` mapping (`compose-actions.ts:49`)
- [ ] Add `threadsQuotePostId?: string` to `PublishPayload` (`platforms/types.ts:33`)
- [ ] Wire through publish handler (`publishing/threads.ts`)
- [ ] Pass `quote_post_id` param in `createAndPublish()` (`threads-api.ts:226`)

UI changes:
- [ ] Add quote post URL/ID input to `threads-settings.tsx` (from 2.1 above)
- [ ] Consider extracting thread ID from full Threads URL (e.g., `https://www.threads.net/@user/post/ABC123`)

### 2.3 Link Attachments
**Priority: Medium | Effort: Low**
**Why:** Rich link preview cards on text-only posts. Parameter: `link_attachment`. Only works on text-only posts (no media).

Backend changes:
- [ ] Pass `link_attachment` param in `createAndPublish()` when media_type is TEXT and URL is present
- [ ] Could auto-detect from caption or use explicit field

UI changes:
- [ ] Add optional link attachment input to `threads-settings.tsx`
- [ ] OR auto-extract first URL from caption (no UI needed — just backend logic)
- [ ] Note: Only applicable when no media is attached (text-only posts)

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
**Priority: High | Effort: Low**
**Why:** Accessibility feature added March 2025. Single `alt_text` parameter on image container creation. Good practice and may improve reach.

**Current state — partially built but never wired end-to-end:**
- `PublishPayload.altText` exists in `app/src/lib/platforms/types.ts:103` (single string)
- Platform config flags `altText: true` for Instagram (`app/src/lib/platform-config/platforms/instagram.ts:79`)
- AI alt text generation endpoint exists at `app/src/app/api/ai/generate-alt-text/route.ts`
- **Gap 1:** No compose UI for alt text input (zero TSX references in any component)
- **Gap 2:** `FeedPostPayload` in `app/src/lib/platform-api/types.ts:162` has no `altText` field
- **Gap 3:** `PlatformSettings` in `customization-panel.tsx:34` has no `altText` field
- **Gap 4:** `PlatformSettingsInput` in `platform-settings.ts:8` has no `altText` field
- **Gap 5:** `buildPostPayload()` in `compose-actions.ts:46` doesn't map alt text
- **Gap 6:** Instagram publishing in `publishing.ts` never passes `alt_text` to the API
- **Design decision:** Alt text is per-image, but `PublishPayload.altText` is a single string. For carousels with multiple images, we need `Record<mediaId, string>` or `string[]`.
- **Edge case — Facebook:** Platform config also flags `altText: true` for Facebook (`platforms/facebook.ts:75`). If we implement alt text for Instagram, we should wire it for Facebook too (same `alt_text` param on photo uploads).
- **Edge case — Pinterest:** Pinterest publishing already passes `alt_text` from `payload.altText` (`publishing/pinterest.ts:125`), so the `PublishPayload` field is live for Pinterest. Adding UI will affect Pinterest posts too — which is fine, but be aware.
- **Edge case — Instagram publish handler:** The Instagram publish handler at `publishing/instagram.ts:129` builds `FeedPostPayload` from `PublishPayload` but currently doesn't map `altText`. This needs to be added alongside the `FeedPostPayload` type change.
- **Edge case — false positives in platform config:** `altText: true` is set for 6 platforms: Instagram, Facebook, Pinterest, LinkedIn, Threads, and Bluesky. Pinterest already works (`publishing/pinterest.ts:125`). Instagram and Facebook support `alt_text` in their APIs. But Threads, LinkedIn, and Bluesky APIs may NOT support alt text on media — verify before building UI that shows alt text input for those platforms. If their APIs don't accept it, either set `altText: false` in their specs or silently ignore it during publishing.

Backend changes:
- [ ] Add `altText?: string` to `FeedPostPayload` (`app/src/lib/platform-api/types.ts:162`)
- [ ] Add `altText?: string` to `PlatformSettingsInput` (`app/src/types/platform-settings.ts:8`)
- [ ] Add `altText` to `PlatformSettings` interface (`customization-panel.tsx:34`)
- [ ] Add `altText` to `buildPostPayload()` mapping (`compose-actions.ts:49`)
- [ ] Pass `alt_text` in single image container creation (`publishing.ts:488`)
- [ ] Pass `alt_text` for carousel image children (`publishing.ts:295`)
- [ ] Wire `altText` from `PublishPayload` through the Instagram publish handler to `FeedPostPayload`

UI changes:
- [ ] Add alt text input field to media section in customization panel — show when platform supports alt text (`activeSpec.features.altText`) and media contains images
- [ ] Consider adding "Generate with AI" button that calls existing `/api/ai/generate-alt-text` endpoint
- [ ] For single image: simple text input
- [ ] For carousels: per-image alt text (show input for each image in carousel) — requires changing the data model from `string` to `Record<string, string>` or similar

### 3.2 User Tags on Carousel Items
**Priority: Medium | Effort: Low**
**Why:** User tags are supported on single image posts (`publishing.ts:497-502`) but not passed to carousel child containers (`publishing.ts:295`).

Backend changes:
- [ ] Pass `user_tags` to individual carousel image child containers in `publishInstagramFeedPost()` (`publishing.ts:293-306`)
- [ ] `FeedPostPayload.userTags` already exists but is a flat array — may need to support per-image user tags (with `mediaIndex` like product tags)

UI changes:
- [ ] Current user tag UI status is unclear — product tagging exists (`product-tagging.tsx`) but user mention tagging appears to be text-based only
- [ ] If visual user tagging UI exists: extend it to work in carousel mode (per-image)
- [ ] If not: consider adding a simple username input per image

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
- [ ] Create `GET /api/instagram/grid?accountId=X` endpoint
  - Fetch published Instagram posts (from DB, synced via `posts-sync-service`)
  - Fetch scheduled/draft Instagram posts (from Post table, status DRAFT or SCHEDULED)
  - Merge and sort: published posts by `publishedAt` DESC, then insert scheduled posts at their planned positions
  - Return array of `{ id, thumbnailUrl, mediaType, status, scheduledAt?, publishedAt?, caption }` in grid order (newest first, 3-column layout)
- [ ] Extend `getInstagramMedia()` to optionally fetch more than 50 posts for deeper grid history
- [ ] Consider caching grid data (already have Redis) to avoid repeated API calls

**5.2 Frontend — Grid View Component**
- [ ] Create `app/src/components/calendar/grid-planner.tsx`
  - 3-column CSS grid matching Instagram's profile layout
  - Each cell shows: thumbnail image, media type icon overlay (carousel/reel/video badge), status indicator (scheduled = dashed border or overlay badge)
  - Scheduled/draft posts visually distinct from published posts (e.g., slight opacity, colored border, "Scheduled" badge)
  - Click cell → open post preview modal (reuse existing `post-preview-modal.tsx`)
  - Hover cell → show caption preview tooltip
- [ ] Add "Grid" view option to calendar page view switcher (`app/src/app/(dashboard)/calendar/page.tsx`)
- [ ] Add Instagram account selector (only show grid for one Instagram account at a time)

**5.3 Frontend — Drag-and-Drop Reordering**
- [ ] Allow drag-and-drop of scheduled/draft posts to rearrange their position in the grid
  - Dragging changes `scheduledAt` to reorder relative to other scheduled posts
  - Published posts are locked in place (can't be moved)
  - Visual feedback: ghost image on drag, insertion indicator between cells
- [ ] Adapt `use-drag-drop-calendar.ts` or create `use-drag-drop-grid.ts` for grid-specific logic
- [ ] On drop: update post `scheduledAt` via `PATCH /api/posts/{id}` to reflect new order

**5.4 Frontend — Grid Preview in Compose**
- [ ] Optional: Add mini grid preview to compose customization panel when Instagram is selected
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
- **External posts without thumbnails:** Some synced posts may have expired `media_url` / `thumbnail_url` CDN links (Instagram CDN URLs expire). Fall back to a placeholder image. Consider re-syncing thumbnails periodically or storing them in S3/MinIO.
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
**Status: Done — but needs validation**
- Wired `page_website_clicks_logged_in_unique` metric in `getFacebookPageAnalytics()` (was commented out)
- Added `websiteClicks` to Facebook `PLATFORM_METRICS` set in dashboard
- Files: `app/src/lib/platform-api/facebook-api.ts:91,124`, `AnalyticsDesktop.tsx:57`
- **Edge case to verify:** The metric was added to the same comma-separated insights API call as `page_post_engagements` and `page_views_total`. If `page_website_clicks_logged_in_unique` is incompatible with `period=day` or has been deprecated, the **entire insights call will fail** (Meta returns an error if any metric in the list is invalid), breaking all Facebook page analytics — not just website clicks. If this happens, either remove the metric or split it into a separate API call with its own error handling.

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
**Priority: Low | Effort: Very Low**
**Why:** LinkedIn Posts API added `BUY_NOW` and `SHOP_NOW` CTA types in v202504 (April 2025). Our LinkedIn publishing doesn't use CTAs at all — the LinkedIn platform spec has no `callToActions` array, and the publishing code doesn't pass `contentCallToActionLabel`.

- [ ] Add `callToActions` to LinkedIn platform spec (`app/src/lib/platform-config/platforms/linkedin.ts`)
  - Available CTAs: `APPLY`, `DOWNLOAD`, `LEARN_MORE`, `REGISTER`, `SIGN_UP`, `SUBSCRIBE`, `BUY_NOW`, `SHOP_NOW`
- [ ] Pass `contentCallToActionLabel` in `publishLinkedInPost()` (`app/src/lib/platform-api/linkedin-api.ts`)
- [ ] The CTA dropdown in compose UI (`customization-panel.tsx:309`) already renders when `activeSpec.callToActions` has entries — just needs LinkedIn spec to declare the options. No new UI component needed.

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
| Done | Phase 4.1-4.4 — Threads dashboard, Facebook websiteClicks, stale comments, Bluesky ghost metrics |
| Now | Phase 1.1 — Consolidate hardcoded API versions (v24.0 and v21.0) |
| Now | Phase 2.1 — Threads topic tags (create threads-settings.tsx + backend wiring) |
| Next sprint | Phase 5.1-5.2 — Instagram Grid Planner (API + grid view component) |
| Next sprint | Phase 3.1 — Instagram alt text (UI + full stack wiring across 6 layers) |
| Next sprint | Phase 1.2 — Test `total_unique_impressions` on v25, migrate if needed |
| Next sprint | Phase 1.3 — Verify `page_post_engagements` and `page_views_total` survive |
| Next sprint | Phase 2.2 — Threads quote posts (add to threads-settings.tsx) |
| Before June 2026 | Phase 1.4 — Adopt new replacement metrics |
| Follow-up | Phase 5.3-5.4 — Grid drag-drop reordering + compose mini preview |
| Backlog | Phase 4.5 — LinkedIn analytics (new Member Creator APIs from v202506) |
| Backlog | Phase 4.6 — Bluesky analytics implementation |
| Backlog | Phase 4.7 — LinkedIn CTAs (BUY_NOW/SHOP_NOW, very low effort) |
| Backlog | Phase 2.3-2.5 — Link attachments, GIFs, Polls |
| Backlog | Phase 3.2 — Carousel user tags |
