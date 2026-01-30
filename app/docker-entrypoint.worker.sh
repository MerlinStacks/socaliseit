#!/bin/sh
# =============================================================================
# SocialiseIT Worker Entrypoint
# Syncs database schema before starting background job processor
# =============================================================================

set -e

echo "[Worker] Syncing database schema..."
./node_modules/.bin/prisma db push --accept-data-loss

echo "[Worker] Starting job processor..."
exec ./node_modules/.bin/tsx src/workers/index.ts
