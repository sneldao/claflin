# Claflin Deployment Guide

## Overview

| Target | URL | Notes |
|---|---|---|
| Vercel | `your-claflin-app.vercel.app` | Auto-deploys from `main`; serves the desk UI and `/api/*` |
| VPS (Hetzner) | `api.your-claflin-app.com` | PM2 standalone server on port 3042; ~52 MB |

The client-facing product is the paper trading desk at `/`. The only mounted
API routes are `/api/stocks/quote` (read-only estimate service) and
`/api/webhooks/elevenlabs` (retained call-billing infrastructure). Retired
marketplace APIs (`/api/agents`, `/api/ratings`, `/api/sdk/register`) return
410 through `proxy.ts`; retired client pages redirect to `/` via
`next.config.js`.

Both targets share the same **Upstash Redis** instance
(`game-corgi-122374.upstash.io`), used only by retained services — the paper
desk itself needs no Redis.

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
NEXT_PUBLIC_APP_URL=https://your-claflin-app.vercel.app
```

**Only if proxying `/api/*` to the Hetzner API** (see dual-deployment below):

```
API_PROXY_TARGET=https://api.your-claflin-app.com
```

**Only if the retained services are in use** (ElevenLabs webhook, Arbitrum
call billing, Redis-backed modules). These are NOT required for the paper
desk and are not product setup steps:

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
        └─► API_PROXY_TARGET = https://api.your-claflin-app.com  (server-to-server rewrite)
              └─► Hetzner Next.js standalone (port 3042)
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
That is sufficient for the current desk: `/api/stocks/quote` runs fine as a
serverless route (it only needs `BASE_RPC_URL`).

Leave `API_PROXY_TARGET` **unset** on the VPS itself and in local dev, or the
server will proxy its own routes back to itself.

---

## After Any Deployment

1. `GET /` — the desk renders, paper mode is explicit, no stock preselected.
2. `GET /api/stocks/quote?instrumentId=<catalog-id>&side=buy&amount=100` —
   returns an estimate labelled with venue/reference freshness (requires
   `BASE_RPC_URL` for reliable results).
3. `GET /api/agents` — returns `410 marketplace_retired`.
4. `/marketplace`, `/demo`, `/profile`, `/dashboard` — redirect to `/`.
5. `/desk-study` and `/widget-probe` — not-found in production.
