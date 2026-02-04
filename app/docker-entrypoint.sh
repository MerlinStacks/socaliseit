#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# =============================================================================
# NOTE: Prisma client is pre-generated during Docker build.
# Database migrations are run on startup.
# =============================================================================

set -e

echo "[Entrypoint] Starting application..."

# Set HOME to a writable directory for npm cache (nextjs user has no valid home)
export HOME=/tmp

# Use local prisma binary (already installed in node_modules)
PRISMA="./node_modules/.bin/prisma"

# Run database migrations
# For fresh installs, if migrate deploy fails (no migration history), 
# fall back to db push to create schema from scratch
echo "[Entrypoint] Running database migrations..."
if $PRISMA migrate deploy 2>&1; then
    echo "[Entrypoint] Migrations applied successfully"
else
    echo "[Entrypoint] Migration deploy failed, attempting db push for fresh install..."
    if $PRISMA db push --skip-generate 2>&1; then
        echo "[Entrypoint] Database schema pushed successfully"
    else
        echo "[Entrypoint] Warning: Both migrate deploy and db push failed"
    fi
fi

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
