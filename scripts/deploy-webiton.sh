#!/usr/bin/env bash
# Deploy Optima Desk → https://manage.webiton.pt (cPanel + Passenger)
#
# Usage (from repo root):
#   npm run deploy              # git push main + pull/build/restart on server
#   npm run deploy:remote       # only pull/build/restart (code already on GitHub)
#   REMOTE_HOST=webiton.pt BRANCH=main npm run deploy
#
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-webiton.pt}"
REMOTE_DIR="${REMOTE_DIR:-~/apps/manage-optima}"
REPO_URL="${REPO_URL:-https://github.com/dmachado48/manage-optima.git}"
BRANCH="${BRANCH:-main}"
APP_URL="${APP_URL:-https://manage.webiton.pt}"
MODE="${1:-full}" # full | remote

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$MODE" == "full" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Há alterações locais por commit. Faz commit antes do deploy."
    git status -sb
    exit 1
  fi
  echo "→ Push $BRANCH → origin…"
  git push -u origin "HEAD:$BRANCH"
fi

echo "→ Deploy em $REMOTE_HOST:$REMOTE_DIR …"
ssh -o IdentitiesOnly=yes "$REMOTE_HOST" \
  env REMOTE_DIR="$REMOTE_DIR" BRANCH="$BRANCH" REPO_URL="$REPO_URL" APP_URL="$APP_URL" \
  bash -s <<'EOF'
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/bin:$PATH"

REMOTE_DIR_EXPANDED="${REMOTE_DIR/#\~/$HOME}"
mkdir -p "$(dirname "$REMOTE_DIR_EXPANDED")"

if [ ! -d "$REMOTE_DIR_EXPANDED/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$REMOTE_DIR_EXPANDED"
else
  cd "$REMOTE_DIR_EXPANDED"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

cd "$REMOTE_DIR_EXPANDED"

if [ ! -f .env ]; then
  echo "MISSING .env at $REMOTE_DIR_EXPANDED/.env"
  echo "Cria o ficheiro com AUTH_URL=$APP_URL e DATABASE_URL de produção."
  exit 1
fi

# cPanel pode forçar NODE_ENV=production; --include=dev mantém deps de build.
npm ci --include=dev
npx prisma generate
npx prisma db push
npm run build

# Reinicia a app Node do cPanel (Passenger)
mkdir -p tmp
touch tmp/restart.txt
echo "Passenger restart → tmp/restart.txt"

echo "OK → $APP_URL"
EOF

echo "Deploy finished → $APP_URL"
