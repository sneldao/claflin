# Error Resilience & CORS Architecture

How Claflin prevents — and gracefully survives — API failures like:

```
Access to fetch at 'https://api.your-claflin-app.com/api/agents?...' from origin
'https://your-claflin-app.vercel.app' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root cause

The browser called the Hetzner API cross-origin. Any backend restart, nginx 502,
or TLS hiccup produced a response *without* CORS headers, so the browser masked
the real problem as a CORS error (`net::ERR_FAILED`) and the UI could only show
a dead-end "Failed to fetch".

## The three layers

### 1. Same-origin proxy (eliminates the failure class)

`API_PROXY_TARGET` is set on Vercel only. `next.config.js` adds a `beforeFiles`
rewrite so the browser calls its **own origin** at `/api/*` and the Next.js
server forwards server-to-server. No browser CORS, no preflight round-trips,
first-party cookies, and ad-blockers stop flagging API calls.

- Vercel: `API_PROXY_TARGET=https://api.claflin.trustfall.xyz` (and unset the
  legacy `NEXT_PUBLIC_API_URL`).
- Hetzner / local dev: leave it unset — local route handlers serve directly.

### 2. Central CORS proxy (`proxy.ts`, Next.js 16 convention)

For direct cross-origin hits (embedded widgets, SDK consumers):

- Every `OPTIONS /api/*` preflight is answered at the edge with `204` +
  reflected `Access-Control-Allow-Origin` + `Max-Age: 86400` — even when the
  backend is down, so outages are never *misreported* as CORS errors.
- Every API response gets CORS headers stamped centrally, so routes can't
  forget (previously only some GET handlers called `withCors()`).
- No `Access-Control-Allow-Credentials`: auth is wallet-signature based, no
  cookies. Reflecting any Origin is therefore safe; set
  `CORS_ALLOWED_ORIGINS` to restrict.

### 3. Resilient client (`lib/api-client.ts`)

- `apiFetch()` — bounded request deadline covering fetch, body parsing and retry
  waits, jittered exponential backoff honoring `Retry-After` on 429s, retries
  **only** idempotent GET/HEAD (never replay a POST/payment), and a `fetchJson()`
  wrapper that resolves instead of throwing for desk call sites.
- `ApiError` — typed `kind` (`offline | network | timeout | http | parse`) +
  `friendlyMessage` in the Claflin broker-desk voice. Raw
  "Failed to fetch" and JSON-parse errors (`Unexpected token '<'`) never reach
  the UI — non-JSON responses are refused before parsing.
- Retired era's `lib/useSWR.ts` is no longer present; the tape and quote
  fetches use `fetchJson()` directly and keep their own last-known-good state.

## Voice line lifecycle (`components/desk/HettyCall.tsx`)

The ElevenLabs provider's `startSession` silently no-ops while a conversation
or connection-lock ref is still held, and a backgrounded or frozen tab can
kill the socket without events — a stale line then refuses every future ring
with no error surfaced. The line therefore owns its own lifecycle:

- **Fresh provider per session.** The outer `HettyCall` shell holds a session
  key and remounts the `ConversationProvider` after every terminal event, so
  the next ring always starts with clean refs. Closing notes and errors are
  held by the shell and passed back in as props, so they survive the remount.
- **One terminal funnel.** `onDisconnect`, `onError`, the dial watchdog, user
  cancel and the page-lifecycle handlers all converge on exactly one of
  `onSessionEnded` / `onSessionFailed`; a per-mount guard ensures only the
  first terminal event decides how the session is reported (an error and a
  disconnect often arrive together).
- **One guarded `hangUp()`.** Mute first, then `endSession`, only while
  connected or connecting. Mic chunks already in flight during a close can
  still throw the SDK's "WebSocket is already in CLOSING or CLOSED state"
  console error — `@elevenlabs/client`'s `sendMessage` has no readyState
  guard (verified through 1.25.0). Muting shrinks the window; the remaining
  logs are benign teardown noise.
- **Bounded dialling.** A 20s watchdog ends any ring that never connects and
  returns the desk to ringable — "Connecting…" is never a dead end.
- **Deliberate hangup on the way out.** `visibilitychange` → hidden,
  `pagehide`, and bfcache restores (`pageshow` with `persisted`) end the call
  honestly instead of leaving a zombie line. Continuity is carried by the
  ticket: the next ring's opening line is rebuilt from the draft on the paper.
- **End call is confirmed.** If no disconnect event returns within 2s of
  End call (silently dead socket), the closing note is landed locally.

## Client recovery requirements

[Product Direction](PRODUCT_DIRECTION.md) owns the target experience. Recovery should preserve the client's work, state what did and did not happen, and offer a safe next action. The current mascot, skeleton rows, and "redial" wording below are implementation descriptions, not a requirement to preserve the operator-themed presentation.

Automatic retries here concern read-only data availability. They do not authorize restarting a microphone session, replaying a paper instruction, or retrying a payment. Delayed transcripts, unsaved instructions, and unsettled call receipts must remain distinct, truthful states. Retaining stale data is not evidence that it is current.

## Current directory-era presentation

| Situation | Current presentation |
|---|---|
| First load | Skeleton rows; after 4s, "Warming up the broker desk…" |
| Cold-start failure (no cache) | `ConnectionError`: desk bell mascot, friendly headline, "Ring again" button, visible auto-redial countdown (5s→10s→20s→30s), instant retry on `online` event |
| Failure with stale data | Broker desk stays on screen + `ReconnectingBanner` ("showing the last known lines") |
| Offline | Offline copy + automatic redial the moment connectivity returns |
| Broker page network failure | Retryable `ConnectionError` — never a false "Broker not found" |
| Page crash | `app/error.tsx`: on-theme "The line went dead" with desk bell + digest ref |

Accessibility: the failure headline/message is announced once via
`role="alert"`; the per-second countdown is `aria-hidden` (screen readers get
a static "we keep redialing" note instead of being spammed).

## Previously recorded verification

Revalidated 2026-09-09 against the current implementation (JSON-safe API 404s in `proxy.ts`, marks stale-serving, api-client retry/`Retry-After` contract):

- `tests/api-client.test.ts` — 18 tests for classification, retry, backoff, parse refusal — passing.
- `proxy.ts` answers unknown `/api/*` paths with a JSON 404 (`error: not_found`, `no-store`) instead of the HTML 404 page, so clients can never parse `"<!DOCTYPE"` as JSON.
- `GET /api/stocks/marks` serves the last-known-good tape stale (up to 30 minutes, `X-Marks-Stale: true`) when the RPC refresh fails, instead of an immediate 503.
- API responses still carry centrally-stamped CORS headers via `proxy.ts` (`applyCorsHeaders`); retired-marketplace 410s unchanged.
