#!/bin/bash
set -euo pipefail

# ================================================
# Deploy to Hetzner — Local Build, Atomic Rsync
# ================================================
# Builds the Next.js standalone bundle locally,
# rsyncs the runtime artifacts to a timestamped
# release directory on the server, then atomically
# swaps the `current` symlink.
#
# Server layout:
#   /opt/claflin/
#     ├── .env.hetzner          (server secrets — never touched)
#     ├── ecosystem.config.js   (PM2 config — rarely changes)
#     ├── .git/                 (for git operations if needed)
#     ├── releases/
#     │   ├── 20260604-143000/  (standalone bundle)
#     │   └── 20260604-150000/
#     ├── current → releases/20260604-150000
#     └── logs/
#
# Usage:
#   ./scripts/deploy-hetzner.sh
#
# Prerequisites:
#   - Access to the `snel-bot` SSH host configured
#   - Node + pnpm locally
# ================================================

REMOTE_HOST="snel-bot"
REMOTE_DIR="/opt/claflin"
RELEASES_DIR="$REMOTE_DIR/releases"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RELEASE_PATH="$RELEASES_DIR/$TIMESTAMP"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Step 1: Install dependencies (local) ==="
cd "$LOCAL_DIR"
pnpm install --no-frozen-lockfile

echo ""
echo "=== Step 2: Build standalone (local) ==="
# NODE_ENV=production triggers cleanup-standalone.sh postbuild
# which copies static/public into standalone and removes
# intermediate build artifacts
NODE_ENV=production pnpm build

echo ""
echo "=== Step 3: Ensure releases directory exists on server ==="
ssh "$REMOTE_HOST" "mkdir -p $RELEASES_DIR"

echo ""
echo "=== Step 4: Rsync standalone bundle to new release ==="
# Only sync what the runtime needs:
#   .next/standalone/ contents → release dir
# This includes server.js, .next/, public/, node_modules/ (traced)
# We explicitly DO NOT sync:
#   .env.hetzner       — server-specific secrets (never overwritten)
#   ecosystem.config.js — server's PM2 config (updated separately)
#   source files        — not needed at runtime
rsync -az --delete --no-perms --no-owner --no-group \
  "$LOCAL_DIR/.next/standalone/" \
  "$REMOTE_HOST:$RELEASE_PATH/"

echo ""
echo "=== Step 4b: Bundle Jesse Pyth daemon ==="
mkdir -p "$LOCAL_DIR/.deploy"
npx --yes esbuild@0.25.0 "$LOCAL_DIR/scripts/jesse-pyth-feed.ts" \
  --bundle --platform=node --format=cjs \
  --outfile="$LOCAL_DIR/.deploy/jesse-pyth-feed.cjs"
rsync -az --no-perms --no-owner --no-group \
  "$LOCAL_DIR/.deploy/jesse-pyth-feed.cjs" \
  "$REMOTE_HOST:$REMOTE_DIR/jesse-pyth-feed.cjs"
rsync -az --no-perms --no-owner --no-group \
  "$LOCAL_DIR/ecosystem.config.js" \
  "$REMOTE_HOST:$REMOTE_DIR/ecosystem.config.js"

echo ""
echo "=== Step 5: Atomic symlink swap ==="
ssh "$REMOTE_HOST" "ln -sfn $RELEASE_PATH $REMOTE_DIR/current"

echo ""
echo "=== Step 6: Restart PM2 ==="
ssh "$REMOTE_HOST" "pm2 delete claflin 2>/dev/null || true; pm2 delete claflin-pyth 2>/dev/null || true; cd $REMOTE_DIR && pm2 start ecosystem.config.js && pm2 save"

echo ""
echo "=== Step 7: Health check ==="
sleep 3
HEALTH=$(ssh "$REMOTE_HOST" "curl -sf -o /dev/null -w '%{http_code}' http://localhost:3042/ 2>/dev/null || echo 'failed'")
if echo "$HEALTH" | grep -qE '^(2|4)0[0-9]$'; then
  echo "✅ Deployment successful! API responded with HTTP $HEALTH."
else
  echo "⚠️  Health check returned $HEALTH. Rolling back..."
  # Find the previous release (second-to-last symlink target)
  PREV=$(ssh "$REMOTE_HOST" "ls -1t $RELEASES_DIR | sed -n '2p'")
  if [ -n "$PREV" ]; then
    ssh "$REMOTE_HOST" "ln -sfn $RELEASES_DIR/$PREV $REMOTE_DIR/current && pm2 delete claflin 2>/dev/null || true; cd $REMOTE_DIR && pm2 start ecosystem.config.js && pm2 save"
    echo "⏪ Rolled back to $PREV"
  else
    echo "❌ No previous release to roll back to. Check: pm2 logs claflin"
  fi
fi

echo ""
echo "=== Step 8: Cleanup old releases (keep last 3) ==="
ssh "$REMOTE_HOST" "cd $RELEASES_DIR && ls -1t | tail -n +4 | xargs -r rm -rf"

echo ""
echo "=== Disk usage (server) ==="
ssh "$REMOTE_HOST" "du -sh $REMOTE_DIR && du -sh $REMOTE_DIR/current/ && du -sh $RELEASES_DIR/"

echo ""
echo "Done."
