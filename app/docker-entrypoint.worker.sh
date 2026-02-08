#!/bin/sh
# =============================================================================
# SocialiseIT Worker Entrypoint
# Syncs database schema before starting background job processor
# =============================================================================

set -e

# Source auto-generated secrets from init container (quickstart mode)
if [ -f /secrets/.env ]; then
    echo "[Worker] Loading auto-generated secrets..."
    set -a
    . /secrets/.env
    set +a
fi

# Auto-generate ENCRYPTION_KEY if still missing (worker needs it for credential decryption)
if [ -z "$ENCRYPTION_KEY" ]; then
    export ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64)
    echo "[Worker] WARNING: ENCRYPTION_KEY was empty — auto-generated. Set it in your stack env for consistency."
    if [ -d /secrets ] && [ -w /secrets ]; then
        echo "ENCRYPTION_KEY=\"${ENCRYPTION_KEY}\"" >> /secrets/.env
        chmod 600 /secrets/.env 2>/dev/null || true
    fi
fi

echo "[Worker] Generating Prisma client..."
./node_modules/.bin/prisma generate

# Run data migration to populate organizationId before schema sync
# This is needed because existing rows need organizationId before making it required
echo "[Worker] Running pre-migration fixes..."
if [ -f "prisma/migrations/20260204_fix_organization_id/migration.sql" ]; then
    # Use prisma db execute to run the SQL migration
    ./node_modules/.bin/prisma db execute --file prisma/migrations/20260204_fix_organization_id/migration.sql 2>/dev/null || echo "[Worker] Pre-migration already applied or not needed"
fi

echo "[Worker] Syncing database schema..."
./node_modules/.bin/prisma db push --accept-data-loss

echo "[Worker] Starting job processor..."
exec ./node_modules/.bin/tsx src/workers/index.ts
