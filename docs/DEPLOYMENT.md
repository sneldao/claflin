# Claflin Deployment Guide

## Overview

| Target | URL | Notes |
|---|---|---|
| Vercel (frontend) | `claflin.trustfall.xyz` | Auto-deploys from `main`; desk UI; same-origin `/api/*` |
| VPS (Hetzner API) | `api.claflin.trustfall.xyz` | PM2 standalone on `127.0.0.1:3042` behind nginx; ~52 MB |

The client-facing product is the paper trading desk at `/`. Mounted desk
routes: `/api/stocks/quote` (read-only estimates), `/api/stocks/marks`
(indicative tape), `/api/hetty/session` (voice signed URL), and — when an
account is configured — `/api/paper` and `/api/hetty/transcript`.
`/api/eligibility` is a read-only authority-tier check, not a paper-desk
surface. `/api/webhooks/elevenlabs` is retained call-billing infrastructure
and is not on the live Hetty path. Retired marketplace APIs (`/api/agents`,
`/api/ratings`, `/api/sdk/register`) return 410 through `proxy.ts`; retired
client pages redirect to `/` via `next.config.js`.

Both targets can share the same **Upstash Redis** instance. The anonymous
paper desk (estimates, tape, local records, ringing Hetty) does not need
Redis. Account-tier paper backup and transcript write do.

---

## Vercel Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsneldao%2Fclaflin)

### Environment variables (Vercel Dashboard)

**Required for the paper desk:**

```
# Production RPC provider for Base — the default mainnet.base.org public
# endpoint is not adequate for real traffic.
BASE_RPC_URL=https://...
BASE_RPC_FALLBACK_URL=https://...   # optional, rotated in after the primary

# Deployment metadata (absolute canonical/OG URLs)
NEXT_PUBLIC_APP_URL=https://claflin.trustfall.xyz
```

**Only if proxying `/api/*` to the Hetzner API** (see dual-deployment below):

```
API_PROXY_TARGET=https://api.claflin.trustfall.xyz
```

**Only if account-tier backup or retained services are in use** (paper
sync, transcript write, ElevenLabs webhook, Arbitrum call billing). These
are NOT required for the anonymous paper desk and are not product setup
steps:

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ELEVENLABS_WEBHOOK_SECRET=
ARBITRUM_RPC_URL=
FACILITATOR_PRIVATE_KEY=
AGENT_WALLET=
PAYMENT_RECEIVER=
```

The live "Ring Hetty" voice session needs two variables — without them the
desk still works and the call card reports the line as not connected:

```
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_HETTY=
```

Optional Sign in (does not gate the desk; not live access):

```
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_PRIVY_CLIENT_ID=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
```

Provision the agent once with `node --env-file=.env.local scripts/create-hetty-agent.mjs`,
then set the printed id.

After updating env vars, trigger a manual redeploy — Vercel only picks up new
values on the next build.

There is **no seeding step**. Broker identity lives in `lib/house.ts`, not in
a database; `/api/agents/seed` is retired and returns 410.

---

## Hetzner VPS Deployment

See [`docs/HETZNER_DEPLOYMENT.md`](HETZNER_DEPLOYMENT.md).

```bash
export UPSTASH_REDIS_REST_TOKEN=your_token   # only for retained services
export BASE_RPC_URL=https://...            # quote service RPC
make deploy   # full: local build → rsync standalone → swap current → restart
make logs     # PM2 logs
make status   # PM2 status
make restart  # restart without rebuilding
```

Deploy frontend and API versions together when proxying `/api/*` — the
routing contract (410 set, quote endpoint shape) is shared.

---

## Dual-Deployment Architecture

```
Browser
  └─► Vercel (HTML/JS/CSS) — same-origin /api/* calls
        └─► API_PROXY_TARGET = https://api.claflin.trustfall.xyz  (server-to-server rewrite)
              └─► Hetzner Next.js standalone (127.0.0.1:3042 behind nginx)
                    └─► Upstash Redis (shared, retained services only)
```

**Preferred: same-origin proxy.** Set `API_PROXY_TARGET` on Vercel. The
browser only ever talks to its own origin; Vercel forwards `/api/*` to the
VPS server-to-server via `rewrites()` in `next.config.js`. No browser CORS,
no preflight round-trips, and ad-blockers stop flagging API calls.

**Legacy: direct cross-origin.** Set `NEXT_PUBLIC_API_URL` instead and the
browser calls the VPS directly. This still works — `proxy.ts` answers all
OPTIONS preflights and stamps CORS headers on every API response — but prefer
the proxy.

If neither is set, Vercel's serverless functions handle API calls directly.
That is sufficient for the current desk: `/api/stocks/quote` and
`/api/stocks/marks` run as serverless routes (they need `BASE_RPC_URL`).
Account-tier paper and transcript routes also need Redis and Privy server
credentials.

Leave `API_PROXY_TARGET` **unset** on the VPS itself and in local dev, or the
server will proxy its own routes back to itself.

---

## Domains (`trustfall.xyz`)

| Host | Role | Status |
|---|---|---|
| `claflin.trustfall.xyz` | Frontend (Vercel) | Custom domain on the Claflin Vercel project |
| `api.claflin.trustfall.xyz` | Backend (Hetzner) | Live — nginx TLS (Let's Encrypt), upstream `127.0.0.1:3042` |

DNS (GoDaddy → `trustfall.xyz`):

| Type | Host | Value |
|---|---|---|
| A / CNAME | `claflin` | Vercel target from project Domains |
| A | `api.claflin` | `157.180.36.156` |

Vercel production env:

```
NEXT_PUBLIC_APP_URL=https://claflin.trustfall.xyz
API_PROXY_TARGET=https://api.claflin.trustfall.xyz
```

API TLS renews via certbot’s systemd timer. Re-issue only if the site file is replaced from the HTTP-only template:

```bash
sudo certbot --nginx -d api.claflin.trustfall.xyz
```

---
## After Any Deployment

1. `GET /` — the desk renders, paper mode is explicit, no stock preselected. Sign in appears only if Privy public env is set; there is no “Live access” banner.
2. `GET /api/stocks/quote?instrumentId=<catalog-id>&side=buy&amount=100` —
   returns an estimate labelled with venue/reference freshness (requires
   `BASE_RPC_URL` for reliable results).
3. `GET /api/stocks/marks` — returns indicative marks with stale/unavailable labels.
4. `GET /api/agents` — returns `410 marketplace_retired`.
5. `/marketplace`, `/demo`, `/profile`, `/dashboard` — redirect to `/`.
6. `/desk-study` and `/widget-probe` — not-found in production.
