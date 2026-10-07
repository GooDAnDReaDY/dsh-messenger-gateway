#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# deploy.sh — Production deployment runner for @goodandready/dsh-messenger-gateway
# ==============================================================================

PROFILE="${1:-web}"
VERSION="${2:-latest}"
PKG="@goodandready/dsh-messenger-gateway"
PORT="${DSH_PORT:-3080}"

echo "==> Deploying ${PKG}@${VERSION} to DSH profile '${PROFILE}'..."

# Ensure environment
export PATH="/home/vadim/.nvm/versions/node/v24.15.0/bin:/home/vadim/.ssh/bin:/home/vadim/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export HOME="${HOME:-/home/vadim}"

# Install / update plugin in specified profile
dsh plugin --profile "${PROFILE}" add "${PKG}@${VERSION}"

# Restart DSH service for profile
SERVICE_NAME="dsh-${PROFILE}.service"
echo "==> Restarting ${SERVICE_NAME}..."
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart "${SERVICE_NAME}"
fi

# Wait for service to initialize
sleep 3

# Verify health status
echo "==> Verifying plugin status at http://127.0.0.1:${PORT}/dsh-messenger-gateway/status..."
STATUS_OUTPUT=$(curl -fsS "http://127.0.0.1:${PORT}/dsh-messenger-gateway/status" || true)

if echo "${STATUS_OUTPUT}" | grep -q '"ok":true'; then
  echo "==> Deployment successful: ${STATUS_OUTPUT}"
else
  echo "ERROR: Deployment failed or service is not healthy: ${STATUS_OUTPUT}" >&2
  exit 1
fi
