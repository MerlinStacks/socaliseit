---
name: docker-compose-patterns
description: Advanced multi-container orchestration, health checks, networking, and dev/prod parity for Docker environments.
---

# Docker Compose Patterns

## Development Configuration

```yaml
# docker-compose.yml
services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./app/src:/app/src:cached
      - ./app/public:/app/public:cached
      - app_node_modules:/app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://user:pass@db:5432/app
    depends_on:
      db:
        condition: service_healthy
    command: sh -c "npm install && npm run dev"

  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: app
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  app_node_modules:  # Named volume prevents node_modules conflicts
  postgres_data:
  redis_data:
```

## Production Dockerfile

```dockerfile
# Dockerfile
FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

## Health Checks

```yaml
services:
  app:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

```typescript
// app/api/health/route.ts
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'healthy', db: 'connected' });
  } catch {
    return Response.json({ status: 'unhealthy' }, { status: 503 });
  }
}
```

## Environment Management

```yaml
# docker-compose.override.yml (dev only, auto-loaded)
services:
  app:
    env_file:
      - .env.local
    volumes:
      - ./app:/app:cached
```

```bash
# Commands
docker compose up -d              # Start services
docker compose logs -f app        # Follow logs
docker compose exec app sh        # Shell into container
docker compose down -v            # Stop and remove volumes
docker compose build --no-cache   # Rebuild without cache
```

## Multi-Stage Builds

```dockerfile
# Use --target for different stages
# docker build --target dev -t app:dev .
# docker build --target prod -t app:prod .

FROM node:20-slim AS base
FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS prod
CMD ["node", "server.js"]
```
