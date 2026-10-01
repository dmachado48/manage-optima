#!/usr/bin/env bash
# Deploy Optima Desk to webiton.pt (same server as optima.webiton.pt)
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-webiton.pt}"
REMOTE_DIR="${REMOTE_DIR:-~/apps/manage-optima}"
REPO_URL="${REPO_URL:-https://github.com/dmachado48/manage-optima.git}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-3010}"

ssh -o IdentitiesOnly=yes "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
# cPanel Node selectors often expose binaries here:
export PATH="\$HOME/nodevenv/\$PATH:\$HOME/.local/bin:\$PATH"

mkdir -p $(dirname "$REMOTE_DIR")
if [ ! -d "$REMOTE_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$REMOTE_DIR"
else
  cd "$REMOTE_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

cd "$REMOTE_DIR"
if [ ! -f .env ]; then
  echo "MISSING .env on server at $REMOTE_DIR/.env — copy from .env.example and fill production values."
  exit 1
fi

npm ci
npx prisma generate
npx prisma db push
npm run build

# Prefer PM2 if available
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete manage-optima 2>/dev/null || true
  PORT=$APP_PORT pm2 start npm --name manage-optima -- start
  pm2 save
  echo "PM2: manage-optima on port $APP_PORT"
else
  echo "Build OK. Start with: cd $REMOTE_DIR && PORT=$APP_PORT npm start"
  echo "Or attach the Node.js app in cPanel to $REMOTE_DIR (startup: npm start / server.js)."
fi
EOF

echo "Deploy finished."
