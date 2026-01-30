---
name: changelog-keeper
description: Maintain an up-to-date CHANGELOG.md following Keep a Changelog and Semantic Versioning standards. Use PROACTIVELY after completing any feature, fix, or significant code change.
---

# Changelog Keeper Skill

This skill ensures the project's `CHANGELOG.md` stays current and accurately reflects all notable changes. **Use this skill proactively after completing any code changes.**

## When to Update the Changelog

**ALWAYS** update `CHANGELOG.md` after implementing:

| Change Type | Changelog Section | Examples |
|-------------|-------------------|----------|
| New features | `### Added` | New API endpoints, UI components, integrations |
| Bug fixes | `### Fixed` | Error corrections, behavior fixes, crash resolutions |
| Deprecations | `### Deprecated` | Features marked for future removal |
| Removed features | `### Removed` | Deleted functionality, dropped support |
| Security patches | `### Security` | Vulnerability fixes, auth improvements |
| Breaking changes | `### Changed` | API signature changes, renamed exports, migration requirements |

**DO NOT** document:
- Internal refactors with no user-facing impact
- Test file changes only
- Documentation-only updates (unless significant)
- Dependency bumps (unless they fix vulnerabilities or add features)

## Changelog Format

The project uses [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) with [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### File Location
```
CHANGELOG.md  (project root)
```

### Structure Template
```markdown
# Changelog

All notable changes to SocialiseIT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Feature description with context

### Changed
- What was changed and why

### Fixed
- Clear description of the bug and fix

### Security
- Security-related changes

---

## [X.Y.Z] - YYYY-MM-DD

### Added
- Released feature
```

## Workflow: After Completing Changes

### Step 1: Identify the Change Category

Ask yourself:
1. **Is this user-facing?** → If no, skip changelog
2. **What type of change?** → Added/Changed/Deprecated/Removed/Fixed/Security
3. **Is it breaking?** → If yes, document in `### Changed` with migration notes

### Step 2: Write a Clear Entry

**Good entry format:**
```markdown
- [Component/Feature] Brief description of what changed and user benefit
```

**Examples:**
```markdown
### Added
- [Video Editor] Audio import from TikTok and Instagram URLs with automatic format conversion
- [Analytics] Export dashboard data to CSV with date range filtering

### Fixed
- [Publisher] OAuth token refresh now handles expired tokens gracefully instead of failing silently
- [Calendar] Drag-and-drop no longer duplicates posts when dropping on week boundaries

### Changed
- [API] `/api/posts` now requires `workspaceId` query parameter (BREAKING)

### Security
- [Auth] Implemented rate limiting on login endpoint (10 attempts/minute)
```

**Avoid vague entries:**
```markdown
# BAD - Too vague
- Fixed a bug
- Updated the UI
- Made improvements

# GOOD - Specific and actionable
- [Composer] Fixed hashtag suggestions not appearing for LinkedIn posts
- [UI] Redesigned profile selector with searchable dropdown and keyboard navigation
- [Performance] Reduced dashboard initial load time by 40% via query optimization
```

### Step 3: Place Entry in Correct Section

1. Open `CHANGELOG.md`
2. Find the `## [Unreleased]` section
3. Add your entry under the appropriate subsection (`### Added`, `### Fixed`, etc.)
4. If the subsection doesn't exist, create it in this order:
   - Added
   - Changed
   - Deprecated
   - Removed
   - Fixed
   - Security

### Step 4: Group Related Changes

When implementing a feature with multiple changes, group them logically:

```markdown
### Added
**E-commerce Integration**
- [Shopify] Product catalog sync with automatic variant mapping
- [Shopify] Order tracking and ROI attribution
- [WooCommerce] Bi-directional inventory sync support
```

## Version Bumping Guidelines

When preparing a release, move entries from `[Unreleased]` to a new version section:

| SemVer Component | When to Bump | Example |
|------------------|--------------|---------|
| **MAJOR** (X.0.0) | Breaking API changes, major rewrites | Removal of deprecated endpoints |
| **MINOR** (0.X.0) | New features, backwards-compatible additions | New platform integration |
| **PATCH** (0.0.X) | Bug fixes, security patches, minor tweaks | OAuth token refresh fix |

### Release Checklist

1. Create new version heading: `## [X.Y.Z] - YYYY-MM-DD`
2. Move relevant entries from `[Unreleased]`
3. Update comparison links at bottom of file:
   ```markdown
   [Unreleased]: https://github.com/MerlinStacks/socialiseit/compare/vX.Y.Z...HEAD
   [X.Y.Z]: https://github.com/MerlinStacks/socialiseit/compare/vPREVIOUS...vX.Y.Z
   ```
4. Leave `[Unreleased]` section with empty subsections for next cycle

## Automated Validation

Before committing, verify:

1. **Date format**: `YYYY-MM-DD` (ISO 8601)
2. **Version order**: Newest versions first, `[Unreleased]` always at top
3. **Link validity**: All version links resolve to valid Git references
4. **Section order**: Added → Changed → Deprecated → Removed → Fixed → Security

## Integration with Task Completion

**When wrapping up a task**, mentally run through this checklist:

```
[ ] Did I add/modify user-facing functionality? → Add to changelog
[ ] Did I fix a bug? → Add to changelog (### Fixed)
[ ] Did I change existing behavior? → Add to changelog (### Changed)
[ ] Did I remove something? → Add to changelog (### Removed)
[ ] Did I address a security issue? → Add to changelog (### Security)
```

## Example: Complete Changelog Update

**Scenario**: You just implemented audio import from social media URLs.

**Edit to make:**
```markdown
## [Unreleased]

### Added
- [Media Library] Import audio from TikTok and Instagram URLs with server-side extraction using yt-dlp
- [Composer] Audio preview player in media picker with waveform visualization
```

---

> [!TIP]
> **Proactive habit**: Add changelog entries as you complete features, not at the end of a sprint. This prevents forgotten changes and ensures accurate documentation.
