<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Overseek Socials Dashboard" width="800"/>
</p>

<h1 align="center">Overseek Socials</h1>

<p align="center">
  <strong>AI-powered social media management for brands and agencies</strong>
</p>

<p align="center">
  Plan, publish, analyze, and collaborate across channels from one workspace.
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> •
  <a href="#core-capabilities">Core capabilities</a> •
  <a href="#quick-start">Quick start</a> •
  <a href="#tech-stack">Tech stack</a> •
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma" alt="Prisma"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker" alt="Docker"/>
</p>

## What it does

Overseek Socials is a full social media operations platform built for teams that need speed, consistency, and visibility. It combines multi-platform scheduling, AI-assisted content workflows, and cross-channel analytics in one product.

## Core capabilities

- **Multi-platform publishing**: Compose once and publish to Instagram, TikTok, YouTube, Facebook, Pinterest, Bluesky, and Google Business Profile.
- **AI content engine**: Generate captions, rewrite copy, create alt text, suggest tags, and keep output aligned with your brand voice.
- **Content calendar**: Use drag-and-drop week/month planning with visual platform cues and quick post creation.
- **Analytics and ROI tracking**: Monitor post performance and connect Shopify or WooCommerce for revenue attribution.
- **Reputation and engagement**: Track interactions, review sentiment, and manage responses from a unified workflow.
- **Team operations**: Support role-based access, workspace isolation, and collaboration for agencies managing multiple brands.

### Advisory inbox presence (backend API)

Presence is **advisory only, never a lock**: it neither reserves an inbox item nor prevents concurrent replies or notes. It stores no drafts or message content and requires no schema migration or frontend integration.

- `GET /api/inbox/presence?id=localRowId&type=comment|mention|dm|review&socialAccountId=...`
- `PUT /api/inbox/presence` with JSON `{id,type,socialAccountId,tabId,state}`; `tabId` must be a UUID and `state` is `viewing`, `replying`, or `noting`.
- GET and PUT return `{data:{participants:[{userId,name,state,updatedAt}],ttlSeconds:45}}`. `updatedAt` is an ISO timestamp. All tabs of the current user are excluded. Other users are grouped by highest activity (`replying > noting > viewing`), using the newest lease at that priority for name/timestamp, sorted by user ID.
- `DELETE /api/inbox/presence` with JSON `{id,type,socialAccountId,tabId}` releases only the authenticated user's specified tab and returns `{success:true}` (also when already absent).

Every request checks current organization membership and resolves an owned local row/account. DMs share presence across local messages in the same account/conversation. VIEWER can read, heartbeat `viewing`, and release; `replying`/`noting` require collaboration write permission (including same-organization CUSTOM `posts.edit`). Actor identity/name come from server-side membership, never request data.

Redis uses app `REDIS_URL` (default `redis://localhost:6379`) with a dedicated connection, a 1-second total Redis deadline, and no retries/offline queue. Atomic hash/sorted-set leases expire independently after 45 seconds; reads do not renew them. Maximum 200 active user/tab leases per canonical item; existing leases can refresh at capacity. New leases at capacity return 429. IDs are bounded to 256 characters, JSON bodies to 4096 bytes, and unknown fields/duplicate query parameters are rejected. Errors are explicit: 400 invalid input, 401 unauthenticated, 403 membership/write permission, 404 unowned/missing item, 413 oversized body, 429 capacity, 503 Redis failure/timeout, 500 unexpected backend failure. Responses are private/no-store; 503 never masquerades as an empty participant list.

Clients must heartbeat before expiry and treat missing/stale presence as advisory. Abruptly closed tabs and permission/name changes can remain visible until expiry or the next heartbeat. Concurrent requests are ordered by Redis arrival, so a late heartbeat can recreate a released lease. A timed-out write may have reached Redis; its lease still expires normally. No polling/SSE client or reply exclusion is provided by this backend.

Presence tests live in `app/src/app/api/inbox/presence/__tests__/`. Mocked transport/API and pure aggregation tests run normally. The Lua integration suite is opt-in via `INBOX_PRESENCE_TEST_REDIS_URL` pointing to a disposable **test-only** Redis instance; it uses random test keys and deletes only those keys, with no scans or flushes. Never point this test variable at production.

## Screenshots

<details>
<summary><strong>Analytics Dashboard</strong></summary>
<br/>
<img src="docs/screenshots/analytics.png" alt="Analytics Dashboard" width="800"/>
</details>

<details>
<summary><strong>Post Composer</strong></summary>
<br/>
<img src="docs/screenshots/composer.png" alt="Post Composer" width="800"/>
</details>

<details>
<summary><strong>Content Calendar</strong></summary>
<br/>
<img src="docs/screenshots/calendar.png" alt="Content Calendar" width="800"/>
</details>

<details>
<summary><strong>Media Library</strong></summary>
<br/>
<img src="docs/screenshots/media-library.png" alt="Media Library" width="800"/>
</details>

## Quick start

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ (local development)

### 1) Clone and configure

```bash
git clone https://github.com/MerlinStacks/socaliseit.git
cd socaliseit
cp stack.env.example stack.env
```

Update `stack.env` with database values, OAuth provider credentials, and your `OPENROUTER_API_KEY`.

### 2) Start services

```bash
docker-compose up -d
```

Open `http://localhost:6754`.

### 3) Finish setup

1. Register your workspace owner account.
2. Connect at least one social platform.
3. Create and schedule your first post.

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js App Router |
| Frontend | React 19 + Tailwind CSS 4 |
| Backend | Next.js API routes + background workers |
| Database | PostgreSQL + Prisma ORM |
| Queue | Redis + BullMQ |
| Auth | NextAuth (OAuth + credentials + TOTP) |
| Billing | Stripe |
| Deployment | Docker Compose |

## Project structure

```text
socaliseit/
├── app/
│   ├── src/                # Next.js app, API routes, components, services
│   └── prisma/             # Prisma schema and migrations
├── docs/                   # Product and technical docs
├── docker-compose.yml
└── docker-compose.dev.yml
```

## Development

```bash
cd app
npm install
npm run dev
```

Common commands:

```bash
npm run build
npm run test
npm run test:e2e
npm run test:coverage
npm run db:generate
npm run db:migrate
```

## License

MIT. See `LICENSE` for details.

## GitHub About suggestion

If you want repo metadata to match this README, use this as the GitHub About text:

`AI-powered social media management platform for brands and agencies. Plan, publish, analyze, and collaborate across channels from one workspace.`
