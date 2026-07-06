#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$APP_DIR"
MODE="${1:-all}"
[[ "$MODE" == "all" || "$MODE" == "--nginx-only" ]] || { echo "Usage: sudo bash scripts/repair-auth-routing.sh [--nginx-only]"; exit 2; }

log() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

[[ -f .env ]] || fail "Missing $APP_DIR/.env"
PORT_VALUE="$(node scripts/read-env-value.js PORT)"
PUBLIC_URL="$(node scripts/read-env-value.js PUBLIC_APP_URL)"
DOMAIN_VALUE="$(node -e "try{console.log(new URL(process.argv[1]).hostname)}catch{}" "$PUBLIC_URL")"
[[ -n "$DOMAIN_VALUE" ]] || fail "PUBLIC_APP_URL does not contain a valid domain"

if [[ "$MODE" == "all" ]]; then
  log "Repairing the browser API base"
  node scripts/configure-production-env.js
  node scripts/validate-production-env.js
  grep -q '^VITE_API_URL=/api/v1$' .env || fail "VITE_API_URL was not repaired to /api/v1"

  log "Rebuilding and restarting SecureAsset"
  npm run build
  APP_DIR="$APP_DIR" node scripts/reconcile-pm2-release.js --prepare
  ./node_modules/.bin/pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --env production --update-env
  APP_DIR="$APP_DIR" node scripts/reconcile-pm2-release.js --verify
  ./node_modules/.bin/pm2 save
fi

log "Checking the API directly on port $PORT_VALUE"
node scripts/verify-auth-routing.js "http://127.0.0.1:${PORT_VALUE}"

AAPANEL_ROOT="/www/server/panel/vhost/nginx"
VHOST_FILE=""
if [[ -d "$AAPANEL_ROOT" ]]; then
  while IFS= read -r candidate; do
    if grep -Eq "server_name[[:space:]][^;]*\b${DOMAIN_VALUE//./\\.}\b" "$candidate"; then VHOST_FILE="$candidate"; break; fi
  done < <(find "$AAPANEL_ROOT" -maxdepth 1 -type f -name '*.conf' -print 2>/dev/null | sort)
fi

if [[ -n "$VHOST_FILE" ]]; then
  log "Reconciling the active aaPanel vhost for $DOMAIN_VALUE"
  EXT_DIR="$AAPANEL_ROOT/extension/$DOMAIN_VALUE"
  LEGACY_TARGET="$EXT_DIR/secureasset-api.conf"
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  VHOST_BACKUP="${VHOST_FILE}.secureasset-backup-${TIMESTAMP}"
  LEGACY_BACKUP="${LEGACY_TARGET}.backup-${TIMESTAMP}"
  LEGACY_EXISTED=0

  cp -a "$VHOST_FILE" "$VHOST_BACKUP"
  if [[ -f "$LEGACY_TARGET" ]]; then
    LEGACY_EXISTED=1
    cp -a "$LEGACY_TARGET" "$LEGACY_BACKUP"
  fi

  rollback_nginx_changes() {
    cp -a "$VHOST_BACKUP" "$VHOST_FILE"
    if [[ "$LEGACY_EXISTED" == "1" ]]; then
      mkdir -p "$EXT_DIR"
      cp -a "$LEGACY_BACKUP" "$LEGACY_TARGET"
    else
      rm -f "$LEGACY_TARGET"
    fi
  }

  # v7 used an extension include and could collide with a manually configured
  # /api/ location. v8 reconciles all SecureAsset paths directly inside the
  # active HTTPS server block and removes only the obsolete SecureAsset
  # extension file.
  node scripts/reconcile-aapanel-vhost.js "$VHOST_FILE" "$DOMAIN_VALUE" "$PORT_VALUE"
  rm -f "$LEGACY_TARGET"

  if [[ -x "/www/server/nginx/sbin/nginx" ]]; then
    NGINX_BIN="/www/server/nginx/sbin/nginx"
  else
    NGINX_BIN="$(command -v nginx || true)"
  fi
  [[ -x "$NGINX_BIN" ]] || fail "Nginx binary was not found"

  if ! "$NGINX_BIN" -t; then
    rollback_nginx_changes
    "$NGINX_BIN" -t || true
    fail "Nginx rejected the reconciled SecureAsset proxy; the previous vhost was restored"
  fi
  if ! "$NGINX_BIN" -s reload; then
    rollback_nginx_changes
    "$NGINX_BIN" -t || true
    "$NGINX_BIN" -s reload || true
    fail "Nginx could not reload the reconciled SecureAsset proxy; the previous vhost was restored"
  fi
  echo "aaPanel vhost reconciled and Nginx reloaded successfully."
  echo "Vhost backup retained at: $VHOST_BACKUP"
else
  echo "No aaPanel vhost was found for $DOMAIN_VALUE. Existing system/reverse-proxy configuration was left unchanged."
fi

log "Checking authentication through the public website"
if node scripts/verify-auth-routing.js "$PUBLIC_URL"; then
  node scripts/verify-public-assets.js "$PUBLIC_URL"
  echo "Login, registration, and production assets are working through $PUBLIC_URL"
else
  cat >&2 <<MESSAGE

The Node API is healthy, but the public website is not forwarding /api/ correctly.
In aaPanel > Website > $DOMAIN_VALUE > Config, place the contents of:
  $APP_DIR/deploy/nginx/secureasset-aapanel-api.conf.template
inside the active server block, replace PORT with $PORT_VALUE, save, test Nginx, and reload it.
MESSAGE
  exit 1
fi
