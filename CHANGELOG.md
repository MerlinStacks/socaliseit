# Changelog

All notable changes to SocialiseIT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open-source release

---

## [1.0.0] - 2026-01-30

### Added

**Core Platform**
- Multi-tenant workspace architecture with role-based access control
- Authentication via Google OAuth and email/password credentials
- Dashboard with real-time metrics, weekly heatmap, and AI suggestions

**Content Creation**
- 3-column post composer with platform-specific validation
- Multi-track video editor built on Remotion (video, audio, text tracks)
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
