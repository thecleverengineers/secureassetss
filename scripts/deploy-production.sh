#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$APP_DIR"
echo "Application directory: $APP_DIR"
RELEASE_ID="$(cat "$APP_DIR/RELEASE_ID" 2>/dev/null || echo unknown)"
echo "Release: $RELEASE_ID"

if [[ "$APP_DIR" == *"/.Recycle_bin/"* || "$APP_DIR" == */.Recycle_bin ]]; then
  echo "ERROR: aaPanel has moved this shell's old application directory into .Recycle_bin." >&2
  echo "Open a fresh shell location before deploying: cd / && cd /www/secureasset && sudo bash deploy.sh" >&2
  echo "Deployment was stopped to prevent upgrading a deleted copy of the application." >&2
  exit 1
fi

DEPLOY_MODE="${DEPLOY_MODE:-upgrade}"       # upgrade | fresh
PORT="${PORT:-5000}"
INSTALL_NODE="${INSTALL_NODE:-1}"
INSTALL_CLAMAV="${INSTALL_CLAMAV:-1}"
CONFIGURE_NGINX="${CONFIGURE_NGINX:-auto}" # auto | 1 | 0
ENABLE_SSL="${ENABLE_SSL:-0}"
SSL_EMAIL="${SSL_EMAIL:-}"
SKIP_DB_BACKUP="${SKIP_DB_BACKUP:-0}"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
SKIP_PM2_STARTUP="${SKIP_PM2_STARTUP:-0}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-30}"
DEPLOY_USER="${DEPLOY_USER:-$(id -un)}"
DEPLOY_HOME="${DEPLOY_HOME:-$(getent passwd "$DEPLOY_USER" 2>/dev/null | cut -d: -f6 || true)}"
DEPLOY_HOME="${DEPLOY_HOME:-$HOME}"

mkdir -p logs backups
LOG_FILE="$APP_DIR/logs/deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

on_error() {
  local exit_code=$?
  echo
  echo "Deployment failed at line ${BASH_LINENO[0]} (exit ${exit_code})."
  echo "Log: $LOG_FILE"
  exit "$exit_code"
}
trap on_error ERR

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$1"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$1"; exit 1; }

SUDO=""
if [[ $EUID -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || fail "sudo is required for system package, Nginx, or PM2 startup configuration."
  SUDO="sudo"
  if [[ "$DEPLOY_USER" != "$(id -un)" ]]; then fail "Run the script as DEPLOY_USER or invoke it as root."; fi
fi

id "$DEPLOY_USER" >/dev/null 2>&1 || fail "DEPLOY_USER does not exist: $DEPLOY_USER"
DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"

run_app() {
  if [[ $EUID -eq 0 && "$DEPLOY_USER" != "root" ]]; then
    runuser -u "$DEPLOY_USER" -- env HOME="$DEPLOY_HOME" PATH="$PATH" "$@"
  else
    "$@"
  fi
}

if [[ "$DEPLOY_MODE" != "upgrade" && "$DEPLOY_MODE" != "fresh" ]]; then
  fail "DEPLOY_MODE must be upgrade or fresh."
fi

install_node_if_needed() {
  local version="0.0.0"
  if command -v node >/dev/null 2>&1; then version="$(node -p "process.versions.node")"; fi
  if node -e "const [a,b,c]=process.versions.node.split('.').map(Number);process.exit(a===24&&(b>18||(b===18&&c>=0))?0:1)" 2>/dev/null; then
    echo "Node.js $(node --version) detected."
    return
  fi
  [[ "$INSTALL_NODE" == "1" ]] || fail "Node.js >=24.18.0 <25 is required. Current version: $version"
  command -v apt-get >/dev/null 2>&1 || fail "Automatic Node installation currently supports Debian/Ubuntu. Install Node.js 24 LTS manually."
  step "Installing Node.js 24 LTS"
  $SUDO apt-get update -y
  $SUDO apt-get install -y ca-certificates curl gnupg
  if [[ -n "$SUDO" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | $SUDO -E bash -
  else
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  fi
  $SUDO apt-get install -y nodejs
  hash -r
  node --version
  npm --version
  node scripts/check-runtime.js
}


step "Runtime preflight"
install_node_if_needed
CURRENT_NPM="$(npm --version 2>/dev/null || echo 0.0.0)"
if ! node -e "const v=process.argv[1].split('.').map(Number);process.exit(v[0]===11&&(v[1]>16||(v[1]===16&&v[2]>=0))?0:1)" "$CURRENT_NPM"; then
  step "Installing npm 11.16.0"
  $SUDO npm install --global npm@11.16.0
  hash -r
fi
node scripts/check-runtime.js

if [[ $EUID -eq 0 && "$DEPLOY_USER" != "root" ]]; then
  step "Assigning application ownership to $DEPLOY_USER"
  chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$APP_DIR"
fi

step "Preparing the production environment"
node scripts/configure-production-env.js
node scripts/validate-production-env.js

# Resolve runtime directories from the final .env without sourcing untrusted shell content.
VAULT_STORAGE_DIR="$(node scripts/read-env-value.js VAULT_STORAGE_DIR)"
VAULT_TEMP_DIR="$(node scripts/read-env-value.js VAULT_TEMP_DIR)"
CMS_ASSET_DIR="$(node scripts/read-env-value.js CMS_ASSET_DIR)"
PORT="$(node scripts/read-env-value.js PORT)"
for directory in "$VAULT_STORAGE_DIR" "$VAULT_TEMP_DIR" "$CMS_ASSET_DIR" "$APP_DIR/logs" "$APP_DIR/backups"; do
  $SUDO mkdir -p "$directory"
  $SUDO chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$directory" 2>/dev/null || true
  $SUDO chmod 750 "$directory" 2>/dev/null || true
done
chmod 600 .env

CLAMAV_ENABLED_VALUE="$(node scripts/read-env-value.js CLAMAV_ENABLED)"
CLAMAV_COMMAND_VALUE="$(node scripts/read-env-value.js CLAMAV_COMMAND)"
if [[ "$CLAMAV_ENABLED_VALUE" == "true" ]] && ! command -v "$CLAMAV_COMMAND_VALUE" >/dev/null 2>&1; then
  [[ "$INSTALL_CLAMAV" == "1" ]] || fail "ClamAV is enabled but $CLAMAV_COMMAND_VALUE is missing. Install clamav-daemon or set INSTALL_CLAMAV=1."
  command -v apt-get >/dev/null 2>&1 || fail "Automatic ClamAV installation currently supports Debian/Ubuntu."
  step "Installing ClamAV"
  $SUDO apt-get update -y
  $SUDO apt-get install -y clamav clamav-daemon clamav-freshclam
fi
if [[ "$CLAMAV_ENABLED_VALUE" == "true" ]] && command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now clamav-daemon || true
  for _ in {1..20}; do
    $SUDO systemctl is-active --quiet clamav-daemon && break
    sleep 2
  done
fi

step "Installing exact npm dependencies"
run_app npm config set registry https://registry.npmjs.org/
if grep -q "packages.applied-caas-gateway1" package-lock.json 2>/dev/null; then
  warn "Repairing private registry URLs in package-lock.json."
  sed -i 's#https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/#https://registry.npmjs.org/#g' package-lock.json
fi
rm -rf node_modules
run_app npm ci --include=dev --no-fund --audit=false
run_app node -e "import('mongoose').then(({default:m})=>console.log('Mongoose',m.version,'installed')).catch(e=>{console.error(e);process.exit(1)})"
run_app npm run schema:check
run_app npm run migration:check

step "Checking MongoDB"
run_app npm run db:check

step "Checking storage and malware-scanner services"
run_app npm run services:check

if [[ "$SKIP_DB_BACKUP" != "1" ]] && command -v mongodump >/dev/null 2>&1; then
  step "Creating a pre-deployment MongoDB backup"
  MONGODB_URI_VALUE="$(node scripts/read-env-value.js MONGODB_URI)"
  BACKUP_FILE="$APP_DIR/backups/mongodb-$(date +%Y%m%d-%H%M%S).archive.gz"
  mongodump --uri="$MONGODB_URI_VALUE" --archive="$BACKUP_FILE" --gzip
  chmod 600 "$BACKUP_FILE"
  echo "Database backup: $BACKUP_FILE"
elif [[ "$SKIP_DB_BACKUP" != "1" ]]; then
  warn "mongodump is not installed; database backup was skipped. Install MongoDB Database Tools for automatic backups."
fi

step "Repairing known invalid legacy ObjectId placeholders"
run_app npm run db:repair-legacy-objectids

step "Repairing the known SurveyorSubscription history index"
run_app npm run db:repair-surveyor-index

step "Repairing the legacy User mobile lookup index"
run_app npm run db:repair-user-phone-index

step "Repairing legacy MongoDB indexes before migrations"
run_app npm run db:repair-indexes

if [[ "$DEPLOY_MODE" == "fresh" ]]; then
  step "Seeding a fresh database"
  [[ "${CONFIRM_FRESH:-}" == "YES" ]] || fail "Fresh mode deletes seeded collections. Re-run with CONFIRM_FRESH=YES only for a new database."
  run_app env ALLOW_DESTRUCTIVE_SEED=YES npm run seed
fi

if [[ "$SKIP_MIGRATIONS" != "1" ]]; then
  step "Running the locked automatic database migration suite"
  run_app npm run db:auto-migrate
  step "Migrating legacy uploads"
  run_app npm run migrate:legacy-uploads
else
  warn "Deployment migration phase skipped. Application startup will still run automatic migrations unless AUTO_DB_MIGRATIONS=false is set in .env."
fi

step "Applying enterprise platform configuration and real-time messaging migration"
run_app npm run migrate:enterprise

step "Ensuring the requested administrator account exists"
run_app npm run seed:admin

step "Verifying email and mobile authentication mappings"
run_app npm run auth:db-check

step "Verifying and creating MongoDB indexes"
run_app npm run db:repair-indexes
run_app npm run db:indexes

step "Running production verification and build"
run_app npm run verify
run_app npm audit --omit=dev --audit-level=high

step "Reconciling PM2 with the active release"
mkdir -p logs
run_app env APP_DIR="$APP_DIR" node scripts/reconcile-pm2-release.js --prepare

step "Starting or reloading PM2"
run_app ./node_modules/.bin/pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --env production --update-env
run_app env APP_DIR="$APP_DIR" node scripts/reconcile-pm2-release.js --verify
run_app ./node_modules/.bin/pm2 save

if [[ "$SKIP_PM2_STARTUP" != "1" ]] && command -v systemctl >/dev/null 2>&1; then
  step "Enabling PM2 after server reboot"
  PM2_BIN="$APP_DIR/node_modules/pm2/bin/pm2"
  $SUDO env PATH="$PATH" "$PM2_BIN" startup systemd -u "$DEPLOY_USER" --hp "$DEPLOY_HOME" >/dev/null
  run_app ./node_modules/.bin/pm2 save
fi

step "Waiting for the application health check"
HEALTH_OK=0
for (( attempt=1; attempt<=HEALTHCHECK_RETRIES; attempt++ )); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health/ready" >/tmp/secureasset-health.json 2>/dev/null; then
    HEALTH_OK=1
    cat /tmp/secureasset-health.json
    echo
    break
  fi
  sleep 2
done
[[ "$HEALTH_OK" == "1" ]] || { run_app ./node_modules/.bin/pm2 logs secureasset --lines 100 --nostream || true; fail "Application did not pass its health check."; }

step "Checking browser-route reload fallback"
for route in /login /marketplace/example /app/dashboard; do
  if ! curl -fsS -H 'Accept: text/html' "http://127.0.0.1:${PORT}${route}" | grep -q '<div id="root"></div>'; then
    fail "SPA route fallback failed for ${route}. Page reloads would return 404."
  fi
done
if curl -sS -H 'Accept: application/json' -o /tmp/secureasset-missing-api.json -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/does-not-exist" | grep -q '^200$'; then
  fail "Unknown API routes are being masked by the SPA fallback."
fi

step "Checking login and registration routes directly"
run_app node scripts/verify-auth-routing.js "http://127.0.0.1:${PORT}"

APP_URL_VALUE="$(node scripts/read-env-value.js PUBLIC_APP_URL)"
DOMAIN_VALUE="${DOMAIN:-$(node -e "try{const u=new URL(process.argv[1]);console.log(u.hostname)}catch{}" "$APP_URL_VALUE")}" 
IS_LOCAL_DOMAIN=0
[[ "$DOMAIN_VALUE" == "localhost" || "$DOMAIN_VALUE" == "127.0.0.1" || "$DOMAIN_VALUE" =~ ^[0-9.]+$ ]] && IS_LOCAL_DOMAIN=1
AAPANEL_VHOST_ROOT="/www/server/panel/vhost/nginx"
if [[ "$CONFIGURE_NGINX" == "auto" && -d "$AAPANEL_VHOST_ROOT" ]]; then
  step "Repairing aaPanel authentication proxy routing"
  CONFIGURE_NGINX=0
  $SUDO bash scripts/repair-auth-routing.sh --nginx-only
fi
if [[ "$CONFIGURE_NGINX" == "auto" ]]; then
  [[ -n "$DOMAIN_VALUE" && "$IS_LOCAL_DOMAIN" == "0" ]] && CONFIGURE_NGINX=1 || CONFIGURE_NGINX=0
fi

if [[ "$CONFIGURE_NGINX" == "1" ]]; then
  command -v apt-get >/dev/null 2>&1 || fail "Automatic Nginx configuration currently supports Debian/Ubuntu."
  step "Configuring Nginx for $DOMAIN_VALUE"
  $SUDO apt-get update -y
  $SUDO apt-get install -y nginx
  NGINX_FILE="/etc/nginx/sites-available/secureasset"
  $SUDO tee "$NGINX_FILE" >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_VALUE};

    client_max_body_size 300M;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
NGINX
  $SUDO ln -sfn "$NGINX_FILE" /etc/nginx/sites-enabled/secureasset
  $SUDO rm -f /etc/nginx/sites-enabled/default
  $SUDO nginx -t
  $SUDO systemctl enable --now nginx
  $SUDO systemctl reload nginx
fi

if [[ "$ENABLE_SSL" == "1" ]]; then
  [[ "$CONFIGURE_NGINX" == "1" ]] || fail "ENABLE_SSL=1 requires CONFIGURE_NGINX=1 or a valid public DOMAIN."
  [[ -n "$SSL_EMAIL" ]] || fail "SSL_EMAIL is required when ENABLE_SSL=1."
  step "Installing the Let's Encrypt certificate"
  $SUDO apt-get install -y certbot python3-certbot-nginx
  $SUDO certbot --nginx --non-interactive --agree-tos --redirect --email "$SSL_EMAIL" -d "$DOMAIN_VALUE"
fi

step "Checking authentication through the public website"
if ! run_app node scripts/verify-auth-routing.js "$APP_URL_VALUE"; then
  fail "The API works locally but the public website is not forwarding /api/. In aaPanel, proxy /api/ to http://127.0.0.1:${PORT}, then rerun deployment."
fi

step "Checking the public index and every production JavaScript/CSS asset"
if ! run_app node scripts/verify-public-assets.js "$APP_URL_VALUE"; then
  fail "The public website is serving a stale index or missing/mismatched frontend chunks. Confirm the aaPanel managed /assets/ and /index.html locations are active, then purge the Cloudflare cache."
fi

step "Deployment completed"
echo "Application: $APP_URL_VALUE"
echo "Health:      http://127.0.0.1:${PORT}/api/health/ready"
echo "PM2 status:  cd $APP_DIR && npm run pm2:status"
echo "PM2 logs:    cd $APP_DIR && npm run pm2:logs"
echo "Deploy log:  $LOG_FILE"
