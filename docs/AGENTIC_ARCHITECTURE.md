# Claflin Architecture

## Scope and product ownership

This document describes supporting implementation, not the client's information architecture or the order in which features should be built. [Product Direction](PRODUCT_DIRECTION.md) owns the experience; [ROADMAP.md](../ROADMAP.md) owns open gaps and release gates. The primary capability is trade facilitation: resolve intent and access, quote, authorize, execute, and reconcile. Voice, research, publications, and adaptation support that execution path rather than gate it.

- **Clients** arrive directly at `/`, Hetty's desk, with no onboarding or marketplace prerequisite. The current release prepares estimates and stores local paper outcomes; it does not connect live calls or execute orders.
- **House identity** lives in `lib/house.ts`, independent of provider IDs and persisted marketplace records. Hetty/Base is first; the other desks are explicitly planned.
- **Marketplace flows are retired.** Old client pages redirect to `/`; public `/api/agents` and descendants, `/api/ratings`, and `/api/sdk/register` return 410 before any upstream proxy forwarding. No client layout initializes wallet, theme or voice providers.

The desk's live voice path is an ElevenLabs ConvAI session: `POST /api/hetty/session` mints a signed URL server-side, and Hetty's tool calls are client tools executing against the desk draft in the browser (see `components/desk/HettyCall.tsx` and `scripts/create-hetty-agent.mjs`). The historical `<elevenlabs-convai>` widget and the retained webhook orchestrator at `/api/webhooks/elevenlabs` are not part of this path — see [Voice Transport](WIDGET_ARCHITECTURE.md) for dated observations.

## Client-work boundaries to implement and verify

Keep public publication editions, source/price snapshots, private research notes, transcripts, proposed/recorded instructions, and call-payment receipts distinct. A published opinion is not a client instruction; relevance is not suitability; a conversational promise is not persistence; a call charge is not an order. Simulated and live outcomes must never share an ambiguous success state.

The target is a curated, execution-first brokerage house, starting with Hetty's Base mandate. The old registry, provider keys and Arbitrum payment scaffolding are not the public identity model. There are no existing-user migration requirements; replace old assumptions rather than preserve them. Any future voice integration must explicitly bind the house broker to a verified provider configuration and desk mandate. Never infer execution network or authority from an old provider key.

## Target domain contracts

**Proposed, not implemented schemas or endpoints.** These boundaries guide later detailed design; they do not authorize a network migration or production execution. Product semantics live in [Product Direction](PRODUCT_DIRECTION.md); sequence and unresolved choices live in [ROADMAP.md](../ROADMAP.md).

| Domain | Minimum contract | Boundary |
|---|---|---|
| Broker identity | Stable ID, AI identity disclosure, voice/editorial profile, historical-inspiration provenance. | Independent of network, vendor voice ID, publication, and execution credentials. |
| Desk mandate | Broker ID, supported networks/venues/instruments, eligibility, capabilities, risk policy, operational status. | Server-enforced permissions outside the prompt. Planned coverage is not availability. |
| Instrument catalog | Canonical product ID, underlying security where relevant, issuer, network, contract/mint or venue ID, decimals/units, rights/restrictions, quote currency, allowlisted venue pairs, availability state, `lastVerifiedAt`. | Resolve before pricing. Tickers are display/search aliases, not unique execution identifiers. See [Instrument and pair integrity](#instrument-and-pair-integrity). |
| Market observation | Instrument ID, underlying/product distinction, source/venue, value and units, as-of/received timestamps, market session, delay/staleness and licensing metadata. | Informational, not a promise of fill. Web research cannot supply an executable quote. |
| Quote and instruction | Quote ID, exact instrument/venue/network/account, side/size, bounded or estimated consideration, applicable fees/slippage, expiry, simulation/live mode, approval binding. | Changes/expiry invalidate the relevant approval. Venue-specific revalidation and idempotency are prerequisites to submission. |
| Publication edition | Publication/edition IDs, broker byline, title/thesis, body and structured claims, sources/data cutoff, publish time, review record, instrument/theme references, revision/status links. | Public/shared record with durable versions, not a personalized mutable chat message. |
| Private client work | Owner/access scope, edition/passage and instrument references, saved notes/questions, conversation references, consent/retention/deletion metadata. | Tenant isolation; private material cannot enter a public edition through retrieval or generation. |
| Desk preferences/context | Explicit follows/watchlist/pins/dismissals, density/mode preferences, permitted history, provenance and retention; reason codes for suggestions. | No inferred holdings, risk tolerance, or wallet permission. User controls and deletion propagate to derived state. |
| Outcome and evaluation records | Instruction/transaction result or simulation assumptions; separate publication evaluation horizon/benchmark/method; source/version references. | A published thesis, paper record, transaction result, performance evaluation, and call-payment receipt are different evidence. |

Separate adapters for market data, instrument resolution, execution, client accounts, and call billing. Base/Solana/Robinhood Chain access is not implemented by replacing `ACTIVE_CHAIN_ID`. Base and Robinhood Chain use EVM transaction tooling; Solana requires its appropriate signing/execution adapter. A publication can discuss an instrument outside current execution coverage if that limitation is explicit.

### Primary trade lifecycle

```
Client intent (direct voice/input, or explicit action from supporting research)
        ↓
Resolve exact product + account/network + eligibility + side/size
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

Persist a stable intent/order identifier and binding to quote, account, network, instrument, side, size, and authorization. Reconcile ambiguous submission results before retry; a client/network timeout does not prove the trade failed. Distinguish allowance approval from swap execution, an order acknowledgement from a fill, and chain inclusion from the finality level selected for that operation. Handle rejection, reversion, expiry, partial fills where supported, and unknown outcomes explicitly. The call-payment receipt is not the trade receipt.

### Instrument and pair integrity

Public markets include thin and unfamiliar pairings. Neither low liquidity nor a meme pairing proves fraud. Integrity comes from issuer-authenticated identity, verified routes, and size-specific checks. The following five layers are target requirements; the implemented paper subset is described below.

1. **Canonical instrument registry.** Keyed by contract address, seeded from the issuer's official list. `B20Created` events discover candidates only; they do not establish Coinbase issuance or authorize catalog admission. Reviewed issuer evidence is required before adding an instrument. Each record carries contract address, symbol, decimals, current multiplier, underlying ticker, reference-feed address, issuer, and status (`listed`/`suspended`/`delisted`). A query for "NVIDIA" resolves to the canonical `NVDAc` address or returns "not on this desk"; no lookup path can land on a lookalike token.
2. **Venue-pair allowlist.** Per instrument, store the specific verified pool/route addresses (e.g. the primary `NVDAc/USDC` pool). Quotes are only requested against allowlisted pairs; aggregator responses are re-verified to touch only allowlisted venues and tokens before display.
3. **Objective admission thresholds.** A pair qualifies only when it clears mechanical bars: both tokens resolve to canonical addresses (the `0xb200…` B20 prefix is a sanity check, not a proof), verified token and pool provenance, executable depth and bounded output at the intended size, applicable account policy/pause checks, and a validated submission route. TVL and volume are supporting signals, not proof of safety. Reference comparisons require fresh, unpaused, unit-consistent data and market-session awareness; never use a frozen feed as an unconditional price gate.
4. **Explicit availability states.** `tradable`, `insufficient liquidity`, `verification pending`, `not available on this desk`. An uncovered instrument is a first-class answer ("outside my desk's coverage"), which is also the designed handoff trigger.
5. **Continuous re-verification.** Allowlist entries carry `lastVerifiedAt`; a pair that falls below threshold degrades to `insufficient liquidity` rather than silently quoting a stale market. Issuer pauses, blocklist events, and multiplier changes are monitored and reflected in availability.

The net rule: a client can never reach a pool that is not on the verified list, and coverage is an explicit, explainable boundary rather than an accident of search results.

## Robinhood Chain integration baseline

**Source review: 2026-09-05.** The user confirmed Robinhood Chain, not Robinhood's brokerage-account API. The following facts come from the linked official documentation; no RPC, REST trading flow, liquidity, eligibility service, or contract was exercised as part of this review. Recheck live parameters before implementation or release.

| Topic | Documented baseline | Claflin implication |
|---|---|---|
| Network | [Overview](https://docs.robinhood.com/chain/) describes a live permissionless EVM-compatible L2 built on Arbitrum Dedicated Blockchains. [Connection details](https://docs.robinhood.com/chain/connecting) list mainnet chain ID `4663`, testnet `46630`, and ETH gas. | Isabel's execution adapter targets a distinct chain, not Arbitrum One. Use explicit environment/account/network validation; no global constant substitution. |
| Infrastructure | Connection docs recommend provider RPC/WebSocket endpoints for production; public endpoints are rate-limited and not recommended for production. Overview documents ERC-4337 support. | Select and verify RPC/account infrastructure. Network support does not mean Claflin already has working sponsorship, session keys, or trading. |
| Product rights and eligibility | [Stock Tokens](https://docs.robinhood.com/chain/stock-tokens) describes ERC-20 tokenised debt securities issued by Robinhood Assets (Jersey) Limited, providing economic exposure without legal/beneficial rights in the underlying security issuer. It lists U.S.-person and other jurisdiction restrictions. | Identify the actual product and enforce applicable access policy; do not label tokens as direct stock ownership or infer unrestricted product access from a permissionless chain. Verify current prospectus/final terms for selected products and users. |
| Token units | Stock Tokens use 18 decimals and ERC-8056 `uiMultiplier()` for corporate-action/share-equivalent adjustment; raw balances do not rebase. [Integration guide](https://docs.robinhood.com/chain/building-with-stock-tokens) documents pending multiplier values/effective times and UI-adjusted views. | Preserve raw transaction units and explicit token/share-equivalent display units. Read multiplier state consistently; a displayed share-equivalent amount is not evidence of underlying share ownership. |
| Informational APIs | [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis) documents read-only `/assets`, `/prices`, and `/corporate-actions` under `https://api.robinhood.com/rhj/`, with caching and rate limits. REST prices are underlying-equity bid/ask, not multiplier-adjusted. Asset deployments are per chain; underlying trading-capability fields may be absent/null. | These are data inputs, not a Robinhood order-placement API. Resolve deployment and product identity; unknown underlying capability is not positive execution eligibility. Apply current cache/freshness semantics. |
| Onchain valuation | [Oracles & Price Feeds](https://docs.robinhood.com/chain/oracles-and-price-feeds) states Chainlink prices are per-token and already multiplier-adjusted. Stock feeds update 24/5. | Do not multiply the feed price again. Keep underlying reference, token valuation, and executable venue quote distinct. Read feed decimals/heartbeat and timestamps, not assumed constants. |
| Price availability | Oracle docs require staleness/answer checks and recommend sequencer uptime/grace-period checks; `oraclePaused()` is advisory during corporate actions. | Treat paused/untrusted prices as unavailable, not zero. Continue freshness checks even when the pause flag is false. A 24/7 chain does not guarantee fresh stock feeds or executable liquidity. |
| Trading | The integration guide describes RFQ trading at launch and lists RFQ aggregators, AMM/propAMM, and orderbook venues. Direct issuer mint/burn is limited to authorized participants with KYB. | Choose and verify a secondary-market venue with actual supported pairs, access, liquidity, quote and submission interfaces. Do not assume issuer access, a specific route, or guaranteed liquidity from an ecosystem listing. |
| Settlement | [Transaction Finality](https://docs.robinhood.com/chain/transaction-finality) distinguishes sequencer soft confirmation, posting to Ethereum, and Ethereum finality; canonical withdrawal delay is separate. | Expose the operation's selected confirmation/finality level. A fast receipt is not blanket final settlement, and bridging is a separate consented flow. |

For price/position math, distinguish human token units (`rawBalance / 10^18`), the share-equivalent ratio (`uiMultiplier / 10^18`), underlying-equity price, and the feed-scaled per-token price. Convert once in the appropriate direction using precise decimal/integer arithmetic. Corporate-action timing, stale cached REST metadata, and raw-versus-UI units need regression fixtures before funds are at risk. A valuation is never substituted for a size-specific executable quote.

The network choice is settled; integration choices remain: selected products and eligibility policy, secondary-market venue and access, account/gas setup, data-feed mappings/freshness rules, and end-to-end execution verification. The docs' ecosystem list is not an endorsement or a claim that Claflin is affiliated with Robinhood.

## Coinbase Tokenized Stocks on Base integration baseline

**Source review: 2026-09-05.** Hetty's first mandate. Facts below come from the official [Base integration guide](https://docs.base.org/base-chain/asset-issuance/tokenized-stocks-on-base), the [Base stocks page](https://brand.base.org/stocks), and dated press coverage; no RPC call, venue quote, or transaction was exercised as part of this review. Recheck live parameters before implementation or release.

| Topic | Documented baseline | Claflin implication |
|---|---|---|
| Product and issuer | Coinbase Tokenized Stocks: B20 tokens on Base issued by Coinbase under Regulation S, each a beneficial claim on a share held 1:1 at Alpaca (regulated custodian) in a bankruptcy-remote, ADGM-supervised structure. Eligible non-US users only; cash dividends convert to additional share exposure via the multiplier rather than paying out. | This is third-party-issued equity exposure with issuer-controlled compliance powers—not direct exchange-listed stock ownership. Present rights honestly; verify the current prospectus per token before quoting. |
| Catalog | 13 token contracts exist on Base mainnet (tickers AAPLc, AMZNc, COINc, CRCLc, GOOGLc, INTCc, METAc, MSFTc, MSTRc, NVDAc, SNDKc, SPCXc, TSLAc; addresses in the official guide). Deployed ≠ liquid: press reported ~4 live at 2026-08-24 launch and ~10 by early September. The Base page warns to match contract addresses before buying. | The instrument catalog must store the exact contract address, not the ticker. Gate the tradable list on verified circulating liquidity, not on the contract existing. Discover new listings via the `B20Created` event. |
| Token mechanics | B20 is an ERC-20-extending **precompile** shipped in Base's Beryl upgrade; every token shares one audited implementation (Base + Spearbit; Cantina/HackerOne bounties). No per-asset verified contract on Basescan. Asset variant supports configurable decimals and a WAD-scaled (1e18) multiplier for corporate actions. | `forge` cannot simulate B20 precompiles—testing needs `base-anvil`/tooling that registers them. Verify decimals per token rather than assuming 18. |
| Corporate actions | `multiplier` adjusts redemption ratio (dividends, splits). Scheduled updates via ERC-8056 `updateUIMultiplier`; helpers `scaledBalanceOf`, `toScaledBalance`, `toRawBalance`. `Announcement`/`EndAnnouncement` events flag actions; admin ops have no built-in timelock. | 1 token ≠ 1 share permanently. All display/position math must apply the current multiplier; index `Announcement` and `MultiplierUpdated` events. |
| Transfer policies and pauses | Onchain policy scopes (allow/block lists) can revert transfers; `isAuthorized(policyID, account)` checks authorization. **Standard `approve()` is not policy-gated**—an approved allowance does not prove a transfer will succeed. Per-function pauses exist. | Pre-flight every trade with policy/pause checks, not just allowance. A blocked transfer surfaces at execution, not approval—this is a distinct failure mode to handle. |
| Compliance boundary | Secondary-market holding and trading are **permissionless onchain**; KYC applies only to AP mint/redeem. The issuer can block sanctioned/prohibited-jurisdiction addresses. | The chain will not enforce "eligible non-US" for Claflin—eligibility screening is our product's responsibility (jurisdiction terms, geo/eligibility checks at onboarding and trade review). Define and document this policy explicitly. |
| Reference price | `Token Price = Underlying Equity Price × Multiplier`. Official Chainlink feeds on Base report **total-return** values (8 decimals), run 24/5, hold last close on weekends/holidays, and freeze during corporate actions via a pause flag in Coinbase's onchain oracle registry. | The oracle is a valuation/reference input, not an executable quote. Enforce `updatedAt` staleness bounds and paused-feed handling; never settle against a frozen feed. |
| Market price and venues | B20s trade 24/7 on secondary venues; Base lists ~50 ecosystem apps. Spot liquidity concentrates on Aerodrome; routing via 0x, 1inch, CoW Swap, Matcha, KyberSwap, Definitive, Fusion; Aave/Morpho/Euler for lending. The token's DEX price does not feed the Chainlink oracle, so DEX and reference prices can diverge—especially outside equity market hours. | Show underlying reference, token market price, and the executable quote as distinct values. Weekend/after-hours divergence between oracle price and achievable DEX price is expected, not an error—label it. Select and verify the execution venue (liquidity, pairs, quote API, failure semantics) before the demo. |

The mandate is settled; remaining choices are the trading venue/adapter, quote semantics (spend-in-USDC vs. share quantity), Claflin's eligibility enforcement, and the account/funding model. The ecosystem listing is not an endorsement, and Coinbase's issuance does not imply any Claflin affiliation.

### Venue strategy: aggregator and direct venue behind one adapter

Design for multiple route types behind the same quote-bound ticket contract; the client sees terms, not plumbing.

| Route | How it works | Strengths | Constraints for Claflin |
|---|---|---|---|
| Aggregator (0x Swap API) | REST prices and quote preparation. | Potential route aggregation and reusable integration. | One USDC→NVDAc request returned `BUY_TOKEN_NOT_AUTHORIZED_FOR_TRADE`. Scope of restrictions requires provider clarification; neither other B20 products nor Robinhood Stock Tokens were tested. |
| Direct Aerodrome | Read-only `MixedRouteQuoterV3` call with the configured CL-factory mask. | Supports the current Base paper-estimate slice without an aggregator API. | Quoting does not verify signing, account eligibility, router compatibility, fees/gas or execution. Direct access is not an exemption from product restrictions. |

**Evidence correction, 2026-09-05:** the 0x result applies to the tested request. Odos returned an infrastructure error (`1033`), not a token-policy response. These results do not establish a universal aggregator ban, or anything about Isabel's future routing. A successful pool-state read is not execution evidence.

Current implementation uses a single approved Aerodrome route for paper estimates. Additional eligible venues may be added after independent verification. Route preferences must never silently change a reviewed instruction; compare costs and measured performance rather than assume direct routing is fastest.

**Verification snapshot, 2026-09-05** (DEX Screener token-pair data; 0x API test; onchain `eth_call`):

- DEX Screener reported approximately $2.6M NVDAc/USDC liquidity, $1.4M AAPLc/USDC, $1.1M METAc/USDC and $1.6M GOOGLc/USDC on Aerodrome. TSLAc/USDC was approximately $133k. These are historical third-party observations, not present executable depth, and the limited sample does not establish all other products' liquidity.
- Thin and unfamiliar pairings were observed; no fraud assessment was performed.
- NVDAc pool state and later V3 quoter calls returned data. The updated `/desk` API was exercised read-only against Base and returned 0.43369173 NVDAc for 100 USDC at block 50908265. No wallet signature, approval or swap was performed.

### Implemented paper desk slice

- `/` is the canonical desk; `/desk` redirects to it. It owns its palette, mark, instrument and working surfaces, rather than importing a study composition. The old directory and onboarding journey are replaced. `/desk-study` is a development-only reference.
- `WorkingDesk.tsx` composes the client experience; `TradeTicket.tsx` and `PaperHistory.tsx` present the work; `useTradingDesk.ts` coordinates requests, review and local records. First arrival has no preselected instrument or amount. Product details are contextual, and navigation leads only to client work and house context.
- `lib/trading/domain.ts` owns explicit amounts and estimate types; `catalog.ts` exposes immutable, chain-qualified instruments; `quotes.ts` is an injected-reader service; `aerodrome.ts` is read-only RPC integration; `http.ts` supplies a thin request boundary. Older quote exports delegate to the hardened service where applicable.
- `GET /api/stocks/quote` accepts only `instrumentId`, `side`, `amount`, `unit`. Buy uses USDC spend; sell uses token quantity. Decimal strings convert directly to integers. Legacy `sizeUsd` requests are rejected.
- Each estimate rechecks chain, factory, quoter factory, resolved pool, token order, tick spacing, decimals, positive liquidity/output and multiplier at one recent block. Static `quote_candidate` status only enables an attempted read. Historical TVL is not an authorization gate.
- Results are `kind: estimate`, `mode: paper`, `liveExecutionEnabled: false`, with pool/product identity, block/time, raw amounts, multiplier/share-equivalent display and a 30-second review window anchored before RPC work. There is no execution payload or reserved price. No small-buy-versus-sell comparison is called price impact.
- Optional Chainlink observations reject invalid/future data and label age over 24 hours stale. Market session and pause status remain explicitly unknown/unchecked. They are not used to authorize trades.
- Request handling returns sanitized errors and no-store responses, limits concurrent requests to two and attempts to 60/minute per process. This is bounded demo protection, not distributed production abuse control. Public RPC reliability and data-display rights remain release considerations.
- `workflow.ts` binds manual edits and Hetty's client-tool instructions to one draft, invalidating old reviews and late responses. Her tools (`choose_instrument`, `set_instruction`, `set_amount`, `request_estimate`, `describe_desk`, `record_paper`, `cancel_instruction`) are declared on the provisioned agent and executed in the caller's browser — draft, quote and paper-record only; no signing, submission or account authority is reachable by voice.
- `paper-records.ts` stores versioned, schema-validated local records only after review and successful storage, using quote IDs for duplicate prevention. Records preserve estimate and simulation assumptions, survive reload, and can be reused as new drafts or explicitly deleted. Storage errors block success; corrupt history is not overwritten. Records are visible to anyone using the browser profile, are not account-synced or authoritative, and are not positions or call receipts.
- The simulated fill equals quoted output including pool fees; additional slippage, gas, platform and call charges are zero in this model. Account balance, holdings and eligibility are not verified. Wallet binding, account-specific policy/pauses, bounded transaction preparation, signing, submission, reconciliation and broker tool integration remain unimplemented live-release gates.

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

---

## Retired marketplace implementation reference

The following broker-administration, data-model and CRUD sections describe retained source history, not available product flows. Their public marketplace routes return 410 and the associated client/admin pages are retired. Do not follow these sections as onboarding or deployment setup instructions. Identity, payment and webhook code below is separate technical scaffolding, not a live trading release.

### Broker Administration Lifecycle

```
Developer submits via /list-your-broker
        │
        ▼
POST /api/agents  { register: true }
        │
        ▼
Redis: broker stored as status="pending"
        │
        ▼
Admin reviews → PATCH /api/agents/:id  { action: "approve" | "reject" }
        │
        ▼ (approved)
status="active" → appears in GET /api/agents
        │
        ▼
User calls broker → ElevenLabs Conversational AI session
        │
        ├─ Controlled via `<elevenlabs-convai>` widget engine (implemented)
        └─ `useWidgetConversation` hook drives shadow DOM button + signed URLs
        │
        ▼
Provider events/tool callbacks → POST /api/webhooks/elevenlabs
        │
        ├─► Applicable local records/accounting updates
        └─► Optional reputation updates when configured; may fail or be skipped
```

---

## Agent Data Model

```typescript
interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  specialty?: string;
  rate: number;              // per-minute rate in USDC
  avatar: string;            // emoji
  active: boolean;
  status: 'active' | 'pending' | 'rejected';
  elevenlabs_agent_id?: string;
  wallet_address?: string;   // developer earnings destination
  erc8004_id?: string;       // on-chain identity token
  totalCalls: number;
  rating: number;
  online: boolean;
}
```

---

## API Reference

### Agent CRUD

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/agents` | Public | List all active agents |
| POST | `/api/agents` | Admin or developer | Create (admin) or register (`register: true`) |
| GET | `/api/agents/:id` | Public | Get single agent |
| PATCH | `/api/agents/:id` | Admin | Approve or reject pending agent |
| DELETE | `/api/agents/:id` | Admin | Remove agent |
| POST | `/api/agents/seed` | Admin | Seed default agents into Redis |

### Self-Registration

```bash
POST /api/agents
Content-Type: application/json

{
  "name": "My Agent",
  "description": "What this agent does",
  "category": "finance",
  "rate": 0.10,
  "elevenlabs_agent_id": "agent_abc123",
  "wallet_address": "0x...",
  "register": true
}
```

Response: `{ "message": "Registration submitted for review", "agent": { ... } }`

### Admin Approval

```bash
PATCH /api/agents/:id
Content-Type: application/json

{ "action": "approve" }   # or "reject"
```

---

## Stats Endpoint

```
GET /api/agents/stats
```

Returns aggregate platform statistics:

```json
{
  "summary": {
    "totalAgents": 4,
    "totalCalls": 127,
    "avgRating": 4.2,
    "topAgent": { "name": "Code Reviewer", "totalCalls": 54 }
  },
  "agents": [ ... ]
}
```

---

## ERC-8004 On-Chain Identity

Each agent can have an on-chain identity via ERC-8004 contracts on Arbitrum. The contracts must be deployed first, then configured via environment variables:

| Registry | Env Variable | Purpose |
|---|---|---|
| Identity | `NEXT_PUBLIC_ERC8004_IDENTITY_ADDRESS` | Agent identity NFT |
| Reputation | `NEXT_PUBLIC_ERC8004_REPUTATION_ADDRESS` | Call count, ratings |
| Delegation | `NEXT_PUBLIC_ERC8004_DELEGATION_ADDRESS` | Agent-to-agent delegation |

Enable via env:
```env
NEXT_PUBLIC_ERC8004_ENABLED=true
NEXT_PUBLIC_ERC8004_IDENTITY_ADDRESS=0x...
NEXT_PUBLIC_ERC8004_REPUTATION_ADDRESS=0x...
NEXT_PUBLIC_ERC8004_DELEGATION_ADDRESS=0x...
```

Note: The ERC-8004 contracts ARE deployed on Arbitrum Sepolia (chain
421614). The addresses configured in `.env.local.example` point at
those deployed instances. The Identity and Reputation contracts are
ERC-8004 reference deployments; the Delegation Registry is this
project's `DelegationRegistry.sol` (in `contracts/`). To redeploy
the Delegation Registry, see `contracts/` and the Hardhat config that
shipped with the original deploy.

---

## Payment Flow

Call payment is separate from research and paper-instruction recording. The intended client contract below must be verified across entry points; the current launch/cap mismatch is tracked in the roadmap.

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

The documented settlement model transfers USDC to the platform wallet and ledgers the 80/20 split in Redis for broker payout accounting; it is NOT an atomic on-chain dual transfer. An atomic split requires a separate contract decision and verification, conditional on operational need rather than an automatic next phase. The broker's earnings destination comes from the `wallet_address` field in Redis.

Per-call earnings breakdown is available via `/api/agents/earnings`,
which reads the `split-payment:{callId}` ledger entries and enriches
them with settlement tx hashes. The developer dashboard surfaces this
as an expandable per-call list with trial/ledgered/settled status.

See [ROADMAP.md](../ROADMAP.md) for verification gates and conditional expansion. Infrastructure options do not supersede the complete Hetty journey.

---

## Agent-to-Agent Communication

General agent delegation is a deferred option, not a committed next phase. The existence of a delegation contract does not establish a working multi-agent client journey. Add a specialist handoff only for demonstrated client need, with explicit permissions, preserved context, and accountable outcomes.

---

## Redis Data Structure

```
agent:<id>          → JSON Agent object
agents:list         → sorted set of agent IDs
call:<id>           → JSON call record
calls:agent:<id>    → list of call IDs for an agent
user:<address>      → JSON user profile
```
