# HISTORY — closed contests and retired infrastructure

**Historical digest.** Consolidated 2026-11-17 from nine closed-contest and retired docs (STOCKLANA_BUILD_PLAN, STOCKLANA_SUBMISSION, ASSEMBLYAI_SUBMISSION, WORLDS_FAIR_PLAN, WORLDS_FAIR_SUBMISSION, QUEST_DEMO, LIVE_BASE_SPRINT, CRITICAL_EVALUATION, STREAMING_INTEGRATION). Full prior text in git history. Nothing here describes current behavior — see [docs/README.md](README.md) for living docs.

The house's current product surface, architecture, and operations are documented in [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DESKS.md](DESKS.md), [VOICE.md](VOICE.md), [OPERATIONS.md](OPERATIONS.md), [UX.md](UX.md), and [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md). This file records only what happened, when, and what evidence remains.

## Chronology at a glance

| Effort | Deadline / date | Outcome |
|---|---|---|
| Live Base execution sprint | 2026-09-09 (sprint) | Mainnet smoke test passed — real 0.10 USDC → GOOGLc fill |
| Base Builder Quest demo | September 2026 | Demo pack written; contest closed |
| Stocklana (Jesse/Solana) | 2026-09-25, 16:00 ET | Jesse desk shipped; submission pack completed |
| AssemblyAI Voice Agent Hackathon | 2026-09-30, 15:00 UTC | Submission pack completed; protocol-level safety patterns landed |
| Crypto World's Fair | 2026-10-12, 11:59pm PT | One submission, three tracks (Solana + Base + Robinhood Chain); Tennie and Halley built |
| Critical evaluation | ~October 2026 | One-time wedge-vs-vision critique; strategy findings below |
| Streaming payments (Superfluid + WDK) | removed pre-x402 | Deleted as dead code; replaced by per-call x402 settlement |

---

## 1. Base Builder Quest and the Live Base execution sprint (September 2026)

**What it was.** Claflin's first contest positioning: a neobrokerage desk for Coinbase Tokenized Stocks on Base, in the quest's **Neobrokerages lane** (not memes, indexes, or yield stripping). Voice instruction → live Aerodrome estimate → explicit review → a real fill on Base mainnet, with paper mode for practice and eligible non-US access stated. Nothing staged — the demo's proof was an on-chain fill.

**The sprint (2026-09-09, three developers, parallel tracks):**

- Track A — verified router and call builder: the active `AERODROME_SWAP_ROUTER` is `0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F` (Gauges V3 / newest CL2 factory). The legacy `0xBE6D…` Slipstream router only routes the initial CL factory and reverts on the CL2 stock pools.
- Track B — client signer and execution via Privy `useSendTransaction`; `execute-swap` reads allowance, approves, swaps, waits for receipt.
- Track C — `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED` env gate, two-step Approve / Execute on Base UI, outcome stamp, BaseScan link.

**Mainnet smoke test: PASSED.**

| Field | Value |
|-------|-------|
| Instrument | GOOGLc |
| Side | buy |
| Input | 0.10 USDC |
| Output | 0.00030199 GOOGLc |
| Tx hash | `0x4877…3bf8775` (QUEST_DEMO form: `0x48773aac…8775`) |
| Wallet | `0x7c57…d64b` |
| Router | `0x698C…3A92F` |
| Outcome | `filled` |

The full 66-character hash was never written into either source doc — both abbreviate it, differently. It is recoverable on BaseScan from the wallet and date; full text of both docs is in git history.

**Gotchas fixed during the sprint** (still true of the Base rail): `viem` `readContract` needs a parsed `Abi` (`parseAbi([...])`, not `string[]`); swaps through the wrong-factory router revert rather than degrade; `NEXT_PUBLIC_PRIVY_CLIENT_ID` must never carry the app secret (server-only).

**Quest demo pack.** A 60-second Loom cut opening cold on the filled trade ("Ten seconds ago I bought a tokenized share of Alphabet on Base mainnet"), then ring → speak the instruction → estimate read-back with both voices captioned → slippage chip, Execute on Base, wallet signature → FILLED stamp with BaseScan link and balance → close on "paper mode to practice, live when you're ready." A 90-second paper fallback cut (tape → ticket → review estimate → record paper trade → ledger) for when the line, wallet, or venue fails on recording day; paper mode is honest and complete on its own. An X post draft tagging @buildonbase carried the Hetty lore that the video only gives one sentence. Judgment calls worth keeping: pre-approve USDC for the router so the on-camera path is one click (narrate the two-step instead of showing it — in 60 seconds choose voice or the full two-step, not both); quote validity is 30s, so execute inside the window and let the desk re-quote automatically if approval runs on camera; voice is the risk — mic permission, latency, agent availability — rehearse twice, and if the ring fails on take day, enter the ticket manually and keep moving (the demo survives it, the fumble doesn't). The do-not-demo list: fake live fills, wallet signing that doesn't exist, marketplace directory, free-call funnel, "live access" or eligibility as a feature, claiming regulated brokerage status, presenting the note of the day as advice, and letting the broker imply she signed or submitted anything.

**Outcome.** Closed. The sprint's landing is the ancestor of the current Base desk (see [DESKS.md](DESKS.md)); the execution code (`aerodrome-router.ts`, `execute-swap.ts`, `useDeskExecution.ts`) is live infrastructure, not history. Release evidence standards from this era survive in [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md).

---

## 2. Stocklana (Jesse Livermore / Solana desk) — September 2026

**What it was.** Solana's Stocklana hackathon. Primary track: Stocklana main; secondaries: PreStocks ($5k) and Pyth Pro. Confirmed deadline **Friday 25 September 2026, 16:00 ET** — resolved by Solana's official 15 September extension announcement, superseding the 18 September rules text still visible on the event page.

**The build plan (2026-09-16, updated 2026-09-20).** A 660-line four-engineer execution brief: E1 contracts/Jupiter/execution, E2 Pyth market evidence, E3 AssemblyAI voice, E4 experience/release. It defined two release levels:

- **R1 — complete paper decision desk:** real Solana catalog and Jupiter quotes, Pyth comparison when evidence permits, AssemblyAI conversation with spoken replies, corrections, paper filing/recovery, manual and mobile paths, honest failure states. Required as the submission baseline, "not a prototype with fake success."
- **R2 — controlled live trading:** fresh wallet-bound proposal, validated transaction, explicit wallet approval, submission journal and independent reconciliation, restrictions/access review. Implemented in parallel, enabled only after every live gate passed — with the rule that R1 does not mean R2 is complete: if live gates missed the deadline, publish the complete paper experience and disclose the missing live capability. Paper is never dressed as fills.

Design decisions recorded there that still shape the house: no knowledge-test gate, minimum trade count, balance threshold, XP, streaks, or paid-call requirement — the room becomes yours through the work you choose to keep; frozen shared contracts with a single owner (only E1 edited domain contracts, others requested changes by contract issue); strict protocol-specific quote parsing (never invent an EVM chain id, pool, or block for a Solana quote); Token-2022 Scaled UI Amount handled with explicit raw/scaled conversion and pending-multiplier boundaries; comparison rules that suppress rather than guess (freshness windows, session alignment, confidence bounds, "reference difference, not arbitrage"); provisional speech previews without side effects, final turns alone dispatch commands, and "yes" alone can never file; live execution as a separate proposal/state machine with journal-before-broadcast and unknown-outcome reconciliation; and conservative initial caps (paper ≤10,000 USDC, live ≤100 USDC per proposal, bounded voice/token budgets, 429 with retry information, paid paths fail closed if budget storage fails).

**Bounty outcomes:**

- **Main track** — the Jesse desk: verified Backed xStock catalog (Token-2022 with live scaled-UI multiplier), Jupiter Swap v2 Metis paper estimates, Room/Compact views of one controller, ConvAI line, foyer and house book.
- **PreStocks ($5k, sanctioned 2026-09-17)** — issuer-mark vs token-price duplex as evidence only, honest unavailable degradation; 8 products verified from the PreStocks API (ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET, SPACEX).
- **Pyth Pro** — equity-vs-xStock comparison; raw-token basis verified 2026-09-21 under the All Access trial; honest-unavailable when the Lazer daemon snapshot is cold. Prize was three months of Pyth Pro, not cash.
- **Declined:** Clawpump (requires launching a token — conflicts with the house's no-token, provenance-first direction); Tessera (same shape as PreStocks — one pre-IPO integration done deep beats two thin ones); Meteora DBC as a primary target (later re-scoped as a sidetrack — see World's Fair below).

**Judge deep link and demo grammar.** The submission pack locked the judge entry to Room view:

```
https://claflin.trustfall.xyz/?desk=jesse&view=room
```

- Never submit bare `/` — judges may land on the foyer or a remembered Hetty session. `/night-desk?study=1` fixtures are never presented as live markets.
- `/night-desk` redirects to the Room deep link; `/?desk=jesse` gives Room by default (Compact if the device prefers it); `?offering=<id>` may be appended only when the offering covers the desk.
- The demo script's third beat is the house-presence grammar: **Ring first.** Click **Ring Jesse** (or lift the receiver / press `H`); the line lifts and the mic stays off until the ring.
- Then speak or tap "buy 100 USDC of AAPLx" — words appear verbatim, each value underlined with a provenance mark; correct to "make that 50 USDC" and the old price is struck through, superseded, not erased.
- Show the duplex evidence (Pyth Pro when available, otherwise venue duplex / PreStocks — labelled not arbitrage; never invent a Pyth number); optionally the dual-flagged live path at tiny size; file the paper record, reload, and it is still there.
- Refusal beat: "buy DOGE on Solana" → clarify/refuse; the catalog boundary holds. If the mic fails on camera, tap the blotter lines — identical controller path.

**Team-process lessons worth keeping from the 660-line brief.** Land shared contracts and fixtures first as a small contract-only PR; one owner for types and the lockfile; everyone else works against fixtures, not against each other's branches. Use integration gates as a work order (contracts → first vertical slice → differentiated desk → submission-ready → live gate → receipt verified), not completion-time promises. The release captain integrates but is not the sole QA bottleneck — every engineer ships acceptance evidence for their owned surface. Keep incompleteness visible rather than marking a stream done because its happy path works; publish measured latency figures with sample counts and failures, never vendor marketing numbers; a provider-schema surprise is a contract blocker that stops implementation until the interface is reviewed.

**Outcome.** Contest closed. The Jesse desk and its evidence duplexes are permanent house infrastructure (see [DESKS.md](DESKS.md) and [VOICE.md](VOICE.md)); the live settle path remains implemented and dual-flagged off. The World's Fair submission later reused the Jesse integration as its in-window Solana-track evidence.

---

## 3. AssemblyAI Voice Agent Hackathon — September 2026

**What it was.** Lablab.ai hackathon, deadline **Wednesday 30 September 2026, 15:00 UTC**. The same product as the Stocklana entry; the difference is that Jesse's line runs on **AssemblyAI's Voice Agent API** at `https://claflin.trustfall.xyz/?desk=jesse&view=room&line=assemblyai` (without `&line=assemblyai`, Jesse rings on ElevenLabs — never submit the bare Stocklana URL here).

**Submission highlights — safety by protocol, not by prompt:**

- **Progressive tool reveal.** `record_paper` is not registered until a quotation is actually in review; every desk-state change re-sends `session.update` with the tools for that state. The model can't file what it can't call, and the browser refuses anyway if a call races the reveal.
- **Hold mode for the consequential step.** Filing runs in `hold` — the broker goes quiet until the browser has written or refused the record.
- **JSON-Schema amount checks.** A spoken amount that isn't a plain positive number is re-asked before the tool ever sees it.
- **`reply.done`-ordered tool results.** Results are sent only when `reply.done` is the latest event; a barge-in cuts audio at once and the result still lands.
- **Paper only.** No tool signs, submits, or touches a wallet; live settlement stays behind separate flags.

Also in the pack: the hold-to-talk dealer-turret landing page (one instruction lights every line that carries the product; the house names both rails — AAPLc on Coinbase/Base and AAPLx on Backed/Solana — and never picks one for you), a 2:30 video script with a staged "file it before pricing" refusal beat, six slides ("safety by protocol" as slide 4), prior-work disclosure (repo started 2026-02-09; Hetty/Base desk predates the hackathon; 189 commits in the Sep 1–30 window), and a model-note discipline: Universal-3.6 Pro Realtime shipped on deadline day but the repo never sets `speech_model`, so nothing claims 3.6 — on-screen credits stayed "Universal-3 Pro" until AssemblyAI confirmed the Voice Agent API's model. Deployment verification recorded 2026-09-30: the token route returned a live single-use token on the deployed build.

**Outcome.** Contest closed. The Voice Agent transport, tool-reveal machinery, and turret are current infrastructure (see [VOICE.md](VOICE.md)); the technical notes live in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 4. Colosseum Crypto World's Fair — October 2026

**What it was.** Colosseum's ecosystem-track hackathon; deadline **12 October 2026, 11:59pm PT**; judging window 14 Sept – 12 Oct with mandatory prior-work disclosure (nondisclosure disqualifying). One submission — the house — tagged to three tracks it genuinely integrates: **Solana + Base + Robinhood Chain**. The multi-rail house ("the house never asks visitors to prefer a chain") is what made three track picks coherent rather than opportunistic. Rejected: Tempo, Zcash (wrong product shape), Hyperliquid and Ethereum L1 (whole new rails in 11 days), Arbitrum (weaker third pick — judges would read it as Arbitrum One).

**Mechanics that mattered.** One submission per team, up to three tracks picked at registration; track prizes were additive to general awards (Grand Champion $30k, 20 standout teams × $15k, plus Public Good and University prizes), so a track pick was upside, not a trade-off. Track pools: Solana $100k (10 × $10k), Tempo $100k, Hyperliquid $100k, Zcash $100k; Ethereum L1, Base, Arbitrum, and Robinhood Chain at $25k each. Judging criteria: functionality, potential impact, novelty, UX, open-source/composability, business plan. All hackathon winners interviewed for the Accelerator ($250k pre-seed). Closed-repo risk was resolved 2026-10-02: the repo stayed public; if it had gone private, rules allowed it only with judge access (invite `hackathon@colosseum.com`).

**The Tennie slice (Robinhood Chain, chain ID 4663).** Built 2026-10-01 in one day after a keyless spike:

- Catalog restricted to the **24 triple-covered symbols** — rhj issuer REST (`ASSET_STATUS_ACTIVE`) ∩ onchain Chainlink feed ∩ Lighter spot book — so every offering carries issuer reference + onchain mark + venue quote, the fullest duplex the house has run.
- Marks adapter: rhj `/prices` issuer reference (and server-computed `tokenBid`/`tokenAsk`, verified against `currentMultiplier` across all 194 quotes) plus multiplier-adjusted onchain Chainlink feeds (35 symbols, 24h heartbeat).
- Estimates: Lighter orderbook USDG book-walks with depth/partial-fill labels; ~$2.06M across the 27 spot books but concentrated in a handful — thin names must label it.
- Desk surface, turret LINE 3, and ConvAI line. Paper-only by design — no live flag exists.
- Spike findings that stay true: Robinhood Chain's Uniswap deployments are ~2109-byte stubs with zero stock pools (never plan on that path); 0x RFQ answers crypto pairs but every stock token is policy-gated in both directions (`BUY/SELL_TOKEN_NOT_AUTHORIZED_FOR_TRADE`) — a compliance boundary, not a config gap; Rialto's Quote API needs a wallet-signed integrator key; direct mint/burn is KYB-only.

**Meteora repositioned.** The earlier Meteora-first framing was superseded: the Meteora DBC bounty (~$20K) became a separate **Superteam Earn sidetrack**, not the entry vehicle. The Earn landscape was enumerated 2026-10-02 (37 listings, ~$197k, all due 13 Oct 06:59 UTC): Meteora was the only build-cost entry worth the days; ~25 regional tracks were all geography-gated and no UK track existed (nearest IE/NL/DE); credit listings (CertiK, Adevar) were near-free but low-value for an app that custodies nothing. The Halley launch desk was built paper-first (2026-10-03) and its live two-transaction launch ceremony (curve config → pool+mint) landed 2026-10-10, devnet-verified with the production builder, dual-flagged; no mainnet mint was run. Venue-not-issuer hard line unchanged: a tracker token is the launcher's exposure token, never stock ownership.

**Outcome.** Submission pack completed — foyer as entry (one instruction lights every line that can carry it), four desks (Hetty/Base, Jesse/Solana, Tennie/Robinhood Chain, Halley/Meteora launches), full prior-work disclosure, two videos. Winners were to be announced by 5 December 2026. Contest closed; the in-window work (Jesse, rail-neutral seams, Tennie, Halley, the Coinbase Verifications eligibility gate) is all current infrastructure.

---

## 5. Critical evaluation — wedge vs. vision (~October 2026)

**What it was.** A one-time external strategy critique of the product as designed and as shipped, orphaned from any contest. Overall verdict: **wedge 7.6 / vision 6.5** — the wedge is coherent, distinctive, and bounded by honesty; the vision is defensible but execution-dependent. The findings that remain useful strategy context:

1. **The honesty posture is the strongest thing in the product (9.0/10).** Mode said once, source and freshness on every number, voice cannot sign, paper ≠ fill — structural, in house copy and desk copy and journal alike. This is the part that survives any UX critique and must not be traded away for growth mechanics.
2. **Rail-neutral offering-led entry is the genuinely defensible axis.** "Similar exposures on different rails are separate offerings" — Coinbase's NVDAc on Base ≠ Backed's NVDAx on Solana ≠ Robinhood's NVDA on 4663, shown as separate rows and architecturally enforced. Competitors without this have to rebuild to compete.
3. **Live execution is the load-bearing claim — and the weakest shipped story (4.5/10).** Every desk's live path is implemented but dual-flag-gated with fail-closed eligibility; the actual product was paper on every desk. The wedge lives in paper; the vision does not.
4. **Five historical AI personas is a cast, not a product.** Each desk needs a differentiated voice, prompt, tool set, and day-to-day output, or the house collapses into one ElevenLabs preset with different system prompts. Adding desks faster than they are "earned" is the failure mode; "we have four desks" marketing is forbidden by the house's own rules.
5. **Comprehension is not yet proven (5.5/10).** The right test: can a first-time caller say what the token is, which rail, whether money moved, and where the record lives? Design tries; no study had run. Related: the single highest-EV ship identified was the foyer's real example-call recording, and mobile-verifying the Room view with real provider voice (desktop cloud checks existed; mobile was never certified).
6. **The seams show under pressure.** Halley's identity drifted across three docs (launch desk vs Meteora's desk) and leaked into copy risk; the example call — the wedge's most credible proof — was the one piece admitted not yet true; and Jesse, the showcase desk, ran on venue-duplex marks rather than Pyth compare because Pyth Pro is honest-unavailable without entitlement. Also noted: the "meet the brokers" surface is closer to a four-card grid than the docs admit — a known doc-vs-implementation tension — and the wire reads as decoration to visitors who don't already know what they want.

The differentiation scoreboard, compressed: high defensibility — rail-neutral offering entry, voice-first with voice-that-cannot-sign, mode expressed in writing; medium — the persona cast (only if each desk actually operates well as a desk) and the editorial cadence (Hetty's Market Letter, gated on a reliable process before promising daily publishing); low — the long-running decentralized-brokerage thesis against a well-funded DEX frontend, and provenance slips as a small wedge. Recommended change-order: land the example call; wire a real Base stock reference so the board's gap cell stops being `—`; mobile-verify the Room; run the comprehension study; pre-publish the editorial process; make foyer and desk rooms visually distinguishable as rooms, not just by content.

Full text in git history.

---

## 6. Removed infrastructure — streaming payments

**What it was.** The Celo-era payment experiments: **Superfluid** (CFAv1Forwarder / USDCx per-second streaming) and the **WDK** (Tether Wallet Development Kit). Removed in the `chore: remove Superfluid + WDK dead code` commit series once the current model was proven.

**Why removed:**

1. **No callers** — nothing in the active call flow reached the streaming hooks once x402 took over.
2. **Wrong chain** — Celo-only contracts in a project that settled on Arbitrum.
3. **Wrong model** — per-second streaming required pre-funding and facilitator control; per-call x402 settlement is simpler and non-custodial.
4. **Dead dependencies** — the WDK packages and their native `sodium-native` / `require-addon` chain added build warnings for code nothing imported.

Deleted: `lib/superfluid-streaming.ts`, `useSuperfluidStreaming`, `StreamingPaymentModal`, the `CFA_V1_FORWARDER`/`SUPERFLUID_USDCX` exports, the WDK env/`ignoreWarnings` blocks, and the `superfluid_stream` payment mode (`PaymentState.mode` is `'user_settled'` only).

**What replaced it:** x402 USDC on Arbitrum with gasless settlement via the 1Shot Permissionless Relayer — the current payment/settlement path, documented in [ARCHITECTURE.md](ARCHITECTURE.md). Call payments are separate from paper-trade instructions.

**Standing rule:** this is a historical note, not a proposal to reintroduce streaming or subscriptions. Any future payment-model change is gated: demonstrate a concrete client or operational need, then separately review consent, caps, settlement correctness, and complexity before selecting an approach.

**Old widget engine.** The pre-foyer widget-based front end is retired; the current surface architecture (foyer → offering → desk) is described in [ARCHITECTURE.md](ARCHITECTURE.md), with the entrance/first-screen design rationale in [UX.md](UX.md) and the avatar/room presentation plan in [LIVE_DESK_AVATAR_PLAN.md](LIVE_DESK_AVATAR_PLAN.md).

---

## 7. Durable evidence index

| Artifact | Where recorded |
|---|---|
| Base mainnet smoke-test fill (0.10 USDC → 0.00030199 GOOGLc) | Tx `0x4877…3bf8775` / `0x48773aac…8775`, wallet `0x7c57…d64b`, on BaseScan |
| Aerodrome active router | `0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F` (Gauges V3 / CL2 factory) |
| Stocklana judge deep link | `https://claflin.trustfall.xyz/?desk=jesse&view=room` |
| AssemblyAI judge deep link | same host, `?desk=jesse&view=room&line=assemblyai` |
| World's Fair judge entry | `https://claflin.trustfall.xyz/` (foyer), desk deep links per desk |
| Robinhood Chain venue | Lighter domain, `api.rh.lighter.xyz`, keyless; chain ID 4663 |
| Contest repos / rules | `hackathons.solana.com/hackathons/stocklana`, `lablab.ai`, `colosseum.com/worldsfair` — all closed |

---

*Consolidated 2026-11-17. Corrections to dates, hashes, or outcomes: fix them here, citing git history for the original text.*
