#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# =============================================================================
# NOTE: Database migrations are NOT run automatically.
# The standalone Next.js build doesn't include Prisma CLI dependencies.
# 
# Before first deployment, run migrations manually:
#   docker exec -it socialiseit-webapp sh
#   npx prisma db push  (or: npx prisma migrate deploy)
#
# Or use a one-off container:
#   docker run --rm --env-file stack.env socialiseit-webapp npx prisma db push
# =============================================================================

set -e

echo "[Entrypoint] Starting application..."
exec node server.js
