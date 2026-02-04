#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# =============================================================================
# NOTE: Prisma client is pre-generated during Docker build.
# Database migrations should be run manually or via worker.
# =============================================================================

set -e

echo "[Entrypoint] Starting application..."

# Run database migrations
echo "[Entrypoint] Running database migrations..."
npx prisma migrate deploy || echo "[Entrypoint] Warning: Migration failed or skipped"

# Ensure uploads directory exists and is writable
# This handles fresh volume mounts where the directory may not exist
UPLOADS_DIR="/app/public/uploads"
if [ ! -d "$UPLOADS_DIR" ]; then
    echo "[Entrypoint] Creating uploads directory..."
    mkdir -p "$UPLOADS_DIR"
fi

# Verify write access
if [ ! -w "$UPLOADS_DIR" ]; then
    echo "[Entrypoint] ERROR: Uploads directory is not writable: $UPLOADS_DIR"
    echo "[Entrypoint] Please run: docker run --rm -v socialiseit-uploads-data:/data alpine chown -R 1001:1001 /data"
    exit 1
fi

echo "[Entrypoint] Uploads directory ready: $UPLOADS_DIR"

# Ensure Next.js binds to all interfaces (required for Docker health checks)
export HOSTNAME="0.0.0.0"

exec node server.js
