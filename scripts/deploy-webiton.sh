#!/usr/bin/env bash
# Deploy Optima Desk to manage.webiton.pt (webiton.pt cPanel)
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-webiton.pt}"
REMOTE_DIR="${REMOTE_DIR:-~/apps/manage-optima}"
REPO_URL="${REPO_URL:-https://github.com/dmachado48/manage-optima.git}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-3010}"
APP_URL="${APP_URL:-https://manage.webiton.pt}"

ssh -o IdentitiesOnly=yes "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
export PATH="\$HOME/nodevenv/\$PATH:\$HOME/.local/bin:\$PATH"

REMOTE_DIR_EXPANDED=\${REMOTE_DIR/#\~/\$HOME}
REMOTE_DIR_EXPANDED="$REMOTE_DIR"
REMOTE_DIR_EXPANDED=\${REMOTE_DIR_EXPANDED/#\~/\$HOME}
mkdir -p "\$(dirname "\$REMOTE_DIR_EXPANDED")"

if [ ! -d "\$REMOTE_DIR_EXPANDED/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "\$REMOTE_DIR_EXPANDED"
else
  cd "\$REMOTE_DIR_EXPANDED"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

cd "\$REMOTE_DIR_EXPANDED"
if [ ! -f .env ]; then
  echo "MISSING .env at \$REMOTE_DIR_EXPANDED/.env"
  echo "Create it with AUTH_URL=$APP_URL and production DATABASE_URL."
  exit 1
fi

# cPanel exports NODE_ENV=production, but Tailwind/TypeScript are required
# while creating the production build.
npm ci --include=dev
npx prisma generate
npx prisma db push
npm run build

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete manage-optima 2>/dev/null || true
  PORT=$APP_PORT pm2 start npm --name manage-optima -- start
  pm2 save
  echo "PM2: manage-optima on port $APP_PORT → $APP_URL"
else
  echo "Build OK. Point $APP_URL Node app root to \$REMOTE_DIR_EXPANDED (npm start, port $APP_PORT)."
fi
EOF

echo "Deploy finished → $APP_URL"
