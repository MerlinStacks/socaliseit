# Overseek Socials App

This directory contains the main web application for Overseek Socials, built with Next.js App Router and TypeScript.

## Local development

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000` when started directly.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Generate Prisma client and build app
- `npm run start` - Run production build
- `npm run lint` - Run ESLint
- `npm run test` - Run Vitest unit tests
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run test:coverage` - Run unit tests with coverage
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Apply production migrations
- `npm run worker` - Start background worker process

## Core stack

- Next.js 16 + React 19
- TypeScript 5
- Prisma ORM + PostgreSQL
- NextAuth authentication
- Redis + BullMQ for async jobs
- Stripe for billing

## Notes

- Environment variables are managed from the repo root via `stack.env` for Docker workflows.
- OAuth providers and OpenRouter credentials must be configured for social publishing and AI features.
