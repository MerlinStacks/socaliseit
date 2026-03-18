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

# Source auto-generated secrets from init container (quickstart mode)
# These override any existing env vars only if the secrets file exists
if [ -f /secrets/.env ]; then
    echo "[Entrypoint] Loading auto-generated secrets..."
    set -a
    . /secrets/.env
    set +a
fi

# Auto-generate critical secrets if still missing (Portainer deploys without init container)
SECRETS_GENERATED=false
if [ -z "$AUTH_SECRET" ]; then
    export AUTH_SECRET=$(head -c 32 /dev/urandom | base64)
    echo "[Entrypoint] WARNING: AUTH_SECRET was empty — auto-generated. Set it in your stack env for consistency."
    SECRETS_GENERATED=true
fi
if [ -z "$ENCRYPTION_KEY" ]; then
    export ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64)
    echo "[Entrypoint] WARNING: ENCRYPTION_KEY was empty — auto-generated. Set it in your stack env for consistency."
    SECRETS_GENERATED=true
fi

# Persist generated secrets so they survive container restarts
if [ "$SECRETS_GENERATED" = "true" ] && [ -d /secrets ] && [ -w /secrets ]; then
    cat > /secrets/.env <<EOF
AUTH_SECRET="${AUTH_SECRET}"
ENCRYPTION_KEY="${ENCRYPTION_KEY}"
EOF
    chmod 644 /secrets/.env 2>/dev/null || true
    echo "[Entrypoint] Secrets persisted to /secrets/.env"
fi

echo "[Entrypoint] Starting application..."

# ---------------------------------------------------------------------------
# Volume Permission Fix (runs as root)
# ---------------------------------------------------------------------------
# Why: Docker named volumes retain ownership from the first container that
# populated them. If the worker (root) or an older image created the volume,
# files are root-owned. The nextjs user (uid 1001) can't write to them.
# Fix: create dirs + chown as root here, then drop to nextjs via gosu.
UPLOADS_DIR="/app/public/uploads"
mkdir -p "$UPLOADS_DIR/transcoded"
chown -R nextjs:nodejs "$UPLOADS_DIR"
echo "[Entrypoint] Uploads directory ready: $UPLOADS_DIR"

# ---------------------------------------------------------------------------
# Database Migrations
# ---------------------------------------------------------------------------
# Run data migration SQL first (copies org-level settings to global tables)
# This is idempotent and safe to run multiple times
if [ -f "./prisma/migrations/data_migration_to_global_settings.sql" ]; then
    echo "[Entrypoint] Running data migration to global settings..."
    # Use direct path to prisma since npx is not available in standalone output
    node ./node_modules/prisma/build/index.js db execute --file ./prisma/migrations/data_migration_to_global_settings.sql 2>&1 || echo "[Entrypoint] Data migration skipped (tables may not exist yet)"
fi

# Sync database schema with Prisma
echo "[Entrypoint] Syncing database schema..."
node ./node_modules/prisma/build/index.js db push --accept-data-loss 2>&1 || {
    echo "[Entrypoint] WARNING: Schema sync failed, app may have issues"
}
echo "[Entrypoint] Database sync complete!"

# ---------------------------------------------------------------------------
# Start Application (drop privileges to nextjs)
# ---------------------------------------------------------------------------
# Ensure Next.js binds to all interfaces (required for Docker health checks)
export HOSTNAME="0.0.0.0"

# Why: gosu replaces the current process (exec-style) with the node process
# running as the unprivileged nextjs user. No root process remains.
exec gosu nextjs node server.js
