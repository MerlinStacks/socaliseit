# Changelog

All notable changes to Overseek Socials will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

**Platform Integrations**
- [Publishing] Threads (Meta) integration — OAuth, publishing, and analytics via `threads-api.ts`
- [Publishing] Bluesky integration — AT Protocol publishing via `bluesky-api.ts`
- [Analytics] Threads and Bluesky analytics data in cross-platform dashboard

**Analytics & Intelligence**
- [Analytics] Enhanced analytics dashboard with video-specific metrics (views, watch time, skip rate)
- [Analytics] Platform breakdown visualization (per-platform engagement distribution)
- [Analytics] Reels-specific analytics integration in post detail view
- [Analytics] Top performing content section sorted by engagement rate with video views and shares
- [Analytics] Enhanced recent posts section with additional metrics
- [Trends] Google Trends integration with real-time trend discovery
- [Trends] Opportunity scoring with freshness-weighted trend detection
- [Trends] Trend freshness persistence via Redis timestamps
- [Competitors] Competitor intelligence page with side-by-side benchmarking

**AI Agents**
- [Agents] CMO agent — Weekly marketing strategy brief generation
- [Agents] Proactive crew dispatch on strategy completion
- [Agents] Competitor intelligence reactive agents
- [Agents] Auto-application of ad suggestions
- [Agents] Inline action support for Telegram notifications
- [Agents] `on_crew_completed` hook wired across crew task files

**Security & Auth**
- [Auth] Two-factor authentication (TOTP) with QR code setup
- `META_WEBHOOK_VERIFY_TOKEN` environment variable for Meta webhook verification

**Calendar & Compose**
- [Calendar] Click-to-create functionality for Day, Week, and Month views
- [Calendar] AI-recommended time slots (9 AM, 12 PM, 7:30 PM) with visual indicators
- [Calendar] Drag-and-drop rescheduling with visual feedback and transactional API
- [Compose] Scheduling modal with unified and per-platform scheduling modes
- [Compose] Inline loading spinners for Save, Schedule, and Publish buttons
- [Compose] Confetti celebration animations for milestone achievements

**UI & UX**
- [Sidebar] Collapsible navigation sections with persistent state via Zustand
- [Sidebar] Notification badges for unread items (drafts, scheduled, engagement)
- [Mobile] 4-step stepper compose workflow for mobile devices
- [Mobile] Pull-to-refresh and swipe gesture hooks
- [Settings] Redesigned two-column Settings layout

**Infrastructure & Testing**
- Initial open-source release
- PWA app icons (72–512px), shortcut icons, and store screenshots
- [Testing] Unit tests for crypto, rate-limit, and TOTP modules (47 new tests)
- [Scripts] `npm run audit` for security vulnerability scanning
- [Scripts] `npm run test:coverage` for coverage reporting

### Fixed
- [Analytics] Hydration mismatch errors (#418) — replaced locale-dependent date formatting with deterministic `date-fns` calls
- [Analytics] Deprecated API metrics causing zero-value displays
- [Analytics] Conditional rendering for metrics not tracked by specific post types/platforms
- [Compose] Image validation now correctly detects pixel dimensions during upload
- [Trends] Google Trends fetch errors now log actual error details instead of empty objects
- [Agents] CMO task prompt updated with explicit JSON output instructions to prevent unparseable prose
- [Agents] Draft type corrected from `AD_AUDIT` to `CMO_SUMMARY` for CMO briefs
- [Agents] Fallback parser added for non-JSON agent output
- Post composer media button opens upload modal and adds files to both post and media library
- Replaced deprecated `apple-mobile-web-app-capable` meta tag with `mobile-web-app-capable`
- Automatic database migration on container startup via `docker-entrypoint.sh`
- 500 error on registration API caused by missing Prisma migrations in production
- Replaced hardcoded URLs with `NEXTAUTH_URL` environment variable in webhooks, email digests, and API routes
- Replaced `console.log` with structured Pino logger in `webhooks.ts` and `email-digest.ts`
- Removed all stale imports and references to deleted `meta_ad_audit` and `inventory_check` crews

### Security
- HMAC-SHA256 signature verification for Meta, Shopify, and Stripe webhooks with timing-safe comparison
- [Headers] HTTP security headers middleware: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy
- [Auth] Rate limiting on registration endpoint (10 requests/minute per IP)
- [Docker] Redis password authentication via `requirepass` in production
- [Docker] Pinned image versions: `postgres:16.2-alpine`, `redis:7.2-alpine`
- [Docker] Container resource limits for PostgreSQL (1G/1CPU) and Redis (512M/0.5CPU)

### Changed
- Migrated `middleware.ts` to `proxy.ts` for Next.js 16 compatibility
- Settings screen UI simplified — removed cost-related elements
- Codebase cleanup — removed stale references to deleted crews and deprecated modules

---

## [1.0.0] - 2026-01-30

### Added

**Core Platform**
- Multi-tenant workspace architecture with role-based access control
- Authentication via Google OAuth and email/password credentials
- Dashboard with real-time metrics, weekly heatmap, and AI suggestions

**Content Creation**
- 3-column post composer with platform-specific validation
- Trending audio import from TikTok/Instagram URLs
- AI-powered caption generation with virality scoring
- Brand Voice AI for consistent tone and style
- Media library with folder organization

**Publishing & Scheduling**
- Content calendar with drag-and-drop scheduling
- Multi-platform publishing: Instagram, TikTok, YouTube, Facebook, Pinterest, LinkedIn, Bluesky, Google Business
- Platform-specific overrides for captions and media
- AI-recommended optimal posting times
- Bulk CSV import for content migration

**Analytics & Intelligence**
- Cross-platform analytics dashboard
- E-commerce integration (Shopify, WooCommerce) for ROI tracking
- Social listening with sentiment analysis
- Competitor tracking and benchmarking
- Hashtag monitoring and trend detection

**Engagement**
- Unified engagement inbox
- AI comment responder with sentiment-aware replies
- DM automation and lead capture workflows
- UGC discovery and permission management

**Team & Collaboration**
- Team invitations with role assignment (Owner, Admin, Editor, Viewer)
- Activity logging and audit trail
- Content pillars for strategic distribution tracking

**Infrastructure**
- Docker Compose deployment
- PWA with push notifications
- WCAG 2.2 AA accessibility compliance
- Export reports (PDF/CSV)

### Security
- bcrypt password hashing
- Encrypted OAuth token storage
- Workspace isolation for multi-tenant security

---

## [0.9.0] - 2026-01-15

### Added
- Beta release for internal testing
- Core composer and calendar functionality
- Initial platform integrations (Instagram, TikTok, YouTube)

### Fixed
- OAuth token refresh handling
- Media upload validation for large files

---

[Unreleased]: https://github.com/MerlinStacks/socaliseit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/MerlinStacks/socaliseit/releases/tag/v1.0.0
[0.9.0]: https://github.com/MerlinStacks/socaliseit/releases/tag/v0.9.0
