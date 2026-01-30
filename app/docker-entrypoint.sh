#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# =============================================================================
# NOTE: Prisma client is pre-generated during Docker build.
# Database migrations should be run manually or via worker.
# =============================================================================

set -e

echo "[Entrypoint] Starting application..."
exec node server.js
