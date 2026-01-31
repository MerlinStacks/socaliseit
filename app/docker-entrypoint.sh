#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# =============================================================================
# NOTE: Prisma client is pre-generated during Docker build.
# Database migrations should be run manually or via worker.
# =============================================================================

set -e

echo "[Entrypoint] Starting application..."

# Ensure Next.js binds to all interfaces (required for Docker health checks)
export HOSTNAME="0.0.0.0"

exec node server.js
