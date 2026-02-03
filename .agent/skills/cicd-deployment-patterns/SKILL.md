---
name: cicd-deployment-patterns
description: Master CI/CD pipelines, Docker production builds, and deployment automation. Use when setting up GitHub Actions, Portainer stacks, or implementing zero-downtime deployments.
---

# CI/CD & Deployment Patterns

Expert guide for continuous integration, delivery, and production deployments.

## When to Use This Skill

- Setting up GitHub Actions workflows
- Creating Docker multi-stage builds
- Deploying with Portainer/Docker Compose
- Implementing zero-downtime deployments
- Managing secrets and environment variables

## GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test -- --coverage

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}
      
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## Docker Multi-Stage Build

```dockerfile
# Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

## Docker Compose Production

```yaml
# docker-compose.prod.yml
services:
  app:
    image: ghcr.io/org/app:latest
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first

  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

volumes:
  postgres_data:
  redis_data:
```

## Zero-Downtime Deploy Script

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

IMAGE=$1
STACK_NAME="myapp"

echo "Pulling latest image..."
docker pull $IMAGE

echo "Updating stack..."
docker stack deploy -c docker-compose.prod.yml $STACK_NAME --with-registry-auth

echo "Waiting for health check..."
sleep 30

# Verify deployment
HEALTHY=$(docker service ls --filter "name=${STACK_NAME}_app" --format "{{.Replicas}}")
if [[ "$HEALTHY" != "2/2" ]]; then
  echo "Deployment failed, rolling back..."
  docker service rollback ${STACK_NAME}_app
  exit 1
fi

echo "Deployment successful!"
```

## Secrets Management

```yaml
# GitHub Actions secrets
- name: Create .env file
  run: |
    echo "DATABASE_URL=${{ secrets.DATABASE_URL }}" >> .env
    echo "REDIS_PASSWORD=${{ secrets.REDIS_PASSWORD }}" >> .env

# Docker secrets (Swarm)
secrets:
  db_password:
    external: true

services:
  app:
    secrets:
      - db_password
    environment:
      - DATABASE_PASSWORD_FILE=/run/secrets/db_password
```

## Health Check Endpoint

```typescript
// app/api/health/route.ts
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function GET() {
  const checks = {
    database: false,
    redis: false,
    timestamp: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {}

  try {
    await redis.ping();
    checks.redis = true;
  } catch {}

  const healthy = checks.database && checks.redis;
  
  return Response.json(checks, { status: healthy ? 200 : 503 });
}
```

## Best Practices

1. **Use multi-stage builds** - Minimize final image size
2. **Pin versions** - Avoid `latest` tags in production
3. **Health checks** - Enable automatic recovery
4. **Rolling updates** - Deploy without downtime
5. **Secrets management** - Never commit secrets
6. **Cache dependencies** - Speed up builds
