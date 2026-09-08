# Hetzner VPS Deployment

Claflin API server. App directory: `/opt/claflin` — Port 3042 — PM2: `claflin`

---

## Quick Deploy

```bash
export BASE_RPC_URL=https://your-base-rpc-provider
export UPSTASH_REDIS_REST_TOKEN=your_token_here   # needed for account-tier paper/transcripts or retained services
make deploy
```

---

## How the deploy works

`scripts/deploy-hetzner.sh` does the following automatically:

```
pnpm install --no-frozen-lockfile   → install all deps (incl. dev)
NODE_ENV=production pnpm build      → build standalone
   └─ postbuild hook: scripts/cleanup-standalone.sh
        • copies static/ + public/ into .next/standalone/
        • removes .next/{cache,server,static,types,trace}  (~1.2 GB saved)
        • preserves .git + source files for next deploy
rsync .next/standalone/ → snel-bot:/opt/claflin/releases/<timestamp>/
ln -sfn releases/<timestamp> /opt/claflin/current   (atomic swap)
pm2 delete + start ecosystem.config.js                    (reload)
pm2 save                                                  (persist)
```

Final server size: **~52 MB** (was 2.0 GB before cleanup).

---

## Initial Setup (one-time)

```bash
git clone https://github.com/sneldao/claflin claflin
cd claflin
cp .env.hetzner.example .env.hetzner
# Edit .env.hetzner with your credentials
export UPSTASH_REDIS_REST_TOKEN=your_token
make deploy
```

---

## Other Commands

```bash
make logs      # PM2 logs (last 50 lines)
make status     # PM2 process status
make restart    # restart without rebuilding
```

---

## Environment

Secrets live in `/opt/claflin/.env.hetzner` on the server (create it from
`.env.hetzner.example` — `deploy-hetzner.sh` never writes or overwrites it)
and are read by `ecosystem.config.js` at `pm2 start`.

| Variable | Default | Notes |
|---|---|---|
| `BASE_RPC_URL` | `https://mainnet.base.org` | Quote service RPC — set a production provider for real traffic |
| `BASE_RPC_FALLBACK_URL` | — | Optional second provider, rotated in after the primary |
| `UPSTASH_REDIS_REST_URL` | `https://game-corgi-122374.upstash.io` | Upstash instance (retained services only) |
| `UPSTASH_REDIS_REST_TOKEN` | — | Only if retained services are in use |
| `ARBITRUM_RPC_URL` | `https://sepolia-rollup.arbitrum.io/rpc` | Optional override (retained billing) |

---

## Manual Operations

```bash
# Rebuild from scratch
cd /opt/claflin
git fetch origin main && git reset --hard origin/main
UPSTASH_REDIS_REST_URL=https://game-corgi-122374.upstash.io \
UPSTASH_REDIS_REST_TOKEN=your_token \
bash scripts/deploy-hetzner.sh

# Check disk usage
du -sh /opt/claflin
```

---

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3042;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable HTTPS: `sudo certbot --nginx -d your-domain.com`

---

## Upstash Redis

Current instance: `game-corgi-122374.upstash.io` (Ohio).

Test connectivity:
```bash
curl -s -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  https://game-corgi-122374.upstash.io/ping
# Expected: {"result":"PONG"}
```

---

## Switching to a new Redis instance

1. Create new database at https://console.upstash.com
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars
3. Edit `.env.hetzner` on the server with the new credentials (the deploy
   script does not write this file — it must be present and correct before
   the first `pm2 start` since `ecosystem.config.js` reads from it)
4. `make deploy` — PM2 picks up the new values on restart