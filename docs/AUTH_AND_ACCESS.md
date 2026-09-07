# Auth & Access Model

**Status:** Design direction, 2026-09-07. The paper desk is anonymous today — deliberately. This document defines how identity arrives without breaking that.

## Principle 1 — Capability tiers, not a front door

Authentication is not a prerequisite for the product; it unlocks capability in tiers.

| Tier | Unlocks | Mechanism |
|------|---------|-----------|
| **Anonymous** (current) | Paper desk, live estimates, tape, Hetty voice session, browser-local records | Signed URL from `/api/hetty/session`, rate-limited. Nothing to protect — the desk is a view. |
| **Account** | Cloud-synced paper record, transcript history, preferences, desk state across devices, per-user rate limits | Email/social login → httpOnly session cookie |
| **Authority** | Live execution, funding, eligibility checks | Wallet signature or bounded delegation, per action |

The paper desk stays anonymous permanently. Requiring login before someone can read a tape or get an estimate is onboarding theater — exactly what this product removed.

## Principle 2 — Voice is a channel, not an auth boundary

Channels produce instructions; the desk owns authorization. Voice, tap, typed text and a future API all emit the same `TradeIntent` object into `useTradingDesk` — nothing about the input modality changes what happens downstream. This already works: Hetty's client tools call the identical draft functions the form does, and `describe_desk` lets her observe manual edits mid-session.

Where channels differ is *ceremony*, not authority: a wallet signature or eligibility check cannot happen gracefully over audio. The rule is therefore structural, not a prompt instruction:

- Voice can draft, quote and record paper.
- Anything requiring cryptographic or eligibility authority requires an authenticated channel — Hetty says "I can't sign for you — confirm on the ticket," which is honest product, not a limitation.

When accounts exist, identity binds at the session boundary: `/api/hetty/session` requires the session cookie, so transcripts and records attach to an account regardless of whether they were spoken or clicked.

## Principle 3 — Authority is absent from the reachable surface

The current security posture holds because execution code does not exist, not because it is guarded. Keep it that way by adding authority only at explicit action boundaries:

1. **Voice is presentation, never authentication.** A voiceprint is not identity; everything Hetty hears is untrusted input, including ambient audio and prompt-injection attempts ("ignore previous instructions"). Mitigations: the tool surface is narrow by construction, `record_paper` requires explicit spoken confirmation, and no secrets or escalation hints live in the system prompt.
2. **Session-bound calls.** With accounts: the session route requires auth, applies per-user limits, and binds conversation IDs to the account.
3. **Strict tool parameters.** `set_amount` accepts only a decimal string; `choose_instrument` resolves only canonical aliases; nothing free-form reaches a contract or a URL.
4. **Execution, when it comes.** Fresh signature per trade, or a bounded delegation (scoped capability via the retained ERC-8004 model — never a blanket approval). Eligibility is a server-side check, never a client flag.
5. **Transport hardening.** CSP (`connect-src` limited to self + ElevenLabs), `frame-ancestors 'none'`, `Permissions-Policy: microphone=(self)`, `SameSite=Lax` + `Secure` + `httpOnly` for any session cookie, and the pre-commit secret scanner stays on.

## Identity mechanism — recommended

**Privy** (or Dynamic) over wallet-first SIWE:

- The audience is people outside the US who want US-equity exposure without wallet fluency — forcing a signature first inverts the funnel.
- Privy issues embedded wallets for users who arrive without one, which matters for the eventual eligibility + execution path.
- Wallet linking is supported when a user brings their own; the retained `verifyWalletAuth` scaffolding fits the *authority* tier, not the identity tier.

Open decision: Privy vs Dynamic vs a lean Auth.js + wallet-link stack. Privy is recommended for time-to-ship and embedded-wallet coverage; revisit if custody requirements or pricing change.

## Phasing

1. **Now (done):** anonymous paper desk; server-side key isolation; rate-limited session minting; CSP + permissions headers; voice bound to client tools with confirmation gating.
2. **Account tier (scaffolded):** `components/auth/AuthProvider.tsx` mounts Privy only when `NEXT_PUBLIC_PRIVY_APP_ID`/`NEXT_PUBLIC_PRIVY_CLIENT_ID` are set — otherwise the desk is unchanged and the SDK never enters the bundle. A "Sign in" control appears in the header; `/api/hetty/session` binds the call to the verified account when a token is presented (per-user limits) and stays anonymous otherwise; `POST/GET /api/paper` syncs records to the account (Redis) when signed in; `POST /api/hetty/transcript` stores the call transcript to the account (30-day TTL, schema-validated) — anonymous calls leave no record. Remaining: provision the Privy app, add session-cookie hardening if/when privileged routes need it.
3. **Authority tier:** wallet binding + eligibility service → execution adapter behind explicit per-trade authorization. Voice may narrate and draft; the signature ceremony happens on-screen.

## What is explicitly out

- No voiceprint or biometric authentication.
- No auth required for paper trading, the tape, or ringing Hetty.
- No transcript storage on the client path until accounts exist (the dormant webhook pipeline stays dormant).
- No credential or session material in ElevenLabs dynamic variables or the system prompt.
