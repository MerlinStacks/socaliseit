#!/bin/sh
# =============================================================================
# SocialiseIT Secret Initializer
# Runs once on first boot to auto-generate secrets, then exits.
# Secrets persist on a shared volume so they survive restarts.
# =============================================================================

SECRETS_FILE="/secrets/.env"

# Ensure the secrets directory exists
mkdir -p /secrets

if [ -f "$SECRETS_FILE" ]; then
    echo "[Init] Secrets already exist at $SECRETS_FILE — skipping generation."
    exit 0
fi

echo "[Init] First run detected — generating secrets..."

# Generate cryptographically secure secrets using /dev/urandom (available on all Linux)
# No openssl dependency needed
AUTH_SECRET=$(head -c 32 /dev/urandom | base64)
ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64)

cat > "$SECRETS_FILE" <<EOF
AUTH_SECRET=${AUTH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
EOF

chmod 600 "$SECRETS_FILE"

echo "[Init] Secrets written to $SECRETS_FILE"
echo "[Init] WARNING: Back up this file! Losing ENCRYPTION_KEY will break encrypted credentials."

