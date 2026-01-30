# =============================================================================
# SocialiseIT Production Dockerfile
# Unified multi-stage build for webapp and worker
# =============================================================================

# -----------------------------------------------------------------------------
# Stage: Base Dependencies
# Shared base for both webapp and worker with Prisma client generation
# -----------------------------------------------------------------------------
FROM node:20-slim AS base

# Install runtime + build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    build-essential \
    python3 \
    ffmpeg \
    chromium \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files and install all dependencies
COPY app/package*.json ./
RUN npm ci

# Copy Prisma schema
COPY app/prisma ./prisma

# Generate Prisma client with extensive debugging
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Step 1: Verify system
RUN echo "Step 1: System check" && uname -a && node --version && npm --version

# Step 2: Verify Prisma schema
RUN echo "Step 2: Schema check" && ls -la prisma/ && head -10 prisma/schema.prisma

# Step 3: Verify Prisma package
RUN echo "Step 3: Prisma version" && cat node_modules/prisma/package.json | head -5

# Step 4: Generate Prisma client
RUN echo "Step 4: Prisma generate" && npx prisma generate

# Copy source code
COPY app/ .

# -----------------------------------------------------------------------------
# Stage: Webapp Builder
# Build the Next.js application
# -----------------------------------------------------------------------------
FROM base AS webapp-builder

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# -----------------------------------------------------------------------------
# Stage: Webapp Runner
# Minimal production runtime for Next.js
# -----------------------------------------------------------------------------
FROM node:20-slim AS webapp

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ffmpeg \
    chromium \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=webapp-builder /app/public ./public
COPY --from=webapp-builder /app/.next/standalone ./
COPY --from=webapp-builder /app/.next/static ./.next/static

# Copy Prisma files for runtime
COPY --from=webapp-builder /app/prisma ./prisma
COPY --from=webapp-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=webapp-builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy entrypoint script
COPY app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

# -----------------------------------------------------------------------------
# Stage: Worker
# Background job processor
# -----------------------------------------------------------------------------
FROM base AS worker

ENV NODE_ENV=production

# Copy entrypoint script
COPY app/docker-entrypoint.worker.sh ./docker-entrypoint.worker.sh
RUN chmod +x ./docker-entrypoint.worker.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD pgrep -f "node" || exit 1

ENTRYPOINT ["./docker-entrypoint.worker.sh"]
