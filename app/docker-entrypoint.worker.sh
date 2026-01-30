#!/bin/sh
# =============================================================================
# SocialiseIT Worker Entrypoint
# Syncs database schema before starting background job processor
# =============================================================================

set -e

echo "[Worker] Syncing database schema..."
npx prisma db push --skip-generate --accept-data-loss

echo "[Worker] Starting job processor..."
exec npx tsx src/workers/index.ts
