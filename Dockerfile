# =============================================================================
# SocialiseIT Production Dockerfile (Optimized for Portainer)
# Layer-cached multi-stage build for fast rebuilds
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Runtime Base (Shared by build AND final images)
# Chromium/FFmpeg installed ONCE here, reused everywhere
# -----------------------------------------------------------------------------
FROM node:20-slim AS runtime-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ffmpeg \
    chromium \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium

# -----------------------------------------------------------------------------
# Stage 2: Build Base (Extends runtime-base with build tools)
# -----------------------------------------------------------------------------
FROM runtime-base AS build-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Stage 3: Dependencies (Cached - changes only when package.json changes)
# -----------------------------------------------------------------------------
FROM build-base AS deps

WORKDIR /app

# Copy ONLY package files first (maximizes cache hits)
COPY app/package*.json ./
COPY app/prisma ./prisma
COPY app/prisma.config.ts ./prisma.config.ts

RUN npm ci

# Generate Prisma client before source copy (cached if schema unchanged)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# -----------------------------------------------------------------------------
# Stage 4: Source Build (Rebuilds when code changes, deps cached)
# -----------------------------------------------------------------------------
FROM deps AS source

# Now copy source code - this layer invalidates on code changes
# But deps layer above stays cached!
COPY app/ .

# -----------------------------------------------------------------------------
# Stage 5: Webapp Builder
# -----------------------------------------------------------------------------
FROM source AS webapp-builder

ENV NEXT_TELEMETRY_DISABLED=1
# Required for Next.js page data collection (Prisma client init check)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 6: Webapp Runner (Minimal - extends runtime-base, NO build tools)
# -----------------------------------------------------------------------------
FROM runtime-base AS webapp

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built artifacts
COPY --from=webapp-builder /app/public ./public
COPY --from=webapp-builder /app/.next/standalone ./
COPY --from=webapp-builder /app/.next/static ./.next/static

# Prisma runtime files (client + CLI for db push at startup)
COPY --from=webapp-builder /app/prisma ./prisma
COPY --from=webapp-builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=webapp-builder /app/src/generated/prisma ./src/generated/prisma
COPY --from=webapp-builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=webapp-builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=webapp-builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=webapp-builder /app/node_modules/valibot ./node_modules/valibot

COPY app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p ./public/uploads && \
    chmod +x ./docker-entrypoint.sh && \
    chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]


# Stage 8: Worker (Uses cached deps, skips Next.js build entirely)
# -----------------------------------------------------------------------------
FROM source AS worker

ENV NODE_ENV=production

COPY app/docker-entrypoint.worker.sh ./docker-entrypoint.worker.sh
RUN chmod +x ./docker-entrypoint.worker.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD pgrep -f "node" || exit 1

ENTRYPOINT ["./docker-entrypoint.worker.sh"]
