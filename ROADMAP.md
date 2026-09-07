# Claflin Roadmap

**Updated: 2026-09-05.** The old directory/onboarding product is retired. Claflin is a curated, trade-first brokerage house with one coherent client desk. There are no existing-user or collaborator requirements to preserve the former experience.

[Product Direction](docs/PRODUCT_DIRECTION.md) owns the experience. [Architecture](docs/AGENTIC_ARCHITECTURE.md) owns contracts and integration evidence. This roadmap owns sequencing and release gates.

## Current product

- `/` is Hetty's desk. `/desk` is an alias, not a second product. Former marketplace, demo, profile, dashboard, broker-profile, listing and admin pages redirect to `/`.
- No onboarding wizard, broker questionnaire, directory, ratings, streaks or free-call funnel is mounted. Root rendering does not initialize wallets, voice widgets, use-case personalization or call billing.
- The desk has an empty initial stock/amount, a concise house introduction, explicit paper mode, a trade ticket and local paper history. Product, price-source and simulation details are disclosed in context.
- A live tape (`/api/stocks/marks`) shows indicative Chainlink reference marks for the quote-supported instruments — never offers — with explicit stale/unavailable labels. Tape marks load the instrument into the ticket. The desk instrument reflects desk state physically: handset raised while a quote is in flight, a paper slip printed at review, a dial bearing per stage.
- A live ElevenLabs voice session (“Ring Hetty”) drives the same draft through client tools executing in the caller’s browser: choose instrument, set side/amount, request estimate, describe desk, record paper on explicit confirmation. Session URLs are minted server-side (`/api/hetty/session`); the agent id and API key never reach the client. Hetty cannot sign, submit or reconcile — paper only.
- Read-only Aerodrome estimates use `MixedRouteQuoterV3`, the verified factory selector and canonical USDC pool identities. Buy amounts are USDC spend; sell amounts are token quantity. Amount math uses strings and integers.
- The workflow supports review, edits, expiry, refresh, cancellation and explicit recording of simulated outcomes in browser-local storage. No wallet signing, account eligibility, order submission or real position reconciliation is implemented.
- Public broker discovery/listing and ratings APIs return 410 through the routing layer. Former provider/settlement modules remain source infrastructure, not the product's identity or navigation model. No database deletion was performed.
- `/desk-study` and `/widget-probe` are development references only and return not-found in production.

## Immediate opportunity

The user supplied Base's September 2 Builder Quest announcement for projects helping people trade or use Coinbase Tokenized Stocks on Base, with a $5,000 prize pool and Loom/X plus form submission. Confirm current terms, deadline and permitted demo modes before submitting. The quest motivates a coherent working demonstration; it does not justify fabricated execution or a return to marketplace breadth.

## 1. Finish the first useful client journey

**Implemented foundation:** canonical root entry; house-first copy and navigation; four configured paper-quote candidates; exact-input estimates; explicit review and local paper records.

Remaining acceptance work:

- Review the normal first visit, return visit, unavailable quote and expired review against the desired quality—not only component styling.
- Verify understandable product/unit distinctions, keyboard/mobile/reduced-motion behavior and actionable error recovery.
- Keep essential state stable; background updates must not replace the instrument, amount or terms under review.
- Measure user comprehension and intent-to-reviewed-estimate friction. Do not measure success by paid minutes, onboarding completion or trading frequency.

**Exit evidence:** a client reaches useful work without a tour and can explain the product, amount, paper status, estimate and recorded result. Automated checks supplement rather than substitute for product acceptance.

## 2. Connect Hetty to the shared instruction

- Implement a structured, authenticated tool/event bridge from the voice provider into the same trading service and draft model.
- Let Hetty clarify intent and explain the actual returned estimate. Web search is research context, never the pricing source.
- Preserve microphone consent, clear call terms and actual transport state. Do not reintroduce the old call funnel or automatically launch calls from query parameters.
- Keep broker identity/mandate in the house model, provider IDs in integration configuration, and trading authority outside the prompt.
- Reuse existing voice infrastructure only where verified; do not reproduce its old UI or claim post-call transcripts are live tool events.

**Exit evidence:** speaking and manual editing manipulate the same instruction; revisions invalidate review; provider failures cannot fabricate quotes or approval. Dictation alone does not satisfy this milestone.

## 3. Establish account access and transaction preparation

- Decide the client wallet/account and funding model, and the applicable eligibility policy for Coinbase Tokenized Stocks.
- Verify the execution router against the actual factory and selected pools. The historical router constant is not execution acceptance evidence.
- Bind a proposal to product, account, chain, side, exact amounts, fee/slippage bounds and validity. Separate token allowances from swap authorization.
- Check account-specific token policy/pauses, balances and required permissions. Observe corporate-action/multiplier changes consistently.
- Add deterministic and appropriate test-environment fixtures for rejection, wrong chain, stale data, expiry, changed terms and failed simulation.

**Exit evidence:** an exact, independently reviewable transaction proposal with no silent account switch, bridging or reused authority. No funds move during preparation.

## 4. Release controlled live trading

- Complete product/access/compliance and security review for the selected products, users, venues and limits.
- Validate user authorization, submission, duplicate prevention and reconciliation in an explicitly approved live setup.
- Distinguish acknowledged, pending, filled, reverted, rejected, expired and unknown outcomes; reconcile ambiguity before retrying.
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

Handoffs may carry permitted context, never silent transaction authority or funds. Further route options require independent product/provider verification and transparent terms. One rejected 0x NVDAc request and an Odos infrastructure error do not establish a universal aggregator prohibition.

## Not backlog

Do not revive open broker registration, marketplace rankings, personality quizzes, calling streaks, per-minute discovery, the old onboarding wizard or migration work for nonexistent legacy users. Preserve useful code selectively, not the old product structure.

## Verification and evidence

The preceding paper slice passed unit/type/build checks and mocked browser lifecycle checks, with a separate read-only mainnet estimate. The cutover adds source/route/identity regression checks and HTTP verification; no browser automation is required for this pass. Neither set of checks claims a validated live voice or trading release.
