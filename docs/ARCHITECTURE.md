# Claflin Architecture

**Merged 2026-11-17** from AGENTIC_ARCHITECTURE, ERROR_RESILIENCE, WIDGET_ARCHITECTURE, SECURITY_ARCHITECTURE_COMPARISON and STREAMING_INTEGRATION (single-source consolidation; full prior text in git history).

## Scope and product ownership

This document describes supporting implementation, not the client's information architecture or the order in which features should be built. [Product Direction](PRODUCT.md) owns the experience; [Operations](OPERATIONS.md) owns open gaps and release gates. The primary capability is trade facilitation: resolve intent and access, quote, authorize, execute, and reconcile. Voice, research, publications, and adaptation support that execution path rather than gate it.

- **Clients** arrive at `/`, Claflin's front door, with no onboarding or marketplace prerequisite. A fresh visit opens the foyer and house book; the first semantic action is an instruction or a concrete offering selection. Inside the chosen desk, the ticket or the line is first. Hetty covers Coinbase Tokenized Stocks on Base; Jesse covers Backed xStocks on Solana; Tennie covers Robinhood Stock Tokens on Robinhood Chain (paper-only); Halley prices Meteora DBC tracker-token launches on Solana (paper default, dual-flagged live launch implemented). All four desks prepare estimates and keep desk-local paper outcomes; env-gated live execution code exists separately for the Base and Solana rails, with release evidence separate from code presence. Per-desk detail lives in [Desks](DESKS.md).
- **House identity** lives in `lib/house.ts`; entry resolution lives in `lib/house-entry.ts`; mandate, offering, coverage and estimate contracts live in `lib/desk/*`. Identity order is Claflin → selected offering, mandate and rail → active desk and broker → current instruction. `voiceConversationEnabled` is presentation capability; live execution is a flag-gated coverage capability, not a static house constant.
- **Marketplace flows are retired.** Old client pages redirect to `/`; public `/api/agents` and descendants, `/api/ratings`, and `/api/sdk/register` return 410 before any upstream proxy forwarding. Root layout mounts an optional Privy account provider only when configured; it does not initialize the old wallet, theme or voice-widget stack.

Each open desk's live voice path is an ElevenLabs ConvAI session: `POST /api/hetty/session` mints Hetty's signed URL, `POST /api/desk/jesse/session` mints Jesse's, `POST /api/desk/tennie/session` mints Tennie's, and `POST /api/desk/halley/session` mints Halley's. Tool calls are client tools executing against that desk's controller in the caller's browser; voice can draft, quote, and file paper only under the desk's explicit boundaries. The historical `<elevenlabs-convai>` widget and the retained webhook orchestrator at `/api/webhooks/elevenlabs` are not part of this path — see [Legacy voice widget](#legacy-voice-widget). Voice architecture overall is described in [Voice](VOICE.md).

## Night Desk: shipped study and integration boundary

**Baseline `decace0`, 2026-09-17.** `/night-desk` redirects to the integrated Room view at `/?desk=jesse&view=room`; `/night-desk?study=1` and development `/desk-study` remain fixture studies. The fixture files (`components/night-desk/`, `lib/night-desk-state.ts`, `lib/night-desk-fixtures.ts`, `lib/night-desk-scene.ts`) are not the authoritative product controller. The integrated desk uses `components/desk/JesseDeskSurface.tsx`, `lib/solana/useJesseDesk.ts`, `lib/solana/*`, and `components/desk/RoomPresentation.tsx` over the real xStock/Jupiter/Pyth/ConvAI/wallet boundaries.

The integrated architecture separates three owners: authoritative desk/controller, conversation transport, and renderer. Room/Compact presentation is a local preference over the same work; it is not a capability tier, broker/network switch, or reason to restart a voice session. Keep the controller/session above renderer selection. Camera and projected labels consume stable evidence/quote/record identities, and their animation must never create financial success or renew authority.

Continuity comes from schema-validated real paper records and explicit watches with their existing owner/desk/retention boundaries. Never import the study key `claflin.night-desk.study.v1` into real records. No `experienceLevel`, quiz score, trade count or presentation preference authorizes a financial action. Saved-work deletion removes its return suggestion; no unrequested transcript memory. [Product Direction](PRODUCT.md) owns this behavior; the historical build-plan protocol and ownership maps are recorded in [History](HISTORY.md).

## Client-work boundaries

Keep public publication editions, source/price snapshots, private research notes, transcripts, proposed/recorded instructions, and call-payment receipts distinct. A published opinion is not a client instruction; relevance is not suitability; a conversational promise is not persistence; a call charge is not an order. Simulated and live outcomes must never share an ambiguous success state.

The active target is a curated, execution-first brokerage house over explicit mandates and offerings. The old registry, provider keys and Arbitrum payment scaffolding are not the public identity model. There are no existing-user migration requirements; replace old assumptions rather than preserve them. Any voice integration must explicitly bind the house broker to a verified provider configuration and desk mandate. Never infer execution network or authority from an old provider key.

## Implemented rail-neutral desk architecture

The implemented boundary is product/offering-led rather than chain-first:

```
Visitor instruction
        ↓
House offering book → concrete InstrumentOffering
        ↓
Eligible DeskRuntime + DeskCoverage
        ↓
Venue/market adapter → rail-specific estimate evidence
        ↓
Neutral estimate envelope → paper record or explicit live path
```

- `lib/desk/contracts.ts` owns shared desk vocabulary: `DeskId`, `MarketMandate`, `RailRef`, `DeskCoverage`, `DeskRuntime`, `InstrumentOffering`, `DeskEstimateEnvelope`, storage policy, lifecycle stages, paper-record and execution-port envelopes.
- `lib/desk/mandates.ts` owns mandate definitions such as `coinbase-tokenized-stocks` and `backed-xstocks`. A mandate binds issuer/product access, supported rails and venues; it does not make a chain a strategy.
- `lib/desk/offerings.ts` owns concrete offerings. Each offering binds product id, instrument id, mandate, issuer, rail, venue, quote asset, unit policy, eligible desks, quote support and active/planned status. Comparable Base and Solana exposures remain distinct offerings.
- `lib/desk/registry.ts` owns desk runtime coverage and capability policy. Hetty covers Coinbase Tokenized Stocks on Base/Aerodrome/Chainlink; Jesse covers Backed xStocks on Solana/Jupiter; Tennie covers Robinhood Stock Tokens on Robinhood Chain/Lighter/Chainlink (quote mode paper, voice `elevenlabs-convai`); Halley covers Meteora DBC launches on Solana (estimate adapter `meteora-dbc`, marks none — the desk's tape is the projected curve, execution `meteora-live` designed but unimplemented, voice `elevenlabs-convai`). Jay remains planned — explicit coverage intent but no borrowed adapter, venue or storage policy.
- `lib/desk/estimates.ts` can wrap a registered estimate in `DeskEstimateEnvelope` with `deskId`, `mandateId`, `offeringId`, `instrumentId`, `rail`, `venue` and frozen rail evidence; `withEstimateContext` attaches the explicit desk/mandate/offering/instrument ids to fresh estimate payloads while preserving legacy Base/Solana parsers.
- `lib/desk/offerings-presentation.ts` and `components/desk/HouseOfferings.tsx` turn an instruction into comparable offering groups and show only open desks with actual coverage.
- `lib/house-entry.ts` resolves `?desk=` and `?offering=`. `?desk=` remains a valid deep link; `?offering=` is retained only when the catalog offering explicitly covers that desk.
- `lib/trading/adapters.ts` resolves quote and mark adapters from desk runtime coverage and concrete instrument context. Ambiguous or cross-desk requests fail closed instead of guessing from `chainId` or network.
- Base evidence remains in `lib/trading/`; Solana evidence remains in `lib/solana/`. Shared envelopes do not flatten rail-specific proof, transaction payloads or paper-record schemas.

## Domain contracts

Core desk/offering contracts are implemented in `lib/desk/*`; the broader publication, account, evaluation and future integration contracts below remain target boundaries. They do not authorize a network migration or production execution. Product semantics live in [Product Direction](PRODUCT.md); sequence and unresolved choices live in [Operations](OPERATIONS.md).

| Domain | Minimum contract | Boundary |
|---|---|---|
| Broker identity | Stable ID, AI identity disclosure, voice/editorial profile, historical-inspiration provenance. | Independent of network, vendor voice ID, publication, and execution credentials. |
| Desk mandate | Broker ID, supported networks/venues/instruments, eligibility, capabilities, risk policy, operational status. | Server-enforced permissions outside the prompt. Planned coverage is not availability. |
| Product offering | Product ID, instrument ID, mandate ID, issuer, rail, venue, quote asset, units, eligible desk IDs, quote/active status. | Comparable exposures are not interchangeable. Desk selection must come from declared coverage. |
| Instrument catalog | Canonical product ID, underlying security where relevant, issuer, network, contract/mint or venue ID, decimals/units, rights/restrictions, quote currency, allowlisted venue pairs, availability state, `lastVerifiedAt`. | Resolve before pricing. Tickers are display/search aliases, not unique execution identifiers. See [Instrument and pair integrity](#instrument-and-pair-integrity). |
| Market observation | Instrument ID, underlying/product distinction, source/venue, value and units, as-of/received timestamps, market session, delay/staleness and licensing metadata. | Informational, not a promise of fill. Web research cannot supply an executable quote. |
| Quote and instruction | Quote ID, exact instrument/venue/network/account, side/size, bounded or estimated consideration, applicable fees/slippage, expiry, simulation/live mode, approval binding. | Changes/expiry invalidate the relevant approval. Venue-specific revalidation and idempotency are prerequisites to submission. |
| Publication edition | Publication/edition IDs, broker byline, title/thesis, body and structured claims, sources/data cutoff, publish time, review record, instrument/theme references, revision/status links. | Public/shared record with durable versions, not a personalized mutable chat message. |
| Private client work | Owner/access scope, edition/passage and instrument references, saved notes/questions, conversation references, consent/retention/deletion metadata. | Tenant isolation; private material cannot enter a public edition through retrieval or generation. |
| Desk preferences/context | Explicit follows/watchlist/pins/dismissals, density/mode preferences, permitted history, provenance and retention; reason codes for suggestions. | No inferred holdings, risk tolerance, or wallet permission. User controls and deletion propagate to derived state. |
| Outcome and evaluation records | Instruction/transaction result or simulation assumptions; separate publication evaluation horizon/benchmark/method; source/version references. | A published thesis, paper record, transaction result, performance evaluation, and call-payment receipt are different evidence. |

Separate adapters for market data, instrument resolution, execution, client accounts, and call billing. Base/Solana/Robinhood Chain access is not implemented by replacing a global chain constant. Quote/mark resolution now goes through desk runtime coverage and concrete offering context; execution adapters remain rail-specific. Base and Robinhood Chain use EVM transaction tooling; Solana requires its own signing/execution adapter. A publication can discuss an instrument outside current execution coverage if that limitation is explicit.

### Primary trade lifecycle

```
Client intent (direct voice/input, or explicit action from supporting research)
        ↓
Resolve exact offering + eligible desk + account/rail + side/size
        ↓
Obtain venue quote → validate units, costs, limits, route, and expiry
        ↓
Client reviews and authorizes exact terms
        ↓
Pre-submit validation/simulation → submit once through execution adapter
        ↓
Track venue/order and chain states → reconcile fill, fees, and position
```

The same core contract supports clearly separated paper, testnet, and approved live modes. Publication IDs are optional context, not required fields for direct trading. Human editorial review gates publication only, not each otherwise valid user-authorized trade. User consent and automated product/access/risk checks govern trading.

Persist a stable intent/order identifier and binding to quote, account, desk, mandate, offering, instrument, rail, venue, side, size, and authorization. Reconcile ambiguous submission results before retry; a client/network timeout does not prove the trade failed. Distinguish allowance approval from swap execution, an order acknowledgement from a fill, and chain inclusion from the finality level selected for that operation. Handle rejection, reversion, expiry, partial fills where supported, and unknown outcomes explicitly. The call-payment receipt is not the trade receipt.

### Instrument and pair integrity

Public markets include thin and unfamiliar pairings. Neither low liquidity nor a meme pairing proves fraud. Integrity comes from issuer-authenticated identity, verified routes, and size-specific checks. The following five layers are target requirements; the implemented paper subset is described below.

1. **Canonical instrument registry.** Keyed by contract address, seeded from the issuer's official list. `B20Created` events discover candidates only; they do not establish Coinbase issuance or authorize catalog admission. Reviewed issuer evidence is required before adding an instrument. Each record carries contract address, symbol, decimals, current multiplier, underlying ticker, reference-feed address, issuer, and status (`listed`/`suspended`/`delisted`). A query for "NVIDIA" resolves to the canonical `NVDAc` address or returns "not on this desk"; no lookup path can land on a lookalike token.
2. **Venue-pair allowlist.** Per instrument, store the specific verified pool/route addresses (e.g. the primary `NVDAc/USDC` pool). Quotes are only requested against allowlisted pairs; aggregator responses are re-verified to touch only allowlisted venues and tokens before display.
3. **Objective admission thresholds.** A pair qualifies only when it clears mechanical bars: both tokens resolve to canonical addresses (the `0xb200…` B20 prefix is a sanity check, not a proof), verified token and pool provenance, executable depth and bounded output at the intended size, applicable account policy/pause checks, and a validated submission route. TVL and volume are supporting signals, not proof of safety. Reference comparisons require fresh, unpaused, unit-consistent data and market-session awareness; never use a frozen feed as an unconditional price gate.
4. **Explicit availability states.** `tradable`, `insufficient liquidity`, `verification pending`, `not available on this desk`. An uncovered instrument is a first-class answer ("outside my desk's coverage"), which is also the designed handoff trigger.
5. **Continuous re-verification.** Allowlist entries carry `lastVerifiedAt`; a pair that falls below threshold degrades to `insufficient liquidity` rather than silently quoting a stale market. Issuer pauses, blocklist events, and multiplier changes are monitored and reflected in availability.

The net rule: a client can never reach a pool that is not on the verified list, and coverage is an explicit, explainable boundary rather than an accident of search results.

## Robinhood Chain integration baseline

**Source review: 2026-09-05.** The user confirmed Robinhood Chain, not Robinhood's brokerage-account API. The facts below come from the official Robinhood Chain documentation; no RPC, REST trading flow, liquidity, eligibility service, or contract was exercised as part of this review. Recheck live parameters before implementation or release.

| Topic | Documented baseline | Claflin implication |
|---|---|---|
| Network | Live permissionless EVM-compatible L2 built on Arbitrum Dedicated Blockchains; mainnet chain ID `4663`, testnet `46630`, ETH gas. | Tennie's execution adapter targets a distinct chain, not Arbitrum One. Use explicit environment/account/network validation; no global constant substitution. |
| Infrastructure | Provider RPC/WebSocket endpoints recommended for production; public endpoints rate-limited. ERC-4337 support documented. | Select and verify RPC/account infrastructure. Network support does not mean Claflin already has working sponsorship, session keys, or trading. |
| Product rights and eligibility | ERC-20 tokenised debt securities issued by Robinhood Assets (Jersey) Limited, economic exposure without legal/beneficial rights in the underlying issuer. U.S.-person and other jurisdiction restrictions listed. | Identify the actual product and enforce applicable access policy; do not label tokens as direct stock ownership. Verify current prospectus/final terms for selected products and users. |
| Token units | 18 decimals and ERC-8056 `uiMultiplier()` for corporate-action/share-equivalent adjustment; raw balances do not rebase. Pending multiplier values/effective times documented. | Preserve raw transaction units and explicit token/share-equivalent display units. Read multiplier state consistently; a displayed share-equivalent amount is not evidence of underlying share ownership. |
| Informational APIs | Read-only `/assets`, `/prices`, and `/corporate-actions` under `https://api.robinhood.com/rhj/`, with caching and rate limits. REST prices are underlying-equity bid/ask, not multiplier-adjusted. Deployments are per chain. | Data inputs, not an order-placement API. Resolve deployment and product identity; unknown underlying capability is not positive execution eligibility. Apply current cache/freshness semantics. |
| Onchain valuation | Chainlink prices are per-token and already multiplier-adjusted. Stock feeds update 24/5. | Do not multiply the feed price again. Keep underlying reference, token valuation, and executable venue quote distinct. Read feed decimals/heartbeat and timestamps, not assumed constants. |
| Price availability | Staleness/answer checks required; sequencer uptime/grace-period checks recommended; `oraclePaused()` is advisory during corporate actions. | Treat paused/untrusted prices as unavailable, not zero. Continue freshness checks even when the pause flag is false. A 24/7 chain does not guarantee fresh stock feeds or executable liquidity. |
| Trading | RFQ trading at launch; RFQ aggregators, AMM/propAMM, and orderbook venues listed. Direct issuer mint/burn is limited to authorized participants with KYB. | Choose and verify a secondary-market venue with actual supported pairs, access, liquidity, quote and submission interfaces. Do not assume issuer access or guaranteed liquidity. |
| Settlement | Sequencer soft confirmation, posting to Ethereum, and Ethereum finality are distinct; canonical withdrawal delay is separate. | Expose the operation's selected confirmation/finality level. A fast receipt is not blanket final settlement, and bridging is a separate consented flow. |

For price/position math, distinguish human token units (`rawBalance / 10^18`), the share-equivalent ratio (`uiMultiplier / 10^18`), underlying-equity price, and the feed-scaled per-token price. Convert once in the appropriate direction using precise decimal/integer arithmetic. Corporate-action timing, stale cached REST metadata, and raw-versus-UI units need regression fixtures before funds are at risk. A valuation is never substituted for a size-specific executable quote.

The network choice is settled; integration choices remain: selected products and eligibility policy, secondary-market venue and access, account/gas setup, data-feed mappings/freshness rules, and end-to-end execution verification. The docs' ecosystem list is not an endorsement or a claim that Claflin is affiliated with Robinhood.

## Coinbase Tokenized Stocks on Base integration baseline

**Source review: 2026-09-05.** Hetty's first mandate. Facts below come from the official Base integration guide, the Base stocks page, and dated press coverage; no RPC call, venue quote, or transaction was exercised as part of this review. Recheck live parameters before implementation or release.

| Topic | Documented baseline | Claflin implication |
|---|---|---|
| Product and issuer | Coinbase Tokenized Stocks: B20 tokens on Base issued by Coinbase under Regulation S, each a beneficial claim on a share held 1:1 at Alpaca in a bankruptcy-remote, ADGM-supervised structure. Eligible non-US users only; cash dividends convert to additional share exposure via the multiplier. | Third-party-issued equity exposure with issuer-controlled compliance powers—not direct exchange-listed stock ownership. Present rights honestly; verify the current prospectus per token before quoting. |
| Catalog | 13 token contracts on Base mainnet (AAPLc, AMZNc, COINc, CRCLc, GOOGLc, INTCc, METAc, MSFTc, MSTRc, NVDAc, SNDKc, SPCXc, TSLAc; addresses in the official guide). Deployed ≠ liquid: ~4 live at 2026-08-24 launch, ~10 by early September. Match contract addresses before buying. | The instrument catalog stores the exact contract address, not the ticker. Gate the tradable list on verified circulating liquidity. Discover new listings via the `B20Created` event. |
| Token mechanics | B20 is an ERC-20-extending **precompile** in Base's Beryl upgrade; every token shares one audited implementation. Asset variant supports configurable decimals and a WAD-scaled (1e18) multiplier. | `forge` cannot simulate B20 precompiles—testing needs `base-anvil`/tooling that registers them. Verify decimals per token rather than assuming 18. |
| Corporate actions | `multiplier` adjusts redemption ratio. Scheduled updates via ERC-8056 `updateUIMultiplier`; helpers `scaledBalanceOf`, `toScaledBalance`, `toRawBalance`. `Announcement`/`EndAnnouncement` events flag actions; admin ops have no built-in timelock. | 1 token ≠ 1 share permanently. All display/position math applies the current multiplier; index `Announcement` and `MultiplierUpdated` events. |
| Transfer policies and pauses | Onchain policy scopes can revert transfers; `isAuthorized(policyID, account)` checks authorization. **Standard `approve()` is not policy-gated.** Per-function pauses exist. | Pre-flight every trade with policy/pause checks, not just allowance. A blocked transfer surfaces at execution, not approval—a distinct failure mode to handle. |
| Compliance boundary | Secondary-market holding and trading are **permissionless onchain**; KYC applies only to AP mint/redeem. The issuer can block sanctioned/prohibited-jurisdiction addresses. | The chain will not enforce "eligible non-US" for Claflin—eligibility screening is our product's responsibility. Define and document this policy explicitly. |
| Reference price | `Token Price = Underlying Equity Price × Multiplier`. Chainlink feeds on Base report **total-return** values (8 decimals), run 24/5, hold last close on weekends/holidays, and freeze during corporate actions. | The oracle is a valuation/reference input, not an executable quote. Enforce `updatedAt` staleness bounds and paused-feed handling; never settle against a frozen feed. |
| Market price and venues | B20s trade 24/7; spot liquidity concentrates on Aerodrome; routing via 0x, 1inch, CoW Swap, Matcha, KyberSwap, Definitive, Fusion; Aave/Morpho/Euler for lending. The DEX price does not feed the Chainlink oracle, so DEX and reference prices can diverge. | Show underlying reference, token market price, and the executable quote as distinct values. Weekend/after-hours divergence is expected, not an error—label it. Select and verify the execution venue before the demo. |

The mandate is settled. Paper estimates use a single approved Aerodrome route with spend-in-USDC (buy) and token-quantity (sell). Eligibility policy for a later live tier is Coinbase Verifications; the check is source-only and not a paper-desk surface. Remaining live-release choices are the execution venue/adapter, funding model, and product-access review. The ecosystem listing is not an endorsement, and Coinbase's issuance does not imply any Claflin affiliation.

### Venue strategy: aggregator and direct venue behind one adapter

Design for multiple route types behind the same quote-bound ticket contract; the client sees terms, not plumbing.

| Route | How it works | Strengths | Constraints for Claflin |
|---|---|---|---|
| Aggregator (0x Swap API) | REST prices and quote preparation. | Potential route aggregation and reusable integration. | One USDC→NVDAc request returned `BUY_TOKEN_NOT_AUTHORIZED_FOR_TRADE`. Scope of restrictions requires provider clarification. |
| Direct Aerodrome | Read-only `MixedRouteQuoterV3` call with the configured CL-factory mask. | Supports the current Base paper-estimate slice without an aggregator API. | Quoting does not verify signing, account eligibility, router compatibility, fees/gas or execution. |

**Evidence correction, 2026-09-05:** the 0x result applies to the tested request. Odos returned an infrastructure error (`1033`), not a token-policy response. These results do not establish a universal aggregator ban, or anything about Tennie's future routing. A successful pool-state read is not execution evidence.

Current implementation uses a single approved Aerodrome route for paper estimates and the gated Base live path. Additional eligible venues may be added after independent verification. Route preferences must never silently change a reviewed instruction; compare costs and measured performance rather than assume direct routing is fastest.

**Verification snapshot, 2026-09-05** (DEX Screener token-pair data; 0x API test; onchain `eth_call`):

- DEX Screener reported approximately $2.6M NVDAc/USDC liquidity, $1.4M AAPLc/USDC, $1.1M METAc/USDC and $1.6M GOOGLc/USDC on Aerodrome. TSLAc/USDC was approximately $133k. These are historical third-party observations, not present executable depth.
- Thin and unfamiliar pairings were observed; no fraud assessment was performed.
- NVDAc pool state and later V3 quoter calls returned data. The updated `/desk` API was exercised read-only against Base and returned 0.43369173 NVDAc for 100 USDC at block 50908265. No wallet signature, approval or swap was performed.

### Implemented paper desk slice

- `/` is the canonical front door; `/desk` redirects to it. `lib/house-entry.ts` decides between the foyer and a desk, validates `?desk=`/`?offering=`, restores only an open remembered desk, and removes incompatible offering parameters. `HouseFoyer.tsx` and `HouseOfferings.tsx` own instruction-led offering comparison; `WorkingDesk.tsx` mounts the selected desk's working surface. `/desk-study` is a development-only reference. Hierarchy lives in [Product Direction](PRODUCT.md).
- `useTradingDesk.ts` carries `entryOfferingId`, validates it against the selected desk, hydrates desk-specific draft context, coordinates requests, review, local records and watched marks. `TradeTicket` is the live document; `PaperLedger` is the filed home; `DeskBoard` is the watch tray only. A selected offering may preselect an instrument but never an amount, side, or authorization.
- `lib/trading/domain.ts` owns shared instruction/estimate unions registered by rail modules; `catalog.ts` and `tokenized-stocks.ts` expose Base instruments; `lib/solana/catalog.ts` exposes Solana instruments; `lib/robinhood/catalog.ts` exposes Robinhood Chain instruments; `lib/meteora/catalog.ts` exposes Halley's verified quote-mint set (USDC plus badged AAPLx/NVDAx/TSLAx) and the DBC/DAMM v2 program constants; `lib/desk/offerings.ts` binds them to product/offering eligibility. `quotes.ts` is the Base injected-reader service with mandate-owned per-desk limits; `aerodrome.ts` is read-only RPC integration; `http.ts` supplies a thin request boundary. Venue adapters register in `lib/trading/adapters.ts` (`QuoteAdapter`: `venue`, `quote`; `MarkAdapter`: `source`, `market`, `read`; `ExecutionAdapter` is the shared execution port type) — Aerodrome/Lighter/Jupiter quotes and Chainlink/Jupiter/Robinhood marks are the active entries; planned desks refuse with `desk_unavailable`. Jesse's mark adapter derives its observed marks from the venue-duplex read (Jupiter venue USD, with the comparable issuer/stock reference carried as `stockReference`) and is never labelled Pyth. Tennie's quote adapter walks the Lighter orderbook in USDG; her marks read the onchain Chainlink feed beside the issuer's rhj stock reference, and the three-way tape is filed into each paper record. Desk-aware routes `GET /api/desk/[deskId]/quote|marks` resolve venue per desk/coverage with per-desk budgets and caches; legacy `/api/stocks/*` delegate to Hetty's adapters.
- `GET /api/stocks/quote` accepts only `instrumentId`, `side`, `amount`, `unit`. Buy uses USDC spend; sell uses token quantity. Decimal strings convert directly to integers. Legacy `sizeUsd` requests are rejected. The desk-aware `GET /api/desk/[deskId]/quote` takes the same instruction shape and resolves the adapter through concrete offering coverage.
- Base estimates recheck chain, factory, quoter factory, resolved pool, token order, tick spacing, decimals, positive liquidity/output and multiplier at one recent block. Solana estimates preserve mint identity, decimal/base-unit amounts, Jupiter route evidence and expiry. Static `quote_candidate`/catalog status only enables an attempted read. Historical TVL is not an authorization gate.
- Results are `kind: estimate`, `mode: paper`, `liveExecutionEnabled: false`, with rail/product identity, evidence timestamps, raw amounts and review-window expiry. Fresh responses carry desk/mandate/offering/instrument context through `withEstimateContext`; rail and venue remain explicit in the underlying evidence. There is no execution payload or reserved price. No reference-price comparison is called price impact.
- Optional Chainlink observations reject invalid/future data and label age over 24 hours stale. Solana comparison evidence uses issuer/Jupiter/PreStocks/Pyth sources only as configured and stays honest-unavailable when a source is not entitled. Marks are not used to authorize trades.
- Request handling returns sanitized errors and no-store responses, limits concurrent requests to two and attempts to 60/minute per process. This is bounded demo protection, not distributed production abuse control. Public RPC/provider reliability and data-display rights remain release considerations.
- `workflow.ts` binds manual edits and client-tool instructions to one draft, invalidating old reviews and late responses. Hetty's tools (`choose_instrument`, `set_instruction`, `set_amount`, `request_estimate`, `describe_desk`, `record_paper`, `cancel_instruction`, `watch_mark`, `share_desk_note`, `explain_concept`, plus the scene-drive set `move_to`, `walk_room`, `show_premium`, `highlight_mark` — camera, walk, readout and lamp only, never signing) execute in the caller's browser; Jesse's controller owns its own tools and state; Tennie's tools (`lib/robinhood/voice-tools.ts` + `desk-tools.ts`) drive `useTennieDesk` the same way — her catalog is the 24 verified rhj symbols, buys are USDG spends and sells are token units, and `record_paper` files only from an active review. Halley's tools (`lib/meteora/voice-tools.ts` + `desk-tools.ts`) drive `useHalleyDesk` — `name_launch`, `choose_quote`, `choose_anchor`, `choose_curve`, `set_supply`, `set_graduation`, `request_launch_estimate`, `file_paper_launch` plus record/describe/explain tools; a launch intent is deliberately *not* in the shared trade unions (no `side`/`instrumentId`/`amount`), so no shared execution path can ever route it. Voice may draft, estimate and file paper only under explicit confirmation; no signing, submission or account authority is reachable by voice.
- `paper-records.ts` stores versioned, schema-validated local Base records only after review and successful storage, using quote IDs for duplicate prevention. `lib/solana/paper.ts` stores Jesse's v2 local records separately; `lib/robinhood/paper.ts` stores Tennie's under `claflin.paper.v2.tennie.*`; `lib/meteora/paper.ts` stores Halley's launch records under `claflin.paper.v2.halley.*` — same namespace discipline throughout. Records preserve estimate and simulation assumptions, survive reload, and can be reused as new drafts or explicitly deleted. Storage errors block success; corrupt history is not overwritten. Records are visible to anyone using the browser profile and are not positions or call receipts. When an optional account is signed in, `usePaperSync` copies Base records to Redis (`/api/paper`); local storage stays authoritative; deletes are not propagated.

### Honest speech: restating only what was observed

Voice input is a guessy channel feeding a binding downstream (quotes, filings). Every confirmation the desk speaks — ticket lines, readbacks, seals, descriptions — must be true of what the current input contributed, or it becomes fabrication with furniture. This section is the implementation companion to [Product Direction principle 10](PRODUCT.md).

1. **Restate, don't complete.** A confirmation line names only what this input established. Fields carried over from a previous draft are either dropped (amount: `parsedIntent.amount ?? ''`) or explicitly labelled as carried ("keeping GOOGLc from before"). `?? state.draft.X` inside a confirmation path is a fabrication smell — the one legitimate use is a deliberate refinement flow, and then the copy must say so.
2. **Attribute voice truthfully.** A line prefixed with a speaker's name must have been spoken by that voice. Ticket-computed confirmations render unattributed ("On the ticket:"), never under `data-voice="hetty"`. `dictationSpokenReadback` exists only for the live-call path; nothing on the no-call dictation path may call it.
3. **Certainty is computed or omitted.** No unconditional certainty constants: `confidence` is the provider's score or `null`; `disfluencyFiltered`/`cleanedUp` derive from whether a rewrite actually arrived (`llm_response` non-empty). Error messages carry interpolated values (`status ${response.status}`), never hardcoded ones.
4. **Failures fail loudly.** A missing credential or provider outage returns an error status (503), never `ok: true` with invented content. The dev mock path must not be reachable in production.
5. **Seals point, they don't preen.** A provenance marker binds `{ what was heard, provider session id, timestamp }` and says so in plain words. Words like "cryptographic" and "tamper-evident" are earned only by properties actually implemented (keyed hash or provider-session binding) — otherwise the marker is a *hearing receipt*, named as one.
6. **Tests assert absence, not just presence.** For every confirmation line: assert the unheard value does not appear (`assert.doesNotMatch(line, /\d/)` for a missing amount), assert no status code leaks into user copy, assert provider-session binding when claimed.
- The simulated fill equals quoted output including venue fees modeled by the adapter; additional slippage, gas, platform and call charges are zero unless the estimate evidence says otherwise. Account balance, holdings and eligibility are not verified on the paper path. A read-only Coinbase Verifications check exists at `/api/eligibility` for a later authority tier and is not shown on the paper desk. Wallet binding, transaction preparation, signing, submission and reconciliation are implemented behind desk-specific live gates; release acceptance, funding, product access and user authorization remain separate.

## Supporting publication-to-conversation flow

This is an optional entry into trade discovery/preparation, not a prerequisite for the primary trade lifecycle. A direct trading request must work without a publication record or an editorial service dependency.

```
Permitted sources → normalized evidence and exact instrument references
        ↓
Draft thesis + counterarguments + invalidation conditions
        ↓
Human editorial review → explicit publish action → versioned edition
        ↓
Eligible desk suggestions / client saves / reading view
        ↓
Explicit "Discuss this thesis" + call terms + microphone consent
        ↓
Conversation grounded in selected edition/passage + separately labeled updates
        ↓
Private note / follow-up question / optional new instruction review
```

Publication jobs need idempotency and explicit states: draft, in review, published, superseded, withdrawn. Corrections create traceable revisions; delivery retries must not create duplicate editions or falsely claim a letter was issued. Begin with in-app publication. Email/push subscriptions and sending are separate opt-in delivery decisions, not implicit in "publishing house" or permission to write docs.

Preserve source timestamps and permitted excerpts/snapshots for reproducibility, respecting source licenses and redistribution rights. Distinguish event time, retrieval time, and publication time. Treat retrieved news, letters, and user-selected passages as untrusted evidence, never instructions that expand tools or bypass approval. Publication grounding must honor access controls and cannot retrieve another client's notes.

Pass publication ID, edition ID, passage reference, and question through call launch and session records; do not rely on a regenerated summary to reconstruct the edition. Warn when an edition is corrected/withdrawn and distinguish its historical thesis from current data. A publication disclaimer does not replace truthful capability, approval, or data-source behavior.

## Supporting adaptive desk resolution

Keep direct instrument/intent entry and verified order/position context available independently of ranking. Resolve permitted client context and eligible content, then apply transparent ordering: active trade task and explicit pins, followed/saved work and unresolved decisions, then relevant house commentary. Emit stable surface IDs and a human-readable reason for each suggestion. Start with deterministic rules and explicit preferences; evaluate more complex ranking only against demonstrated benefit.

Public editions may be shared/cached by edition and access scope. Private views, holdings, notes, and derived context must be scoped to the correct client and never leak through shared caches. Define freshness, expiry, consent version, and invalidation behavior before implementing memory. Deletion/opt-out must invalidate derived suggestions as well as the original source records.

Keep a snapshot of the active reading/conversation/confirmation context stable while background data changes. Show new-data/correction notices without replacing the selected edition, changing a ticket, or moving focused controls. An expired executable quote blocks submission even if the rest of the desk remains visible. No history or ranking result grants authority to start a call, access an account, bridge funds, or place an order.

A thematic scenario carries thesis/edition references and an explicit set of instrument mappings, weights/exposures if used, assumptions, and risks. It is not an executable basket. Any eventual basket feature needs separate per-leg and partial-failure semantics, fresh quotes, and client authorization; it is outside the initial scope.

## Retired marketplace implementation reference

**Archive. Not the current product. Not setup instructions.** Public marketplace routes return 410 and the associated client/admin pages are retired. Do not call `GET /api/agents`, seed brokers, or configure ERC-8004 as if they were live product steps. Identity, payment and webhook code below is retained technical scaffolding, not a live trading release. Current desk routes include `/api/desk/[deskId]/quote`, `/api/desk/[deskId]/marks`, `/api/desk/jesse/session`, `/api/hetty/session`, `/api/hetty/transcript`, `/api/paper`, `/api/eligibility`, plus legacy `/api/stocks/*` delegations.

The retired flow: developer registration via `POST /api/agents { register: true }` stored in Redis as `status="pending"`; admin review via `PATCH /api/agents/:id { action: "approve" | "reject" }`; calls through the `<elevenlabs-convai>` widget engine driven by `useWidgetConversation` (shadow-DOM button + signed URLs via `/api/webrtc/signal`); provider events/tool callbacks to `POST /api/webhooks/elevenlabs`. The retained `Agent` record in Redis carries `id`, `name`, `description`, `category`, `rate` (per-minute USDC), `avatar`, `active`, `status`, `elevenlabs_agent_id`, `wallet_address` (developer earnings destination), `erc8004_id`, `totalCalls`, `rating`, `online`.

### ERC-8004 on-chain identity

Each agent can have an on-chain identity via ERC-8004 contracts on Arbitrum. The contracts must be deployed first, then configured via environment variables:

| Registry | Env Variable | Purpose |
|---|---|---|
| Identity | `NEXT_PUBLIC_ERC8004_IDENTITY_ADDRESS` | Agent identity NFT |
| Reputation | `NEXT_PUBLIC_ERC8004_REPUTATION_ADDRESS` | Call count, ratings |
| Delegation | `NEXT_PUBLIC_ERC8004_DELEGATION_ADDRESS` | Agent-to-agent delegation |

Enable via env: `NEXT_PUBLIC_ERC8004_ENABLED=true` plus the three addresses above. The ERC-8004 contracts ARE deployed on Arbitrum Sepolia (chain 421614); the addresses in `.env.local.example` point at those deployed instances. The Identity and Reputation contracts are ERC-8004 reference deployments; the Delegation Registry is this project's `DelegationRegistry.sol` (in `contracts/`, with the Hardhat config that shipped with the original deploy).

### Payment flow

Call payment is separate from research and paper-instruction recording. The intended client contract below must be verified across entry points; the launch/cap mismatch is tracked in the roadmap.

```
Client reviews eligible trial terms OR paid rate and actual enforced cap
        │
        ├─► Eligible trial: no wallet required, two-minute limit, no payment
        │
        └─► Paid call: wallet connected, explicit microphone consent
                    │
                    ▼
            Voice session + metered usage bounded by the reviewed cap
                    │
                    ▼
            Call ends → client approves exact USDC call charge
                    │
                    ▼
            Settlement path → verified result or pending/error state
                    │
                    ├─► On-chain transfer and transaction evidence
                    └─► Revenue split ledger for broker payout accounting
```

The implementation uses USDC on Arbitrum with a 1Shot relayer integration. See `lib/useRealPayment.ts`, `lib/payment-settlement.ts`, and `app/api/payments/settle/route.ts` for the active approval and settlement paths. Do not infer a completed transfer from this diagram or from a call ending.

The documented settlement model transfers USDC to the platform wallet and ledgers the 80/20 split in Redis for broker payout accounting; it is NOT an atomic on-chain dual transfer. An atomic split requires a separate contract decision and verification, conditional on operational need. The broker's earnings destination comes from the `wallet_address` field in Redis. Per-call earnings breakdown is available via `/api/agents/earnings`, which reads the `split-payment:{callId}` ledger entries and enriches them with settlement tx hashes.

### Redis data structure

```
agent:<id>          → JSON Agent object
agents:list         → sorted set of agent IDs
call:<id>           → JSON call record
calls:agent:<id>    → list of call IDs for an agent
user:<address>      → JSON user profile
```

Agent-to-agent delegation is a deferred option, not a committed next phase. The existence of a delegation contract does not establish a working multi-agent client journey. Add a specialist handoff only for demonstrated client need, with explicit permissions, preserved context, and accountable outcomes.

## Error resilience

How Claflin prevents — and gracefully survives — API failures such as a cross-origin request dying with `net::ERR_FAILED` because a restart or 502 response carried no CORS headers: the browser then masks the real outage as a CORS error and the UI can only show a dead-end "Failed to fetch".

### The three layers

1. **Same-origin proxy (eliminates the failure class).** `API_PROXY_TARGET` is set on Vercel only. `next.config.js` adds a `beforeFiles` rewrite so the browser calls its **own origin** at `/api/*` and the Next.js server forwards server-to-server. No browser CORS, no preflight round-trips, first-party cookies, and ad-blockers stop flagging API calls. Vercel: `API_PROXY_TARGET=https://api.claflin.trustfall.xyz` (and unset the legacy `NEXT_PUBLIC_API_URL`). Hetzner / local dev: leave it unset — local route handlers serve directly.
2. **Central CORS proxy (`proxy.ts`, Next.js 16 convention).** For direct cross-origin hits (embedded widgets, SDK consumers): every `OPTIONS /api/*` preflight is answered at the edge with `204` + reflected `Access-Control-Allow-Origin` + `Max-Age: 86400` — even when the backend is down, so outages are never *misreported* as CORS errors. Every API response gets CORS headers stamped centrally, so routes can't forget. No `Access-Control-Allow-Credentials`: auth is wallet-signature based, no cookies. Reflecting any Origin is therefore safe; set `CORS_ALLOWED_ORIGINS` to restrict.
3. **Resilient client (`lib/api-client.ts`).** `apiFetch()` — bounded request deadline covering fetch, body parsing and retry waits, jittered exponential backoff honoring `Retry-After` on 429s, retries **only** idempotent GET/HEAD (never replay a POST/payment), and a `fetchJson()` wrapper that resolves instead of throwing for desk call sites. `ApiError` — typed `kind` (`offline | network | timeout | http | parse`) + `friendlyMessage` in the Claflin broker-desk voice. Raw "Failed to fetch" and JSON-parse errors never reach the UI — non-JSON responses are refused before parsing. The retired era's `lib/useSWR.ts` is no longer present; the tape and quote fetches use `fetchJson()` directly and keep their own last-known-good state.

### Voice line lifecycle (`components/desk/HettyCall.tsx`)

The ElevenLabs provider's `startSession` silently no-ops while a conversation or connection-lock ref is still held, and a backgrounded or frozen tab can kill the socket without events — a stale line then refuses every future ring with no error surfaced. The line therefore owns its own lifecycle:

- **Fresh provider per session.** The outer `HettyCall` shell holds a session key and remounts the `ConversationProvider` after every terminal event, so the next ring always starts with clean refs. Closing notes and errors are held by the shell and passed back in as props, so they survive the remount.
- **One terminal funnel.** `onDisconnect`, `onError`, the dial watchdog, user cancel and the page-lifecycle handlers all converge on exactly one of `onSessionEnded` / `onSessionFailed`; a per-mount guard ensures only the first terminal event decides how the session is reported (an error and a disconnect often arrive together).
- **One guarded `hangUp()`.** Mute first, then `endSession`, only while connected or connecting. Mic chunks already in flight during a close can still throw the SDK's "WebSocket is already in CLOSING or CLOSED state" console error — `@elevenlabs/client`'s `sendMessage` has no readyState guard (verified through 1.25.0). Muting shrinks the window; the remaining logs are benign teardown noise.
- **Bounded dialling.** A 20s watchdog ends any ring that never connects and returns the desk to ringable — "Connecting…" is never a dead end.
- **Deliberate hangup on the way out.** `visibilitychange` → hidden, `pagehide`, and bfcache restores (`pageshow` with `persisted`) end the call honestly instead of leaving a zombie line. Continuity is carried by the ticket: the next ring's opening line is rebuilt from the draft on the paper.
- **End call is confirmed.** If no disconnect event returns within 2s of End call (silently dead socket), the closing note is landed locally.

### Cross-carrier failover (Jesse only)

The lifecycle above is per-carrier. Jesse's desk mounts one of two call panels — ElevenLabs ConvAI (`JesseCall`) or AssemblyAI Voice Agent (`JesseCallAssemblyAI`) — and the desk surface adds one more recovery layer on **unpinned** visits: when a carrier cannot open the line at establishment (session endpoint error, dial stall, transport failure), the desk marks that provider down, re-arms `requestRingOnArrival`, and swaps to the other carrier, which lifts the receiver on mount. Bounds: one hop per provider per visit, never mid-call (call state lives inside the provider session), never on mic denial (a client-side refusal both carriers meet identically), and never when `?line=` pins the provider — a demo link keeps its honest error rather than silently changing carriers.

### Client recovery requirements and presentation

[Product Direction](PRODUCT.md) owns the target experience. Recovery should preserve the client's work, state what did and did not happen, and offer a safe next action. Automatic retries concern read-only data availability only; they do not authorize restarting a microphone session, replaying a paper instruction, or retrying a payment. Delayed transcripts, unsaved instructions, and unsettled call receipts must remain distinct, truthful states. Retaining stale data is not evidence that it is current.

| Situation | Current presentation |
|---|---|
| First load | Skeleton rows; after 4s, "Warming up the broker desk…" |
| Cold-start failure (no cache) | `ConnectionError`: desk bell mascot, friendly headline, "Ring again" button, visible auto-redial countdown (5s→10s→20s→30s), instant retry on `online` event |
| Failure with stale data | Broker desk stays on screen + `ReconnectingBanner` ("showing the last known lines") |
| Offline | Offline copy + automatic redial the moment connectivity returns |
| Broker page network failure | Retryable `ConnectionError` — never a false "Broker not found" |
| Page crash | `app/error.tsx`: on-theme "The line went dead" with desk bell + digest ref |

Accessibility: the failure headline/message is announced once via `role="alert"`; the per-second countdown is `aria-hidden` (screen readers get a static "we keep redialing" note instead of being spammed).

Previously recorded verification (revalidated 2026-09-09; see [Release validation](RELEASE_VALIDATION.md) for current gates): `tests/api-client.test.ts` — 18 tests for classification, retry, backoff, parse refusal — passing. `proxy.ts` answers unknown `/api/*` paths with a JSON 404 (`error: not_found`, `no-store`) instead of the HTML 404 page, so clients can never parse `"<!DOCTYPE"` as JSON. `GET /api/stocks/marks` serves the last-known-good tape stale (up to 30 minutes, `X-Marks-Stale: true`) when the RPC refresh fails, instead of an immediate 503. API responses still carry centrally-stamped CORS headers via `proxy.ts` (`applyCorsHeaders`); retired-marketplace 410s unchanged.

## Legacy voice widget (retained)

**Archive for the old widget path. Not the live Hetty session.**

**Updated:** 2026-09-08. The desk voice path is `components/desk/HettyCall.tsx` plus `POST /api/hetty/session` (ConvAI signed URL, client tools against the paper draft). The historical `<elevenlabs-convai>` widget, `WidgetEngine`, and `/api/webhooks/elevenlabs` are retained source, not mounted by the root layout and not how Hetty rings today. The notes below are dated evidence about that retained stack, not a guarantee of current provider behavior and not setup instructions for the paper desk. [Voice](VOICE.md) owns the live voice experience.

**Why a controlled widget.** The original May 2026 investigation reported negotiation timeouts through direct `Conversation.startSession()` use while the official `<elevenlabs-convai>` widget connected successfully in the probe. The implementation moved to a single controlled widget rather than a visible vendor widget or multiple competing voice sessions. The transport is supporting infrastructure; keep provider presets, agent IDs, and connection mechanics out of the primary client journey, while clearly identifying Hetty as AI and explaining microphone use.

**Implementation map (retained):**

| Layer | Source | Responsibility |
|---|---|---|
| Mounted voice engine | `components/WidgetEngine.tsx` | `WidgetEngineProvider` mounts one offscreen widget and exposes control through context. |
| Conversation lifecycle | `lib/useWidgetConversation.ts` | Starts/ends conversations, tracks connection/duration/cost, accepts budget/time limits, consumes transcript delivery. |
| Call launch | `app/page.tsx`, `lib/product-launch.ts`, `components/AgentPreviewSheet.tsx` | Selects broker and handles pre-call entry. |
| Visible conversation | `components/ActiveCall.tsx` | Call telemetry, controls, and transcript. |
| Session authorization | `app/api/webrtc/signal/route.ts` | Backend session/signed-URL path used by the conversation hook. |
| Tool and transcript delivery | `app/api/webhooks/elevenlabs/route.ts`, `app/api/transcripts/route.ts` | Provider callbacks and transcript delivery; not widget-native events. |
| Internal runtime probe | `app/widget-probe/page.tsx`, `components/WidgetProbe.tsx` | Inspect provider methods, shadow DOM, events, lifecycle. Not a client destination. |

Do not assume `display: none` preserves provider audio/lifecycle behavior; maintain a mounted, visually suppressed engine and verify its operation when changing visibility or control paths.

**Historical probe: 2026-05-13** (at `/widget-probe`): no usable imperative conversation methods on the host element (lifecycle callbacks only); open shadow root with one button and no inputs — clicking it toggled the conversation; no mute/volume methods or custom events observed; signed-URL mode worked with a backend-issued URL; rendered and responded off-viewport; transcript events not emitted by the widget, so webhook reconciliation is required. These findings explain the control adapters and fallback strategies; they must not be rewritten as broader capabilities without new evidence. `useWidgetConversation` contains a fetch-based SSE reader for `/api/transcripts?callId=...` — the webhook/API path, not an assumed widget event, supplies transcript material.

**Retained release-gate behavior requirements** (gates, not claims about current behavior): explicit consent before microphone activation with cancel/back leaving no capture or billable session; connecting/connected/failed/ended distinguished with reliable transport evidence; real verified mute/speaker/hang-up behavior; the reviewed cap and trial terms reaching the hook and enforced (`ActiveCall` historically chose its own five-minute paid cap and two-minute trial limit); no double-start, instruction replay, or payment duplication during retry/reconnection; ending voice, saving a work record, and settling call payment as separate surfaced outcomes; keyboard operation, clear status, and reduced-motion behavior. Verify voice changes with a dated record of browser/device, build, configuration mode, observed behavior, and remaining limitations, using the internal probe rather than assuming the historical contract still holds. Use `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` as appropriate to code changes; passing them does not replace runtime/provider verification.

## Security architecture reference (call billing)

**Retained call-billing reference. Not the paper desk and not live stock execution.** Call-payment receipts stay separate from paper records and from any future trade receipt.

**Payment security model.** All payments are **user-settled** — the server holds no private keys for payment transactions. The user signs EIP-712 typed data and the user's wallet (MetaMask Smart Accounts — the user controls keys) submits on-chain to Arbitrum. Properties: zero payment private keys on the server; user has full control over transaction timing and approval; platform cannot delay, freeze, or redirect funds; no single point of compromise for user funds.

**Server-side keys.** The server does hold one key:

| Key | Purpose | Risk |
|---|---|---|
| `FACILITATOR_PRIVATE_KEY` | Signs ERC-8004 identity minting transactions | Loss = inability to mint new agent identities; no user funds at risk |

**API security.** Admin endpoints (`PATCH /api/agents/:id`, `DELETE /api/agents/:id`) currently rely on network-level access control — add auth middleware before exposing publicly. The seed endpoint (`POST /api/agents/seed`) should be restricted to internal/admin use in production.

**Wallet connection.** MetaMask Smart Accounts Kit. The app never receives or stores private keys; all signing happens in the user's wallet extension or mobile app.

**Environment variables.** Sensitive values (`ELEVENLABS_API_KEY`, `FACILITATOR_PRIVATE_KEY`, `UPSTASH_REDIS_REST_TOKEN`) are: stored in `.env.local` on the VPS (not committed to git); read by PM2 via `ecosystem.config.js`, which loads `/opt/claflin/.env.hetzner` (also not committed); set as encrypted secrets in the Vercel dashboard. `.gitignore` excludes `.env`, `.env.local`, `.env.production`, and `.env.hetzner`. `ecosystem.config.js` IS committed because it contains only public server paths (`/opt/claflin/current/server.js`, PM2 log locations) and no secrets — each server can replace it locally if a different layout is needed.

## Removed

`STREAMING_INTEGRATION.md` recorded the removal of the Superfluid (CFAv1Forwarder / USDCx) + WDK (Tether Wallet Development Kit) streaming payment infrastructure — the earlier Celo-era experiments, deleted once the x402 path (USDC on Arbitrum with gasless 1Shot relayer settlement) was proven out: no callers in the active call flow, wrong chain, wrong payment model (per-second streaming vs non-custodial per-call settlement), and dead dependencies adding build warnings. `PaymentState.mode` in `useRealPayment.ts` is `'user_settled'` only. The removal detail lives in git history (the `chore: remove Superfluid + WDK dead code` series); do not revive streaming or subscriptions as a default next step.
