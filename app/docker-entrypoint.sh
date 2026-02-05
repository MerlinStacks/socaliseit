#!/bin/sh
# =============================================================================
# SocialiseIT Production Entrypoint
# =============================================================================
# Handles:
# 1. Data migrations (before schema changes)
# 2. Database schema sync via Prisma
# 3. Application startup
# =============================================================================

set -e

echo "[Entrypoint] Starting application..."

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

# ---------------------------------------------------------------------------
# Database Migrations
# ---------------------------------------------------------------------------
# Run data migration SQL first (copies org-level settings to global tables)
# This is idempotent and safe to run multiple times
if [ -f "./prisma/migrations/data_migration_to_global_settings.sql" ]; then
    echo "[Entrypoint] Running data migration to global settings..."
    # Use npx to run psql via prisma's database connection
    # The SQL uses ON CONFLICT so it's safe to run repeatedly
    npx prisma db execute --file ./prisma/migrations/data_migration_to_global_settings.sql 2>&1 || echo "[Entrypoint] Data migration skipped (tables may not exist yet)"
fi

# Sync database schema with Prisma
echo "[Entrypoint] Syncing database schema..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 || {
    echo "[Entrypoint] WARNING: Schema sync failed, app may have issues"
}
echo "[Entrypoint] Database sync complete!"

# ---------------------------------------------------------------------------
# Start Application
# ---------------------------------------------------------------------------
# Ensure Next.js binds to all interfaces (required for Docker health checks)
export HOSTNAME="0.0.0.0"

exec node server.js
