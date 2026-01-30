#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# Runs database migrations before starting the application
# =============================================================================

set -e

echo "[Entrypoint] Syncing database schema..."
node ./node_modules/prisma/build/index.js db push --accept-data-loss

echo "[Entrypoint] Starting application..."
exec node server.js
