# Claflin Operations

**Merged 2026-11-17** from DEPLOYMENT, HETZNER_DEPLOYMENT, REDIS_KEYS, PERFORMANCE and PERFORMANCE_ROOM_VIEW (single-source consolidation; full prior text in git history).

## Deployment

### Overview

| Target | URL | Notes |
|---|---|---|
| Vercel (frontend) | `claflin.trustfall.xyz` | Auto-deploys from `main`; desk UI; same-origin `/api/*` |
| VPS (Hetzner API) | `api.claflin.trustfall.xyz` | PM2 standalone on `127.0.0.1:3042` behind nginx; ~52 MB |

The client-facing product is the trading desk at `/`, with real Base swaps
when `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED=true` and paper trading available
alongside them. With the flag off or unset, the desk is paper-only. Live
transactions use the client wallet integration, not a server-held signer.
Mounted desk routes: `/api/stocks/quote` (read-only estimates),
`/api/stocks/marks` (indicative tape), `/api/hetty/session` (voice signed
URL), `/api/desk/jesse/voice-agent/token` (optional AssemblyAI Voice Agent
token), and — when an account is configured — `/api/paper` and
`/api/hetty/transcript`. `/api/funnel` is a write-only, anonymous, enum-only
product-funnel beacon (no read endpoint). `/api/eligibility` is a read-only
authority-tier check, not a paper-desk surface. `/api/webhooks/elevenlabs` is
retained call-billing infrastructure and is not on the live Hetty path.
Retired marketplace APIs (`/api/agents`, `/api/ratings`, `/api/sdk/register`)
return 410 through `proxy.ts`; retired client pages redirect to `/` via
`next.config.js`. Both targets can share the same **Upstash Redis** instance:
the anonymous paper desk (estimates, tape, local records, ringing Hetty) does
not need Redis; account-tier paper backup and transcript write do.

Desk composition and broker line-up: [DESKS](DESKS.md). Product scope:
[PRODUCT](PRODUCT.md).

### Vercel environment variables

Deploy button: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsneldao%2Fclaflin)

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

**Only if account-tier backup or retained services are in use** (paper sync,
transcript write, ElevenLabs webhook, Arbitrum call billing). These are NOT
required for the anonymous paper desk and are not product setup steps:

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ELEVENLABS_WEBHOOK_SECRET=
ARBITRUM_RPC_URL=
FACILITATOR_PRIVATE_KEY=
AGENT_WALLET=
PAYMENT_RECEIVER=
```

**Broker voice agents (ElevenLabs ConvAI).** All four brokers' agents speak on **Eleven v4 Turbo** (`eleven_v4_turbo`); the model lives in the agent config, not this deployment (see below). Without an agent id the desk still quotes and files paper; the call card reports the line as not connected.

| Variable | Default | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | — | Required for any live voice session |
| `ELEVENLABS_AGENT_HETTY` | — | Hetty (default desk); provision with `node --env-file=.env.local scripts/create-hetty-agent.mjs`, then set the printed id |
| `ELEVENLABS_AGENT_JESSE` | — | Jesse (Solana desk); provision with `scripts/create-jesse-agent.mjs`, or refresh prompt/tools with `scripts/update-jesse-agent.mjs` |
| `ELEVENLABS_VOICE_JESSE` | `nPczCjzI2devNBz1zQrb` | Dedicated TTS voice id for standalone readbacks |
| `ELEVENLABS_AGENT_TENNIE` | — | Tennie (Robinhood Chain desk); provisioned 2026-10-02 via `scripts/create-tennie-agent.mjs` |
| `ELEVENLABS_VOICE_TENNIE` | `EXAVITQu4vr4xnSDxMaL` | Sarah voice |
| `ELEVENLABS_AGENT_HALLEY` | — | Halley (Meteora launch desk, Solana); provision with `scripts/create-halley-agent.mjs`, then set the printed id |
| `ELEVENLABS_VOICE_HALLEY` | `onwK4e9ZLuTAKqWW03F9` | Halley standalone voice |
| `ASSEMBLYAI_API_KEY` | — | Optional AssemblyAI line; key stays server-side |
| `NEXT_PUBLIC_JESSE_VOICE` | `assemblyai` (to select) | Makes AssemblyAI the deployment provider; `?line=assemblyai` for one visit |

On unpinned visits the desk fails a ring over to the other carrier when the first cannot open the line (one hop per visit; pinned `?line=` links never swap). The AssemblyAI line is paper-only and does not sign or submit transactions.

**Optional Jupiter key** (paper quotes work keyless; set for higher rate limits): `JUPITER_API_KEY=`.

**Solana live paths** (both off by default; set only as a deliberate release
decision):

```
SOLANA_RPC_URL=          # production-grade RPC — not the public endpoint
JESSE_LIVE_ENABLED=false
NEXT_PUBLIC_JESSE_LIVE_ENABLED=false
HALLEY_LIVE_ENABLED=false
NEXT_PUBLIC_HALLEY_LIVE_ENABLED=false
# HALLEY_DAMM_CONFIG=    # only overrides the verified migration config
```

Halley's live launch path sits behind dual flags — `HALLEY_LIVE_ENABLED` +
`NEXT_PUBLIC_HALLEY_LIVE_ENABLED`; neither alone moves real funds.

**Optional Sign in** (does not gate the desk; not live access):
`NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID`, `PRIVY_APP_ID`,
`PRIVY_APP_SECRET`.

After updating env vars, trigger a manual redeploy — Vercel only picks up new values on the next build. There is **no seeding step**: broker identity lives in `lib/house.ts`, not in a database; `/api/agents/seed` is retired and returns 410.

### Broker voice (Eleven v4 Turbo)

Hetty, Jesse and Tennie's ElevenLabs ConvAI agents run **`eleven_v4_turbo`** — the v4 real-time variant for agents — replacing the deprecated `eleven_turbo_v2`. This is agent-side config on ElevenLabs, not a deployment env var; changing it is an API call, not a VPS/Vercel deploy.

- Model + speaking rules: `scripts/agent-voice.mjs` (shared by all desk brokers). `ELEVENLABS_TTS_MODEL=fallback` selects `eleven_v3_conversational`; any other value is used as a literal model id.
- Apply to the live agents:
  ```
  node --env-file=.env.local scripts/update-hetty-agent.mjs
  node --env-file=.env.local scripts/update-jesse-agent.mjs
  node --env-file=.env.local scripts/update-tennie-agent.mjs
  node --env-file=.env.local scripts/update-halley-agent.mjs
  ```
  Each script reads the agent back and fails if the model the server kept isn't the one requested. Roll back by re-running with `ELEVENLABS_TTS_MODEL=fallback`.
- Rolled out 2026-09-28 on Hetty and Jesse; Tennie's agent was provisioned on `eleven_v4_turbo` at creation (2026-10-02).

### Dual-deployment architecture

```
Browser
  └─► Vercel (HTML/JS/CSS) — same-origin /api/* calls
        └─► API_PROXY_TARGET = https://api.claflin.trustfall.xyz  (server-to-server rewrite)
              └─► Hetzner Next.js standalone (127.0.0.1:3042 behind nginx)
                    └─► Upstash Redis (shared, retained services only)
```

**Preferred: same-origin proxy.** Set `API_PROXY_TARGET` on Vercel. The browser only ever talks to its own origin; Vercel forwards `/api/*` to the VPS server-to-server via `rewrites()` in `next.config.js`. No browser CORS, no preflight round-trips, and ad-blockers stop flagging API calls.

**Legacy: direct cross-origin.** Set `NEXT_PUBLIC_API_URL` instead and the browser calls the VPS directly. This still works — `proxy.ts` answers all OPTIONS preflights and stamps CORS headers on every API response — but prefer the proxy. If neither is set, Vercel's serverless functions handle API calls directly. That is sufficient for the current desk: `/api/stocks/quote` and `/api/stocks/marks` run as serverless routes (they need `BASE_RPC_URL`); account-tier paper and transcript routes also need Redis and Privy server credentials.

Leave `API_PROXY_TARGET` **unset** on the VPS itself and in local dev, or the server will proxy its own routes back to itself. Deploy frontend and API versions together when proxying `/api/*` — the routing contract (410 set, quote endpoint shape) is shared.

### Domains (`trustfall.xyz`)

| Host | Role | Status |
|---|---|---|
| `claflin.trustfall.xyz` | Frontend (Vercel) | Custom domain on the Claflin Vercel project |
| `api.claflin.trustfall.xyz` | Backend (Hetzner) | Live — nginx TLS (Let's Encrypt), upstream `127.0.0.1:3042` |

DNS (GoDaddy → `trustfall.xyz`):

| Type | Host | Value |
|---|---|---|
| A / CNAME | `claflin` | Vercel target from project Domains |
| A | `api.claflin` | `157.180.36.156` |

Vercel production env: `NEXT_PUBLIC_APP_URL=https://claflin.trustfall.xyz`
and `API_PROXY_TARGET=https://api.claflin.trustfall.xyz`.

API TLS renews via certbot's systemd timer. Re-issue only if the site file is replaced from the HTTP-only template:

```bash
sudo certbot --nginx -d api.claflin.trustfall.xyz
```

### After any deployment

1. `GET /` — the desk renders, mode is explicit (live initial when the flag is on, paper recording still available), no stock preselected. Sign in appears only if Privy public env is set; there is no "Live access" banner.
2. `GET /api/stocks/quote?instrumentId=<catalog-id>&side=buy&amount=100` — returns an estimate labelled with venue/reference freshness (requires `BASE_RPC_URL` for reliable results).
3. `GET /api/stocks/marks` — returns indicative marks with stale/unavailable labels.
4. `GET /api/agents` — returns `410 marketplace_retired`.
5. `/marketplace`, `/demo`, `/profile`, `/dashboard` — redirect to `/`; `/desk-study` and `/widget-probe` are not-found in production.

Broader pre-release checks: [RELEASE_VALIDATION](RELEASE_VALIDATION.md).

---

## Hetzner VPS

Claflin API server. App directory: `/opt/claflin` — port **3042** (loopback
only) — PM2: `claflin` — public host **api.claflin.trustfall.xyz**
(nginx → `127.0.0.1:3042`). Frontend: `claflin.trustfall.xyz` (Vercel).

### Node runtime (shared box)

`snel-bot` runs ~12 PM2 apps on **system Node 22** (NodeSource apt). Claflin targets **Node 24** (`.nvmrc`, `package.json` engines). We do **not** change the system Node — that would move every other app on the box on its next restart. Instead, only `claflin` and `claflin-pyth` are pinned to Node 24 via a PM2 `interpreter` in `ecosystem.config.js`:

```
interpreter: /home/deploy/.nvm/versions/node/v24.x/bin/node   (override: CLAFLIN_NODE)
```

Node 24 is installed for the `deploy` user via nvm. If `nvm install 24` later resolves a newer 24.x, the interpreter path changes — update it in `ecosystem.config.js` or set `CLAFLIN_NODE`. `deploy-hetzner.sh` step 0 verifies both the local build Node and this pinned interpreter are the `.nvmrc` major before uploading, and aborts on a mismatch.

### Quick deploy and commands

```bash
export BASE_RPC_URL=https://your-base-rpc-provider
export UPSTASH_REDIS_REST_TOKEN=your_token_here   # needed for account-tier paper/transcripts or retained services
make deploy   # full: local build → rsync standalone → swap current → restart
make logs     # PM2 logs (last 50 lines)
make status   # PM2 process status
make restart  # restart without rebuilding
```

`scripts/deploy-hetzner.sh` does the following automatically:

```
pnpm install --no-frozen-lockfile   → install all deps (incl. dev)
NODE_ENV=production pnpm build      → build standalone
   └─ postbuild hook: scripts/cleanup-standalone.sh
        • copies static/ + public/ into .next/standalone/
        • removes .next/{cache,server,static,types,trace}  (~1.2 GB saved)
        • preserves .git + source files for next deploy
rsync .next/standalone/ → snel-bot:/opt/claflin/releases/<timestamp>/
rsync ecosystem.config.js + jesse-pyth-feed.cjs → /opt/claflin/
ln -sfn releases/<timestamp> /opt/claflin/current   (atomic swap)
pm2 delete + start ecosystem.config.js                    (reload, Node 24 interpreter)
pm2 save                                                  (persist)
```

Final server size: **~52 MB** (was 2.0 GB before cleanup).

### Initial setup (one-time)

```bash
git clone https://github.com/sneldao/claflin claflin
cd claflin
cp .env.hetzner.example .env.hetzner
# Edit .env.hetzner with your credentials
export UPSTASH_REDIS_REST_TOKEN=your_token
make deploy
```

### Environment

Secrets live in `/opt/claflin/.env.hetzner` on the server (create it from `.env.hetzner.example` — `deploy-hetzner.sh` never writes or overwrites it) and are read by `ecosystem.config.js` at `pm2 start`.

**Adding a new variable takes two edits, not one.** `ecosystem.config.js` whitelists which `.env.hetzner` vars reach the app (`env:` block), so a var present only in the secrets file is silently dropped — the app sees it undefined. Map it in `ecosystem.config.js` (committed), then reload with `pm2 delete claflin && pm2 start ecosystem.config.js --only claflin && pm2 save` — the config file's own documented procedure, and the reliable path for new `env:` keys (observed: `pm2 restart --update-env` alone did not pick one up).

| Variable | Default | Notes |
|---|---|---|
| `HOSTNAME` | `127.0.0.1` | Loopback only; nginx fronts the app |
| `PORT` | `3042` | Not exposed in UFW |
| `BASE_RPC_URL` | `https://mainnet.base.org` | Quote service RPC — set a production provider for real traffic |
| `BASE_RPC_FALLBACK_URL` | — | Optional second provider, rotated in after the primary |
| `UPSTASH_REDIS_REST_URL` | `https://game-corgi-122374.upstash.io` | Upstash instance (retained services only) |
| `UPSTASH_REDIS_REST_TOKEN` | — | Only if retained services are in use |
| `ARBITRUM_RPC_URL` | `https://sepolia-rollup.arbitrum.io/rpc` | Optional override (retained billing) |

### Manual operations

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

### Nginx reverse proxy

The app binds **`HOSTNAME=127.0.0.1`** so only local processes (nginx) can reach port 3042. UFW does not allow 3042 from the public internet. Canonical site file: `scripts/nginx-claflin.conf` → `/etc/nginx/sites-available/claflin` (enabled as `sites-enabled/claflin`). Upstream is `127.0.0.1:3042`.

**TLS.** Live: `https://api.claflin.trustfall.xyz` (Let's Encrypt via certbot; auto-renew). Cert paths:

```
/etc/letsencrypt/live/api.claflin.trustfall.xyz/fullchain.pem
/etc/letsencrypt/live/api.claflin.trustfall.xyz/privkey.pem
```

`scripts/nginx-claflin.conf` is the HTTP bootstrap template. Certbot amends the enabled site with `listen 443 ssl` and the redirect. If you reinstall from the template, re-run `sudo certbot --nginx -d api.claflin.trustfall.xyz`.

**Verify:**

```bash
ss -tlnp | grep 3042                        # loopback only — expect 127.0.0.1:3042
curl -sI https://api.claflin.trustfall.xyz/ | head -1   # public HTTPS
```

### Redis tiers

Two distinct needs, two tiers:

- **Durable/account tier — managed Upstash.** `UPSTASH_REDIS_*` covers paper sync, transcripts, x402/payment idempotency, rate limits, and the live proposal store (which also has a process-memory fallback). All anonymous judge paths fail open if this is unreachable.
  - **2026-09-25:** `game-corgi-122374` exhausted its 500k/month free quota (the Pyth daemon was writing ~1.6M commands/day before batching landed). Account-tier features error until the quota resets or a dedicated DB / pay-as-you-go is provisioned — one env swap in `.env.hetzner`, no redeploy.
- **Pyth snapshot cache — host-local file, no Redis.** `claflin-pyth` (`/opt/claflin/jesse-pyth-feed.cjs`) merges Lazer rows in memory and flushes atomically (tmp+rename) to `/opt/claflin/state/pyth-snapshots.json` every 8s (`PYTH_SNAPSHOT_FILE` overrides). The comparison route reads that file directly; a missing file or dead daemon reads as honest `stale`/`unavailable`.

**Upstash connectivity test** (current instance: `game-corgi-122374.upstash.io`, Ohio):

```bash
curl -s -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  https://game-corgi-122374.upstash.io/ping
# Expected: {"result":"PONG"}
```

**Switching to a new Redis instance:**

1. Create new database at https://console.upstash.com
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars
3. Edit `.env.hetzner` on the server with the new credentials (the deploy script does not write this file — it must be present and correct before the first `pm2 start` since `ecosystem.config.js` reads from it)
4. `make deploy` — PM2 picks up the new values on restart

---

## Redis keys

The anonymous paper desk does not use Redis. Account-tier paper backup and
transcript write do. Everything under **Retained marketplace keys** is
historical source, not a current product store.

### Current desk keys

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `paper:{userId}` | JSON array | none | Account-bound paper records (schema-validated, max 100). Local browser storage stays authoritative; this is a best-effort copy. Deletes are not propagated. |
| `transcript:{userId}:{conversationId}` | JSON object | 30 days | Write-only Hetty call transcript. No client GET. |
| `transcripts:{userId}` | Set | none | Conversation ids stored for that account. No expiry companion to the transcript TTL — treat as a known gap. |
| `funnel:counts:{day}` | Hash | 90 days | Anonymous funnel counters (enum dims only). See the funnel-metrics doc. |
| `funnel:reach:{day}:{step}:{new\|returning}` | HyperLogLog | 90 days | Approximate unique visits per funnel step. |

These JSON blobs are intentional. Do not rewrite them as hashes without a
migration. In-process rate limits for quotes and Hetty sessions are not
Redis keys.

### The proposal store

The live proposal store lives in Redis under the account tier and has a
**process-memory fallback**: when Upstash is unreachable, in-process memory
keeps the desk working and all anonymous paths fail open. Like the desk keys
above, treat the Redis copy as best-effort state, not a second source of
truth.

### Naming rules (new keys)

1. **Namespace prefix** — every key starts with a domain namespace (`paper:`,
   `transcript:`, or a retained prefix).
2. **Colon separator** — segments separated by `:`, never dots or slashes.
3. **Entity ID** — append the entity ID after the namespace.
4. **TTL** — ephemeral keys (transcripts, rate limits, signal sessions) must
   have a TTL.
5. Prefer hashes (`hset`/`hgetall`) for new structured records; the desk
   `paper:` / `transcript:` JSON keys are the documented exception.
6. Before adding a key, check this document for an existing namespace; use
   `{namespace}:{id}` or `{namespace}_index` for collections; add the key to
   a table here.

### Retained marketplace keys

Not used by the paper desk. Do not create new product features on these.
Format: key — type, TTL — description.

**Agents and calls**

- `agent:{agentId}` — Hash, none — agent record (name, status, rate, wallet_address, etc.)
- `agent_index` / `agent_index:external` — Set, none — all agent IDs / externally-registered agent IDs
- `agents:online` — Sorted Set, none — online agents sorted by timestamp
- `call:{callId}` — Hash, none — call record (agentId, caller, status, cost, duration)
- `call_index:all` / `call_index:{callerAddress}` — Set, none — all call IDs / calls by a specific caller

**Payments**

- `payment-session:{sessionId}` — Hash, none — x402 billing session (agentId, userAddress, secondsBilled, totalCost)
- `payment_session_index` — Set, none — all payment session IDs
- `payment-ledger:{callId}` — Hash, none — billing ledger entry for a call
- `payment-receipt:{callId}` — Hash, none — on-chain settlement receipt (txHash, amount, blockNumber)
- `payment_receipt_index` — Set, none — all receipt callIds
- `split-payment:{callId}` — Hash, none — 80/20 split ledger (agentAmount, platformAmount)
- `settlement:{callId}` — Hash, none — settlement tracking record (txHash, from, to, amount)
- `payouts:{agentId}` — List, none — pending payout records for an agent

**Rate limiting**

- `ratelimit:api:{identifier}` — String (JSON), windowMs — generic API rate limit counter
- `ratelimit:auth:{identifier}` — String (JSON), 15min — auth attempt rate limit
- `ratelimit:sensitive:{identifier}` — String (JSON), 1hr — sensitive action rate limit
- `ratelimit:ratings:read:{ip}` / `ratelimit:ratings:write:{ip}` — String (JSON), 1min — ratings read/write rate limits
- `ratelimit:register:{ip}` — String (counter), 1hr — agent registration rate limit

**Users and sessions**

- `user:{userId}` — Hash, none — user record
- `user:by:address:{address}` — String, none — lookup: wallet address → userId
- `user:{userId}:agents` / `:sessions` / `:delegations` — Set, none — agents owned by, sessions for, delegations of a user
- `session:{sessionId}` — Hash, none — session record
- `session_index:all` — Set, none — all session IDs
- `signal_session:{callId}` — Hash, 60s — WebRTC signal session (ephemeral)
- `delegation:{delegationId}` — Hash, none — ERC-8004 delegation record

**Transcripts (legacy webhook / SSE path — dormant), events, agent SDK**

- `transcript:{conversationId}` — List, none — legacy webhook transcript messages (capped at 200). Distinct from `transcript:{userId}:{conversationId}`.
- `transcript:{conversationId}` — Pub/Sub — real-time transcript channel for the old SSE path
- `events:list` — List, none — system event log (capped at 1000); `events:summary` — Hash, none — event counters by type
- `apikey:{apiKey}` — String, none — API key → agentId mapping
- `verification:{agentId}` — String, TTL — verification token for agent registration

---

## Performance

### Room view — motion and payload budget (current)

The plan (Phase 0.4) calls out that the pinned-hero + scroll-driven camera + lenis-snap + tape-velocity feed is doing a lot, and that mobile-verify first, then keep; reduce otherwise. This is the measurable budget for the WebGL scene, the reduced-motion end-state contract, and the per-view JS-payload split.

#### Targets

| Profile | First paint (static) | WebGL mount (where mounted) | Render fps (median) | JS payload (gzipped) |
|---|---|---|---|---|
| Desktop Chrome (high) | < 1.2s | < 2.0s | 60 | < 600KB (Room) / < 200KB (Compact) |
| Mid-tier Android Chrome | < 2.0s | < 3.5s | 30 | < 600KB (Room) / < 200KB (Compact) |
| iPhone SE (low) | < 2.5s | not mounted by default | n/a | < 200KB (Compact only) |

The numbers are starting points, not promises. They get refined against
measured baselines.

#### Recorded headless baseline (2026-10-03, after the per-view split)

Measured at 23:12 UTC in local production mode, 1280×800 headless Chromium with the ANGLE/SwiftShader software renderer and stubbed provider reads. Not a deployment or real-device measurement.

| View | First paint (ms) | WebGL mount (ms) | Median fps | JS payload (gzipped bytes) |
|---|---:|---:|---:|---:|
| Compact | 1,076 | not mounted | 59.88 | 1,324,712 |
| Room | 900 | 1,145 | 30.03 | 1,571,612 |

Compact no longer mounts WebGL or fetches the scene/instrument chunks — the per-view payload split is established at the structural level. The Compact payload target (<200KB) is not yet met; the remaining weight is framework and provider SDK code, not the room scene. Room still exceeds its payload budget and must still be verified on real Android and iOS hardware before claiming acceptance. The pre-split baseline (Compact and Room both at 1,573,768 bytes with Compact mounting WebGL at ~1,301ms) was replaced by this one. The regression gate tolerance policy: payload bytes gate strictly at 15% (deterministic build-to-build); paint and WebGL mount allow 3× because same-build runs on this shared machine measured 948→3,660ms paint; frame fields gate only when both the baseline and the measured run sampled an active scene — the scene renders on demand, so an idle run measures nothing about frame cost.

#### Follow-up measurement: 2026-10-05

Uncommitted paper-only build, fresh storage, configured optional account tier, local headless Chromium at 1280×800 with SwiftShader and stubbed API reads. The same Jesse routes and loaded-script gzip definition were retained.

| View | Before follow-up (gzipped bytes) | Latest recorded bytes | Target |
|---|---:|---:|---:|
| Compact | 1,313,878 | 299,150 | <200,000 |
| Room | 1,560,778 | 546,050 | <600,000 |

Initial JS fell about 77% in Compact and 65% in Room. Room meets its payload budget in this measurement; Compact remains about 99KB over target. Fresh paper visitors defer account services and Jesse's default voice transport; returning accounts and active calls intentionally load more code. Desk views and the live-only Solana wallet panel are also split without moving controller ownership. Observed large loaded baseline chunks included Privy at about 488KB and 103KB and LiveKit at about 139KB gzipped; remaining entry/framework chunks were about 87KB, 66KB and 63KB. Temporary module-attribution tooling was removed after the expanded diagnostic build stalled. These are chunk sizes, not precise additive per-package gzip costs. Per-script paths and sizes remain in budget output for repeatable diagnostics; do not change the metric or weaken targets to pass.

The latest relative timing gate failed: Room paint was 384ms versus an earlier 84ms sample, and WebGL mount was about 1,324ms versus 223ms. Both latest values meet desktop absolute timing targets, but the relative failure is unresolved. No threshold was relaxed. Compact did not mount WebGL. Real-device acceptance and final measurements remain pending; builds and browser work stopped at the owner's request. See [RELEASE_VALIDATION](RELEASE_VALIDATION.md) for scope.

#### Per-view split

Target: Compact ships without Three.js; Room lazy-loads the scene. Measure both views before claiming that the target is met. Mechanism, reworked 2026-10-03: the shared scene provider boots still, so a desk URL in Compact never mounts WebGL through the foyer pass-through, and the receiver's eager Three.js import is tied to Room (`eager={roomView}`) so Compact fetches the poster only. Measured: Compact's `webglMountMs` stays unset and its payload drops by ~249KB gzipped.

- **Compact** (`?view=compact`): the same controller, with a compact working surface.
- **Room** (`?view=room`): the spatial working surface. Reduced motion retains a still presentation.

View and graphics preferences are separate. `GRAPHICS_STORAGE_KEY` (`claflin.graphics.v1`) remembers the graphics preference per browser; explicit Room/Compact choices do not grant a different trading capability.

#### Reduced-motion end-state contract

For every interactive state the WebGL scene expresses, the reduced-motion path must produce a *composed* end-state, not a stripped WebGL canvas. Concretely:

- Hero pinned (scroll progress 0–1) → no pin; native scroll; static composition shown from the top.
- Tape velocity feeds drift → static tape, no skew, no drift.
- Lamp warm/cool → CSS data-attribute for state, no animated glow.
- Filing ceremony (slam → thud → sheen) → immediate end-state with a one-time caption.
- Camera ride on scroll → static; positions in the document order.

The reduced-motion target is a complete end-state within 200ms after first paint on a mid-tier Android. `tests/comprehension.test.ts` checks source contracts for essential labels and roles; it does not measure this latency or certify the manual/hardware pass. Those checks remain release work.

#### Measuring

After `pnpm exec next build --webpack`, run `node scripts/measure-room-budget.mjs` (equivalently `pnpm check:room-budget`). Measurement plumbing — payload accounting, gate tolerances, baseline promotion — lives in `scripts/room-budget-lib.mjs`. The script starts the local production server and measures both views in headless Chromium:

- First paint (static) and WebGL mount timestamps
- fps samples (median, p95) over a 5s scroll-through
- JS payload split: gzipped bundle bytes for `/?view=compact` and `/?view=room`
- Draw calls and triangles per sampled frame, and CPU shader-compilation time (not GPU shader cost)

It writes `metrics.latest.json` to `.room-budget/` (git-ignored). A successful run promotes that measurement to `metrics.json`; regressions > 15% from the previous successful baseline fail without replacing it. Missing Chromium or measurements fail instead of producing a passing placeholder. `--url=http://127.0.0.1:3000` uses an already-running local production server. Provider reads are stubbed; this is a rendering measurement, not provider certification.

The hardware gate is a real device:

- Local/CI desktop (Playwright Chromium) — run the measurement command on the production build. The renderer is recorded per view; a headless baseline is not real-device certification.
- One real Android device with Chrome remote debugging — *required* before the World's Fair submission and before the Stocklana-equivalent release. BrowserStack / Sauce Labs is *not* a substitute; the room must be there on a phone, and a phone is a phone.
- One real iOS device with Safari — *required* before the same release.

**What this budget is NOT:**

- It is not a promise of fps. Devices vary. The numbers are starting points.
- It is not a substitute for the comprehension test (Phase 0.2). A scene that hits its fps budget but loses the user is still a failure.
- It is not a reason to ship an animation that implies data we do not have. The plan's rule stands: motion that implies a live feed we don't have is forbidden, even when the budget allows it.

### Historical notes (2026-09 seated pass)

**Historical.** Source notes from the seated first pass (2026-09-09), kept
here only for the mechanisms still true. Browser QA of that pass was skipped.
Not a current source inventory or a measured improvement claim.

**Priority, unchanged:** optimize time to a valid quote, clear review,
reliable execution, and verified outcome — not time spent reading or talking.
Publications, ranking, and the scene must not sit on the critical trading
path. Establish measured baselines and budgets before adding substantial
imagery, ambience, or dimensional rendering.

Mechanisms still true today:

- **Initial page:** `app/page.tsx` renders `WorkingDesk` directly; no onboarding, directory or call meter. Optional Privy mounts only when public env is set, via `next/dynamic`. First usable is a complete desk (ticket or line), not a hero.
- **Trade preparation:** `useTradingDesk` coordinates explicit requests with aborts and stale-response guards; `TradeTicket` owns the review surface. No quote request before an explicit action; recheck expiry at save even if background timers were throttled.
- **Rendering:** `DeskInstrument` dynamically imports Three.js after intersection and `requestIdleCallback`, behind a visibly different SVG; form and records remain HTML. Known defect: the desk should paint a still from the actual model immediately, then swap after the matching WebGL frame. Do not eagerly load Three.js as the fix, and do not treat the idle gate as a performance win. `/desk-study` is a development fixture, not the product.
- **Return visits:** `PaperHistory` reads browser-local paper records; signed-in clients may also pull account copies (add-only). Storage failures are visible; paper records must not appear as real positions; account copies are not a second source of truth.
- **Voice:** "Ring Hetty" starts an ElevenLabs ConvAI session (`/api/hetty/session` mints the signed URL server-side); her client tools drive the same desk draft. The old widget is not loaded. Transcript POST is write-only when a bearer token is present; the ring request does not send one. No execution authority.

Engineering constraints (still binding):

- Keep background activity and decorative assets off the critical path; nonessential failures should not block the desk.
- Stop unnecessary media and update loops when hidden or unmounted; keep one voice session and clean up its capture/listeners explicitly.
- Prefer event-driven transform/opacity transitions where motion adds information. `transition` alone does not guarantee compositor execution; width and layout changes need measurement.
- Keep reduced-motion and ambience-off modes complete; never require animation completion before controls become usable.
- Reserve stable space for changing status, amounts, and working records; preserve readable rates/caps on mobile rather than hiding them to fit the layout.
- Treat data freshness separately from caching success; stale quotes, delayed transcripts, and unavailable activity need appropriate labeling.
- Memoize only where profiling justifies it; do not claim constant rendering cost for larger lists or zero parent re-renders without evidence.

Implementation notes from the 2026-09-05 `feat/desk-immersion-quest` pass: review countdown uses a local `useReviewClock` only while `stage === 'review'` (the desk tree no longer re-renders every second); the Aerodrome reader batches concurrent `eth_call`s (`batchMaxCount: 25`), pins Base via `staticNetwork`, and overlaps quote + Chainlink feed after identity checks.

**Verification (unchanged):** for implementation changes, use `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm exec next build --webpack` (the direct build avoids destructive standalone postbuild cleanup), then perform scoped runtime checks when authorized. Development compilation time is not production load performance. Measure first usable ticket or Ring on representative desktop and mobile devices/networks; mic permission, connection latency, cancel/retry, and transport failure; input responsiveness, audio quality, and render activity during conversation; actual cap termination and delayed transcript/work-record/payment states; layout shifts, contrast, keyboard focus, narrow-screen overflow, reduced motion, and muted ambience; return-to-work latency and correctness, with missing or stale records included. A SwiftShader result or a passing measurement command is not Android/iOS hardware acceptance.

Related: [UX](UX.md) owns the desk interaction contract; the spatial-room
work in progress is tracked in
[LIVE_DESK_AVATAR_PLAN](LIVE_DESK_AVATAR_PLAN.md).
