# Auth & Access Model

**Status:** Design direction, refreshed 2026-09-08 to match the scaffold in source. The paper desk is anonymous by default — deliberately.

## Principle 1 — Capability tiers, not a front door

Authentication is not a prerequisite for the product; it unlocks capability in tiers.

| Tier | Unlocks | Mechanism today |
|------|---------|-----------------|
| **Anonymous** (current default) | Paper desk, live estimates, tape, Hetty voice session, browser-local records and watched marks | Signed URL from `/api/hetty/session`, instance-rate-limited. Nothing to protect — the desk is a view. |
| **Account** (env-gated scaffold) | Best-effort paper backup to Redis; write-only transcript POST; optional Sign in in the header | Privy email/social. Client sends a Privy bearer token on paper and transcript routes. Not an httpOnly session cookie. |
| **Authority** (not a product surface) | Future live execution, funding, eligibility | Wallet signature or bounded delegation, per action. Read-only eligibility check exists in source; it is not shown on the paper desk. |

The paper desk stays anonymous permanently. Requiring login before someone can read a tape, get an estimate, or ring Hetty is onboarding theater — exactly what this product removed. Sign-in, a linked wallet, or a passing eligibility check is not live access.

## Principle 2 — Voice is a channel, not an auth boundary

Channels produce instructions; the desk owns authorization. Voice, tap, typed text and a future API all emit the same `TradeIntent` object into `useTradingDesk` — nothing about the input modality changes what happens downstream. This already works: Hetty's client tools call the identical draft functions the form does, and `describe_desk` lets her observe manual edits mid-session.

Where channels differ is *ceremony*, not authority: a wallet signature or eligibility check cannot happen gracefully over audio. The rule is therefore structural, not a prompt instruction:

- Voice can draft, quote, pin a mark and record paper.
- Anything requiring cryptographic or eligibility authority requires an authenticated channel — Hetty says "I can't sign for you — confirm on the ticket," which is honest product, not a limitation.

**Not yet wired:** when accounts exist, identity was intended to bind at `/api/hetty/session` so transcripts and records attach regardless of spoken vs clicked input. Today `HettyCall` rings with a bare `POST` and no bearer token. A signed-in caller is still minted anonymously and counted against the instance budget. Transcript flush and paper sync *do* send the token when the client has one.

## Principle 3 — Authority is absent from the reachable surface

The current security posture holds because execution code does not exist, not because it is guarded. Keep it that way by adding authority only at explicit action boundaries:

1. **Voice is presentation, never authentication.** A voiceprint is not identity; everything Hetty hears is untrusted input, including ambient audio and prompt-injection attempts ("ignore previous instructions"). Mitigations: the tool surface is narrow by construction, `record_paper` requires explicit spoken confirmation, and no secrets or escalation hints live in the system prompt.
2. **Session-bound calls (intended).** With accounts: the session route should require auth when a token is presented, apply per-user limits, and bind conversation IDs to the account. The route already *accepts* a valid bearer token and applies a per-user limit when one arrives; the desk does not send it.
3. **Strict tool parameters.** `set_amount` accepts only a decimal string; `choose_instrument` and `watch_mark` resolve only canonical aliases; nothing free-form reaches a contract or a URL.
4. **Execution, when it comes.** Fresh signature per trade, or a bounded delegation (scoped capability via the retained ERC-8004 model — never a blanket approval). Eligibility is a server-side check, never a client flag, and never chrome on the paper desk.
5. **Transport hardening.** CSP (`connect-src` limited to self + ElevenLabs + Privy; `frame-src` for the Privy modal), `frame-ancestors 'none'`, `Permissions-Policy: microphone=(self)`, and the pre-commit secret scanner stay on. Session cookies (`SameSite=Lax` + `Secure` + `httpOnly`) are specified for a later privileged-route transport; they are not what the scaffold uses.

## Identity mechanism — decided for the scaffold

**Privy** is what is in the tree (env-gated). Dynamic and a lean Auth.js + wallet-link stack were considered and are not implemented.

- The audience is people outside the US who want US-equity exposure without wallet fluency — forcing a signature first inverts the funnel.
- Privy can issue embedded wallets for users who arrive without one, which matters for the eventual eligibility + execution path.
- Wallet linking is supported when a user brings their own; the retained `verifyWalletAuth` scaffolding fits the *authority* tier, not the identity tier.
- Revisit if custody requirements or pricing change.

## What the account scaffold actually does

When `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID` are set, `DeskAuthProvider` mounts Privy (`components/auth/AuthProvider.tsx`). Otherwise the desk is unchanged and the SDK never enters the bundle.

| Claim | Reality |
|---|---|
| Sign in appears in the header | Yes, only when configured. Does not gate the desk. |
| Paper records sync to the account | `POST/GET /api/paper` with a bearer token. Pull *adds* missing local keys; it never deletes. Local is authoritative for this browser. A local delete can reappear from Redis. |
| Transcripts save to the account | `POST /api/hetty/transcript` (30-day TTL, schema-validated) when a token is present. No GET. No desk UI. Anonymous calls store nothing. |
| Session binds to the account | Route can verify a token. The ring button does not send one. |
| Desk state / watchlist across devices | No. Watched marks are `localStorage` only (`claflin.watched.v1`). |
| Eligibility / live access | `/api/eligibility` implements the read-only Coinbase Verifications check. It is not mounted on the paper desk. |

Remaining if this tier is kept as a real account: provision the Privy app in each environment that should show Sign in; bind the session mint; honor deletes; give transcripts a read surface; decide cookie vs bearer for privileged routes.

## Authority tier — decided, staged, not shown

Progressive authority — the safe, high-friction path is the default and smoothness is earned, not offered.

- **L1 — verified + own-custody + per-trade signature (default).** Eligibility is checked onchain via **Coinbase Verifications** — Base-native EAS attestations, issuer-aligned (the same entity issuing the tokens attests to the account). A wallet is eligible when it holds a live "Verified Account" attestation AND a "Verified Country" attestation outside US/territories (Reg-S posture). Every trade is a fresh signature on the user's own wallet — visible, deliberate, legible. `lib/eligibility.ts` implements the read-only check (Base mainnet, EAS predeploy + Coinbase indexer/attester).
- **L2 — bounded delegation (opt-in, later).** Only after L1 verification: the user signs a scoped delegation policy (instruments, size caps, expiry, revocable — the retained ERC-8004 model fits) once, then trades flow within bounds. L2 never relaxes eligibility — it requires it plus a stricter bar.
- **Custody.** Own-wallet default; a Privy embedded wallet remains user-controlled (exportable keys) and can be offered as a "we provision one" option without weakening self-custody.
- **Fallback.** Self Protocol (passport-ZK) remains the fallback for non-Coinbase users; it asserts passport facts, not residence — sufficient signal, weaker than issuer attestation.

Voice may narrate and draft at any tier; the signature ceremony happens on-screen. Do not preview L1 as “live access” on a paper-only release.

## What is explicitly out

- No voiceprint or biometric authentication.
- No auth required for paper trading, the tape, or ringing Hetty.
- No eligibility, wallet-link, or “live access” banner on the paper desk.
- No client-visible transcript history until a read path exists.
- No credential or session material in ElevenLabs dynamic variables or the system prompt.
- The dormant webhook pipeline stays dormant.
