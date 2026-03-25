#!/bin/sh
# =============================================================================
# SocialiseIT Worker Entrypoint
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
        chmod 644 /secrets/.env 2>/dev/null || true
    fi
fi

# Ensure uploads/transcoded directory exists for publish-time video transcoding
UPLOADS_DIR="/app/public/uploads"
mkdir -p "$UPLOADS_DIR/transcoded"

echo "[Worker] Starting job processor..."
exec node dist/worker.js
