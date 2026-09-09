# Claflin Roadmap

**Updated: 2026-09-09.** The old directory/onboarding product is retired. Claflin is a curated, trade-first brokerage house with one coherent client desk. There are no existing-user or collaborator requirements to preserve the former experience.

[Product Direction](docs/PRODUCT_DIRECTION.md) owns jobs, principles, and information hierarchy. [Architecture](docs/AGENTIC_ARCHITECTURE.md) owns contracts and integration evidence. [Auth and access](docs/AUTH_AND_ACCESS.md) owns identity tiers. This roadmap owns sequencing, known gaps, house-desk order, and release gates.

## Current product

- `/` is Claflin's desk. Hetty is the current Base broker, not the house. `/desk` is an alias, not a second product. Former marketplace, demo, profile, dashboard, broker-profile, listing and admin pages redirect to `/`.
- No onboarding wizard, broker questionnaire, directory, ratings, streaks or free-call funnel is mounted. The paper desk does not require a wallet, an account, or a microphone.
- The seated first pass put the ticket and the line on one writing surface and removed the competing hero, empty continuity sections, and future-desks grid. Paper-only disclosures, review safeguards, and opt-in microphone/audio are preserved. Browser and responsive QA of that pass were skipped; the visual result is unverified.
- The job is paper estimate → review → local record, optionally driven by the line. The ticket, voice tools, and receiver share one foreground document; browsing a filed record is read-only. After filing, the compact ledger sits in the working area; the archive opens from there. Surfaces exist to serve that job: ticket, tape, board (when something exists), shareable `?intent=` drafts. They are not a landing inventory.
- A live tape (`/api/stocks/marks`) shows indicative Chainlink reference marks for the quote-supported instruments — never offers — with explicit stale/unavailable labels. Tape marks load the instrument into the ticket. The receiver is furniture beside the line. Handset pickup is reserved for an actual voice connection, not a pending quote. The object still lazy-loads behind a visibly different SVG after intersection and idle time; that is a defect.
- A live ElevenLabs voice session (“Ring Hetty”) drives the same draft through client tools executing in the caller's browser: `choose_instrument`, `set_instruction`, `set_amount`, `request_estimate`, `describe_desk`, `record_paper`, `cancel_instruction`, `watch_mark`. Session URLs are minted server-side (`/api/hetty/session`); the agent id and API key never reach the client. Hetty cannot sign, submit or reconcile — paper only. She belongs on a nameplate, not as the principal heading.
- Read-only Aerodrome estimates use `MixedRouteQuoterV3`, the verified factory selector and canonical USDC pool identities. Buy amounts are USDC spend; sell amounts are token quantity. Amount math uses strings and integers.
- The workflow supports review, edits, expiry, refresh, cancellation and explicit recording of simulated outcomes in browser-local storage. Optional Sign in (Privy, env-gated) copies paper records to the account and writes call transcripts server-side. Sync is best-effort: local storage stays authoritative; deletes are not propagated; transcripts have no client read surface; ringing Hetty does not send the account token. This is not live access.
- No wallet signing, order submission or real position reconciliation is implemented. A read-only Coinbase Verifications check exists in source (`lib/eligibility.ts`, `/api/eligibility`) for a later authority tier. It is not shown on the paper desk.
- Public broker discovery/listing and ratings APIs return 410 through the routing layer. Former provider/settlement modules remain source infrastructure, not the product's identity or navigation model. No database deletion was performed.
- `/desk-study` and `/widget-probe` are development references only and return not-found in production.
- House sequence (Jesse / Isabel / Arbitrum) lives in §5. It is strategy, not first-page IA. The house directory can visit a planned desk as a closed room. That visit cannot quote, file paper, ring Hetty, or carry a Base approval. A four-card grid must not return.
- Paper success is a filed paper record, not a live outcome. Live-execution statuses exist as types only (`submitted`, `pending`, `filled`, `failed`, `unknown`). Nothing signs or submits.

## Immediate opportunity

The user supplied Base's September 2 Builder Quest announcement for projects helping people trade or use Coinbase Tokenized Stocks on Base, with a $5,000 prize pool and Loom/X plus form submission. Confirm current terms, deadline and permitted demo modes before submitting. The quest motivates a coherent working demonstration; it does not justify fabricated execution or a return to marketplace breadth. Demo script: [docs/QUEST_DEMO.md](docs/QUEST_DEMO.md). If Privy is configured on the recorded deployment, Sign in will appear — do not present it as wallet bootstrap or live access.

## 1. Finish the first useful client journey

**Implemented foundation:** canonical root entry; four configured paper-quote candidates; exact-input estimates; explicit review and local paper records; live voice over the same draft; tape and desk board. Seated first pass: ticket and line share one writing surface; hero, empty continuity, and future-desks grid removed. House copy and room tone exist; they are weather, not the product.

Remaining acceptance work:

- Keep the consolidated interface. Rebuild the physical context around it: blotter, cropped ledger and correspondence, frosted partitions, ticker strip, receiver to one side. Most objects are not click targets.
- Replace the receiver's SVG-then-idle-load with a still from the actual model, camera, and lighting; swap only after the matching WebGL frame; reuse that still for reduced motion. Do not eagerly load Three.js as the fix.
- Make Claflin the display identity. Hetty is a nameplate beside the line, not the principal heading. Leave room for Livermore/Solana and Benham/Robinhood Chain without a four-card grid.
- Treat paper as the house language: blotter = draft, slip = returned estimate, receipt = filed evidence, ledger = retrievable history, tray = explicit watches. A dossier must not pretend to be a legal certificate.
- Keep finished work out of the tray. Do not label a recorded instruction “in progress,” and do not count drafts or records as pinned.
- Review the normal first visit, return visit, unavailable quote and expired review against the hierarchy in [Product Direction](docs/PRODUCT_DIRECTION.md)—not only component styling. Browser and responsive QA of the seated pass were skipped; do them on this pass.
- Verify understandable product/unit distinctions, keyboard/mobile/reduced-motion behavior and actionable error recovery.
- Keep essential state stable; background updates must not replace the instrument, amount or terms under review.
- Measure user comprehension and intent-to-reviewed-estimate friction. Do not measure success by paid minutes, onboarding completion, sign-ins or trading frequency.

**Exit evidence:** it feels like sitting at a desk, not looking at a page. A client reaches the ticket or the line without a tour or the broker as heading, and can explain the product, amount, paper status, estimate and recorded result. The receiver is complete on first paint. A four-desk footer is not that evidence. Automated checks supplement rather than substitute for product acceptance. A screenshot of the seated pass is useful feedback for the next refinement.

## 2. Connect Hetty to the shared instruction

**Delivered (paper scope).** “Ring Hetty” starts a live ElevenLabs ConvAI voice session: `POST /api/hetty/session` mints a short-lived signed URL server-side (API key and `ELEVENLABS_AGENT_HETTY` never reach the client; 10 sessions/minute per instance), and the desk registers eight client tools which execute in the caller's browser against the same `useTradingDesk` draft. Hetty reads back real estimate output, requires explicit confirmation before recording, and cannot sign or submit anything. Voice and manual input manipulate one instruction; edits still invalidate review; provider failures surface honest errors rather than fabricated quotes.

Remaining within this milestone:

- Microphone consent is requested by the browser at ring time; dropped calls and mic denial surface honest errors. The desk never auto-launches a call.
- Post-call transcripts POST to `/api/hetty/transcript` when a Privy bearer token is present (30-day TTL). There is no GET and no desk UI for them. Anonymous calls store nothing. The retained webhook pipeline remains dormant. Ringing does not attach the account token, so a signed-in call is still minted anonymously.
- Recording, account binding and a live-execution tool surface remain gated work, not voice-reachable.

## 3. Establish account access and transaction preparation

The capability-tier model and the current scaffold are in [docs/AUTH_AND_ACCESS.md](docs/AUTH_AND_ACCESS.md). Voice remains a channel over the shared draft, never an authentication boundary. Sign-in is optional and must not become a front door.

Decided, not released:

- **Identity:** Privy (email/social, optional wallet link). Implemented as an env-gated provider and bearer-token verification, not httpOnly cookies.
- **Eligibility policy:** Coinbase Verifications on Base (live “Verified Account” + non-US/territory “Verified Country”). Read-only check in `lib/eligibility.ts`. Not a paper-desk surface.

Still open before any live ticket:

- Client funding model and the applicable product-access review for Coinbase Tokenized Stocks.
- Verify the execution router against the actual factory and selected pools. The historical router constant is not execution acceptance evidence.
- Bind a proposal to product, account, chain, side, exact amounts, fee/slippage bounds and validity. Separate token allowances from swap authorization.
- Check account-specific token policy/pauses, balances and required permissions. Observe corporate-action/update multiplier changes consistently.
- If the account tier is kept: bind `/api/hetty/session` to the signed-in caller, honor paper deletes on the server, and give transcripts a read surface — or keep describing the tier as optional backup with no client-visible history.
- Add deterministic and appropriate test-environment fixtures for rejection, wrong chain, stale data, expiry, changed terms and failed simulation.

**Exit evidence:** an exact, independently reviewable transaction proposal with no silent account switch, bridging or reused authority. No funds move during preparation. A passing eligibility check is not a proposal.

## 4. Release controlled live trading

- Complete product/access/compliance and security review for the selected products, users, venues and limits.
- Validate user authorization, submission, duplicate prevention and reconciliation in an explicitly approved live setup.
- Distinguish live outcomes from paper files. A paper record is filed, never filled. Live statuses already exist as types (`submitted`, `pending`, `filled`, `failed`, `unknown`); add venue reconciliation, reverted/rejected/expired as needed, and never reuse the paper receipt as a generic success model.
- Establish monitoring, incident/disable controls and client recovery paths. Call-payment receipts remain separate from trade receipts.

**Exit evidence:** authorized transactions reconcile to venue/chain evidence and actual balances. Paper or testnet success alone does not establish live readiness.

## 5. Add supporting depth and specialist desks

Research, reviewed market letters, saved interests and explainable adaptation support trade discovery and understanding. They are not required reading before a direct instruction. Avoid a CMS, infinite news feed or autonomous thematic basket project ahead of reliable trading.

| Desk | Sequence and gate |
|---|---|
| Hetty / Base | First. Coinbase Tokenized Stocks, verified products, explicit access and execution policy. |
| Jesse Livermore / Solana | Second. Distinct instruments, signing/execution adapter and accountable handoff. |
| Isabel Benham / Robinhood Chain | Third. Network choice settled; token rights, eligibility, venue and integration remain to be verified. |
| Arbitrum desk | Fourth. Mandate and broker to be defined; existing billing infrastructure does not move it forward in the sequence. |

Handoffs may carry permitted context, never silent transaction authority or funds. Visiting a planned desk from the house directory is already a closed room: no ticket, no quote, no recording, and no transplanted approval. Further route options require independent product/provider verification and transparent terms. One rejected 0x NVDAc request and an Odos infrastructure error do not establish a universal aggregator prohibition.

## Not backlog

Do not revive open broker registration, marketplace rankings, personality quizzes, calling streaks, per-minute discovery, the old onboarding wizard or migration work for nonexistent legacy users. Do not put eligibility, wallet-link or “live access” chrome on the paper desk. Preserve useful code selectively, not the old product structure.

## Verification and evidence

The preceding paper slice passed unit/type/build checks and mocked browser lifecycle checks, with a separate read-only mainnet estimate. The cutover adds source/route/identity regression checks and HTTP verification; no browser automation is required for this pass. Neither set of checks claims a validated live voice or trading release.
