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
