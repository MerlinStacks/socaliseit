#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# Runs database migrations before starting the application
# =============================================================================

set -e

echo "[Entrypoint] Running database migrations..."
npx prisma migrate deploy

echo "[Entrypoint] Starting application..."
exec node server.js
