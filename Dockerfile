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
    gosu \
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

RUN npm ci && npm install --no-save esbuild

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
# Tells first-run-check.ts to skip DB queries during build
ENV NEXT_PHASE="phase-production-build"
# BuildKit cache mount: persists .next/cache across builds for faster incremental rebuilds
RUN --mount=type=cache,target=/app/.next/cache npm run build

# -----------------------------------------------------------------------------
# Stage 5.5: Prisma CLI Dependencies (runs IN PARALLEL with webapp-builder)
# Docker BuildKit builds independent stages concurrently - no wall-clock penalty.
# prisma CLI has 30+ transitive deps that must be properly resolved by npm.
# -----------------------------------------------------------------------------
FROM node:20-slim AS prisma-cli-deps

WORKDIR /tmp/prisma-cli
COPY app/package.json ./
RUN npm install --ignore-scripts prisma@$(node -e "console.log(require('./package.json').devDependencies.prisma || '7.3.0')")

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

# Prisma runtime: CLI deps from parallel stage + build-generated client
COPY --from=webapp-builder /app/prisma ./prisma
COPY --from=webapp-builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=webapp-builder /app/src/generated/prisma ./src/generated/prisma
COPY --from=prisma-cli-deps /tmp/prisma-cli/node_modules ./node_modules
# Overlay the build-generated @prisma/client (schema-specific, from prisma generate)
COPY --from=webapp-builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=webapp-builder /app/node_modules/valibot ./node_modules/valibot

COPY app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p ./public/uploads ./public/uploads/transcoded && \
    chmod +x ./docker-entrypoint.sh && \
    chown -R nextjs:nodejs /app

# Why: USER is NOT set here. The entrypoint runs as root to fix volume
# permissions (Docker named volumes may be root-owned), then drops to
# nextjs via gosu. See docker-entrypoint.sh.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]


# Stage 8: Worker Builder (Compiles TS to JS - eliminates tsx transpilation at startup)
# -----------------------------------------------------------------------------
FROM source AS worker-builder

# Bundle worker entry point: all local TS is transpiled + path aliases resolved;
# node_modules packages stay external so native binaries (Prisma WASM etc.) load
# from their original paths at runtime. esbuild preserves __dirname per-module
# so relative binary/WASM loads in the generated Prisma client still resolve correctly.
# Why: Prisma's generated client.ts uses import.meta.url to locate its engine
# binary via fileURLToPath(import.meta.url). esbuild bundles it into a CommonJS
# output where import.meta.url is undefined, causing a crash at startup.
# Defining import.meta.url as the known container path gives Prisma a real URL
# so it can compute __dirname = /app/src/generated/prisma correctly.
RUN node_modules/.bin/esbuild src/workers/index.ts \
    --bundle \
    --platform=node \
    --packages=external \
    --tsconfig=tsconfig.json \
    '--define:import.meta.url="file:///app/src/generated/prisma/client.ts"' \
    --outfile=dist/worker.js

# -----------------------------------------------------------------------------
# Stage 9: Worker Runner (Uses compiled JS, no tsx transpilation on startup)
# -----------------------------------------------------------------------------
FROM source AS worker

ENV NODE_ENV=production

# Copy pre-compiled worker bundle
COPY --from=worker-builder /app/dist/worker.js ./dist/worker.js

COPY app/docker-entrypoint.worker.sh ./docker-entrypoint.worker.sh
RUN chmod +x ./docker-entrypoint.worker.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD pgrep -f "node" || exit 1

ENTRYPOINT ["./docker-entrypoint.worker.sh"]
