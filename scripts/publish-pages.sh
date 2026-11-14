#!/usr/bin/env bash
# Refresh the gh-pages branch (what GitHub Pages serves) from public/.
#
#   ./scripts/publish-pages.sh            copy public/ and push
#   ./scripts/publish-pages.sh --dry-run  build the branch locally, do not push
#
# The site lives on gh-pages as plain files at the root, because GitHub Pages
# cannot serve a subfolder of a branch. Edit the sources on master/main, then run
# this to publish.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-gh-pages}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

STAGE="$(mktemp -d)"
REPO="$(mktemp -d)"
cleanup() { rm -rf "$STAGE" "$REPO"; }
trap cleanup EXIT

cp -R "$ROOT/public/." "$STAGE/"
touch "$STAGE/.nojekyll"

# GitHub Pages is static, so point the published copy at a real server. Set
# ARCADE_API=https://your-server, or let this script find the newest live
# quick tunnel that is still answering /api/health.
LIVE="${ARCADE_API:-}"
if [ -z "$LIVE" ]; then
  for candidate in $(grep -ho 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/tunnel*.log 2>/dev/null | tac | uniq); do
    if curl -s --max-time 6 "$candidate/api/health" | grep -q '"ok":true'; then
      LIVE="$candidate"
      break
    fi
  done
fi
if [ -n "$LIVE" ]; then
  cat > "$STAGE/js/config.js" <<EOF
/* Published static build: accounts and multiplayer talk to this server. */
window.ARCADE_API = '$LIVE';
EOF
  echo "Accounts on the published site will use: $LIVE"
else
  echo "No live server found; the published site will run in guest mode."
fi

cd "$ROOT"
REMOTE_URL="$(git remote get-url "$REMOTE")"
git clone -q "$REMOTE_URL" "$REPO"
cd "$REPO"
if git rev-parse -q --verify "origin/$BRANCH" >/dev/null; then
  git checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git checkout -q --orphan "$BRANCH"
fi
git rm -rq --cached . 2>/dev/null || true
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$STAGE/." .
git add -A

if git diff --cached --quiet; then
  echo "gh-pages is already up to date."
  exit 0
fi

git -c user.name="${GIT_AUTHOR_NAME:-Lemon Code}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-hello@lemoncode.ai}" \
    commit -q --trailer "Co-authored-by: Lemon Code <hello@lemoncode.ai>" \
    -m "Publish site from public/

Built from $(git -C "$ROOT" rev-parse --short HEAD) on $(git -C "$ROOT" rev-parse --abbrev-ref HEAD)."

if [ "$DRY" = "1" ]; then
  echo "Dry run: committed to $BRANCH locally in $REPO (not pushed)."
  git --no-pager show --stat --oneline HEAD | head -5
  exit 0
fi

git push -q "$REMOTE" "$BRANCH"
echo "Published. GitHub Pages rebuilds in a minute or two:"
echo "  https://$(git -C "$REPO" config --get remote.origin.url | sed -E 's#.*github.com[:/]([^/]+)/([^/.]+)(\.git)?#\1.github.io/\2#')/"
