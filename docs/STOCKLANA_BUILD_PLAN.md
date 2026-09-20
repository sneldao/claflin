# Stocklana: Jesse's Solana Desk — Four-Engineer Build Plan

**Prepared:** 2026-09-16. **Updated:** 2026-09-20 — seated Jesse paper desk, ConvAI line, Night/Direct presentation toggle, and PreStocks secondary duplex landed. **Status:** approved integration brief; `/night-desk` remains the fixture study (full 3D scene bind deferred); seated R1 paper path is in product; Pyth Pro entitlement + unit basis, Redis daemon, and R2 live execution remain.

**Product owner:** project lead. **Integration/release captain:** Engineer 4. **Contract owner:** Engineer 1. Assign actual people to these roles before work starts.

## Team start here

Start from `decace0` or a descendant on `main`. The public [Night Desk prototype](https://claflin.trustfall.xyz/night-desk) is the approved spatial study (still fixture data). The seated Jesse paper desk is open from the house directory on `/` with Night/Direct presentation preference and a PreStocks evidence duplex. Homepage still defaults to Hetty. Do not replace that homepage or port Hetty's provider stack. Product surface notes: [Jesse desk](JESSE_DESK.md).

Read this brief in order: §2 (what exists), §3 (approved experience), §4 (contracts), then your §5 work package. Read [Product Direction](PRODUCT_DIRECTION.md#night-desk-progression-and-presentation) for the governing progression decision. Engineer 1 lands the shared contracts first; Engineers 2–4 start against those fixtures in parallel. No one independently changes shared types or the lockfile.

| Engineer | First deliverable | Additional experience responsibility |
|---|---|---|
| 1 — Core | Protocol-safe catalog/intent/quote contracts and shared controller | Presentation-independent work state, explicit saves/watches, renderer-switch invariants |
| 2 — Market | Verified Pyth feed/unit mapping and comparison reader | One accessible market-evidence presenter used by both views |
| 3 — Voice | AssemblyAI transport and grounded commands against the shared controller | Shared attention, interrupted speech/highlights, return-visit language from actual saved work |
| 4 — Experience/release | Connect the existing Night Desk shell to the controller and provide direct view | Own camera/material/interaction coherence, cross-stream integration and release evidence |

**Decision:** the room does not unlock; it becomes yours through the work you choose to keep. No knowledge-test gate, minimum trade count, balance threshold, XP, streaks, or paid-call requirement. R2 controlled live execution remains the full target, subject to its separate release gates. Do not expand into other bounty tracks or rebuild the scene from scratch.

## 1. Decision and definition of success

Build **Jesse Livermore's Solana desk inside Claflin**, not a separate landing page and not a port of Hetty. Leave Hetty's ElevenLabs conversation and Base execution on their existing provider/network. Jesse uses AssemblyAI streaming as the input foundation of his own bounded conversational agent.

**Pitch:** “Before you trade a tokenized stock, Jesse shows what you are actually buying, how its market compares with the equity reference, and the exact terms of your Solana trade.”

**User:** a self-directed tokenized-equity user who can express a trade but needs help distinguishing the token, underlying reference, current liquidity, amount units, and actual outcome—especially outside regular US equity hours. Validate this with real users; it is a target audience, not established demand.

**Job:** speak or type intent → identify the exact xStock → inspect comparable market evidence → obtain a size-specific Jupiter quote → correct/review → explicitly file a paper record or, only when released and permitted, sign a Solana swap → recover the record/outcome later.

**Jesse's difference:** disciplined tape reading, not reckless speed. Short, factual replies; correct units; names old data; stops on ambiguity; accepts “leave it” without persuasion. Differentiate through market-reading behavior and correction handling, not just a different voice or wallpaper. Historical inspiration is not an affiliation, endorsement, or claim of expertise.

### Release levels

| Level | Required result | Release treatment |
|---|---|---|
| R1: complete paper decision desk | Real Solana catalog and Jupiter quotes; Pyth comparison when evidence permits; AssemblyAI conversation with spoken replies; corrections; paper filing/recovery; manual and mobile paths; honest failure states | Required integrated Stocklana submission baseline, not a prototype with fake success |
| R2: controlled live trading | Fresh wallet-bound proposal; validated transaction; explicit wallet approval; submission journal and independent reconciliation; restrictions/access review | Full target of this plan. Implement in parallel after foundations, but do not enable until every live gate passes |
| Later | More instruments, watch alerts, portfolios, recurring buys, other desks, additional languages, general financial conversation | Not required for this submission |

R1 does **not** mean R2 is complete. If live gates miss the deadline, publish a complete paper/analytics experience and disclose the missing live capability. Keep R2 work visible in the tracker; only the project lead can approve that scope reduction. Do not dress paper records as fills. Stocklana's general rules allow analytics/consumer projects; they do not explicitly require mainnet execution, although a particular Meteora bounty prefers it.

### Contest focus and deadline

- Primary: Stocklana main track. Secondary: Pyth market-data bounty **only if Pyth is genuinely central and integrated**. That bounty awards three months of Pyth Pro, not a stated cash prize.
- **Bounty scope, settled 2026-09-17 (amends the earlier "no other bounties" instruction):** PreStocks ($5k, judged on creativity/integration depth/product quality, no Solana-program requirement stated) is sanctioned as an additional secondary bounty on Jesse's desk — its mark-price-versus-token-price surface is the same reference-versus-token story as the Pyth comparison, with the issuer mark standing in for a public equity feed. Clawpump (requires launching a token — conflicts with the house's no-token, provenance-first direction) and Tessera (same shape as PreStocks; one pre-IPO integration done deep beats two thin ones) remain declined. Meteora DBC is not a primary target; a read-only DBC pool-state surface may ride on the PreStocks work only if R1 stays on schedule. The Pyth bounty's "Build a Solana application" wording is satisfied by Jesse, not by Hetty/Base.
- **PreStocks constraints:** it must not delay R1; it must not change frozen contracts except through an Engineer 1 contract issue; pre-IPO instruments are labelled honestly (SPV-backed, issuer-provided mark, no public equity reference, not an exchange price); and the integration degrades silently to unavailable if the API or venue access fails verification. Quote venue for PreStocks mints (Jupiter routing versus issuer-mark estimates) and any Meteora DBC pool-state reads are open verification items, not commitments. PreStocks product data verified 2026-09-17 from `https://prestocks.com/api/prestocks`: 8 products (ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET, SPACEX), each a Solana mint with `markPrice`/`tokenPrice`/`supply` fields.
- **Confirmed submission deadline: Friday September 25, 2026, 16:00 ET / 20:00 UTC / 21:00 BST / Saturday September 26, 04:00 Singapore.** The user supplied Solana’s official September 15 announcement explicitly extending the deadline to September 25 at 4 PM ET. This supersedes the September 18 rules text still visible on the event page; deadline uncertainty is resolved.
- Project lead: confirm registration, existing-project eligibility, prior-work disclosure, and submission-edit rules with organizers immediately. Disclose the existing Claflin/Base foundation and identify the newly built Solana work. Do not assume rules permit undisclosed reuse or cross-event submission.
- Engineer 4 prepares a draft submission early; the project lead submits and confirms receipt before the confirmed September 25 cutoff. The page says at least one GitHub/demo/video link is required, one submission per team, and edits are allowed until close. Record proof of acceptance, not just a prepared form.

## 2. Evidence baseline and corrections to earlier assumptions

The integration findings below began with source inspection at `c3349b4`. The team baseline is now `decace0`, which adds the public Night Desk prototype without connecting Solana providers. The prototype passed 13 focused logic tests, 22 scripted Chromium desktop checks in Devin Cloud, a production build, and production route checks. Browser speech was exercised with test stubs; this is not evidence of real AssemblyAI recognition, a final Jesse voice, or real financial integration. Mobile acceptance was deferred, not passed.

### Prototype inventory: reuse versus replace

| Existing source | Reuse | Not production integration evidence |
|---|---|---|
| `app/night-desk/page.tsx` | Public, noindex `/night-desk` entry | Currently a labelled fixture study, not an open Solana trading mandate |
| `components/night-desk/NightDesk.tsx` | Conversation-led composition, slips, ledger, semantic controls | Currently binds a scripted reducer, not `useTradingDesk` |
| `components/night-desk/NightDeskScene.tsx`, `lib/night-desk-scene.ts` | One scene/renderer, camera views, projected labels, paper and ledger movement, cleanup | Materials remain prototype-level; scene state is not financial authority |
| `lib/night-desk-fixtures.ts` | Explicit study/test content only | Prices, timestamps, quote outputs and dialogue are fictional; never copy them into provider fallback paths |
| `lib/night-desk-state.ts` | Reference for the demonstrated interaction sequence | Finite example-command parser and scripted reducer are not a real voice/trading controller |
| `claflin.night-desk.study.v1` sessionStorage key | Keep isolated for the study | Stores one illustrative kept amount in a tab, not real paper history, portfolio, or cross-device memory |
| `app/desk-study/page.tsx` | Development-only access to the study | Remains 404 in production; do not remove that guard |

Keep the study reproducible while integration is built. Do not import its record into real storage or use browser speech as an undisclosed substitute for the planned voice provider.

| Verified in source/docs | Consequence |
|---|---|
| `lib/trading/adapters.ts` has registries, but Jesse entries are null and resolution checks `OPEN_DESK_ID` | Registry is a useful seam, not a completed multi-chain architecture |
| `lib/house.ts` opens only Hetty; `desk-mandate.ts` attributes paper quotes only to chain 8453 | Add explicit per-desk capabilities and provenance checks; do not change the default desk to open Jesse |
| `catalog.ts` accepts `sol:` syntax, but actual catalog is Base-only; `getDeskInstrument` lowercases the entire id | Preserve Solana mint case and validate decoded 32-byte public keys; a base58 regex is not sufficient |
| `domain.ts`/`workflow.ts` require EVM block/pool fields and a Base multiplier; strict parser checks a 30-second lifetime | A Jupiter route must get its own quote schema. Never invent an EVM chain id, pool, block, or multiplier to fit it |
| `TradeTicket`, `WorkingDesk`, voice readbacks, live hooks, and ledger helpers contain Base/Hetty assumptions | Real integration touches these consumers, not just adapters |
| `paper-records.ts` has one v1 prefix and defaults legacy desk identity to Hetty; sync has its own lifecycle | Preserve legacy records and explicitly version new Solana records; do not silently reattribute data |
| `useDeskExecution.ts` and `live-journal.ts` are EVM-specific | Use a separate Solana wallet/execution journal; never pass a Solana quote through an EVM hook |
| Package manifest declares Next 16.3.4, React 19, Zod, ethers/viem, ElevenLabs, Privy; no direct Solana/Pyth SDK dependencies | SDK additions require compatibility/version checks and one lockfile owner |
| Jupiter's current documented flow is Swap API v2 `/order` and `/execute`; no taker gives a quote without a transaction | Do not build from the earlier shorthand/legacy `/quote` suggestion |
| xStocks on Solana use Token-2022 Scaled UI Amount | Sell amounts, balances, price units, corporate actions, and transaction amounts require explicit conversion |
| Pyth Pro requires an API key; uses numeric feed ids; price may be carried forward in a fresh message | Verify access/feed mapping; use per-feed generation timestamps, not message receipt time |
| AssemblyAI v3 streaming has temporary tokens, turn messages, and speech-start events | Real-time transcription does not itself provide execution, TTS, authorization, or correct trade interpretation |

**Corrected positioning:** Pyth is cross-chain; equity/token comparisons are not exclusive to Solana. Base can also support fast experiences and tokenized equities. Solana's justification here is the specific xStocks/Token-2022/Jupiter ecosystem and implemented workflow, not “only Solana is fast.” Do not claim 400ms trade settlement or sub-200ms end-to-end voice without measurements. A stale quote versus a current token price is not a proven arbitrage opportunity.

The working tree contains existing modified docs, deleted `out/` artifacts, and untracked media. Do not reset, clean, stash, commit, or overwrite those as part of this plan. Engineer 4 and the project lead select a shared integration baseline; account for any relevant uncommitted product decisions explicitly.

## 3. Experience contract

### Primary journey

1. Today, `/night-desk` is the public fixture study and `/` is Hetty/Base. Build the integrated Jesse experience behind the agreed release gates; promote `/night-desk` to it only after G3 and lead approval. Its default presentation is Night Desk, with an always-available direct view (`/night-desk?view=direct`). Preserve `/?desk=jesse` as a supported desk entry once Jesse is operational. These are target entries, not claims that those query switches work today. Keep the homepage on Hetty until a separate decision changes it.
2. Start with no default instrument or amount. Support Apple/AAPLx first, then NVIDIA/NVDAx and Tesla/TSLAx **only after each mint, multiplier, quote route, and feed mapping passes validation**. A one-instrument completed flow beats three guessed integrations; two verified instruments are the coverage target.
3. “Talk with Jesse” requests microphone consent. Also provide keyboard/manual controls and a typed command input using the same controller. No wallet or sign-in prerequisite for quotes or paper.
4. “Compare Apple.” Bring the duplex instrument and its readable evidence folio into focus: underlying reference, token observation, their own timestamps/session/units, and only a valid comparison. Jupiter's size-specific quotation remains a third, distinct slip. The room participates in the work rather than surrounding a conventional price-card dashboard.
5. “Quote a buy of 100 USDC of Apple.” Streaming words appear as provisional hearing text. Only a finalized, unambiguous turn changes the authoritative ticket. A complete buy/quote command may request a read-only estimate; it never authorizes a trade.
6. “No, make that 150 USDC.” Stop outdated speech, invalidate the earlier quotation, apply one correction, and request a new estimate. If the correction arrives during review, explicitly return to draft/requote. Never carry a yes/approval across this revision.
7. Jesse reads actual returned input/output and relevant caveats. Spoken emphasis and the visual foreground refer to the same immutable evidence/quote identity. New speech or a correction cancels outdated narration and emphasis. If comparison is unavailable, say so; independent Jupiter quoting may still work.
8. User chooses “File paper record” or says the explicit paper-filing command after a fresh readback. Verify storage before acknowledging success. Recall the record after reload. Watching or declining is also a valid finish.
9. If R2 is released, selecting live mode creates a **new wallet-bound proposal**, shows minimum receive/fees/network/account/expiry, and requires an explicit UI action plus wallet signature. Voice cannot sign, send, approve, or bypass this review.

### Partial input and ambiguity rules

- Provisional text may visually preview fields, but must not overwrite persisted/manual draft values, call quotes, file records, or send transactions.
- A new instruction without an amount does not inherit the previous amount. Missing side stays unresolved in the voice controller even if the existing manual form defaults to buy.
- “Buy Apple” asks for USDC spend. “Buy ten Apple shares” asks the user to choose the supported USDC-spend buy path; no implicit dollar conversion. No arbitrary default stock.
- Sell input is **scaled xStock units** (what the wallet displays), not atomic units. “Sell two AAPLx” is two displayed units; show the raw conversion and effective scaled quantity on review.
- A side flip clears the amount unless that same turn explicitly supplies valid units/amount for the new side.
- Corrections may reuse the current instrument only when the phrase clearly refers to the active draft. On an archive record, mutation commands refuse or offer return-to-draft; they do not edit the archive.
- Unsupported, conditional, multi-leg, leveraged, or autonomous instructions are refused/clarified. Never truncate “buy if…” into an unconditional buy.
- English is the first supported trading grammar. Speech-model multilingual capability is not a claim of multilingual financial parsing.

### Presentation

Retain and integrate the approved Night Desk scene: warm paper/walnut/brass, cool window depth, a duplex instrument, a shared blotter, and a retrievable ledger. The conversation arranges the relevant work; it does not merely fill a permanently displayed form. Use a small set of predictable camera views, stable object identities, crisp HTML terms, and cancellable motion. No free-roaming office, hidden trading controls, compulsory tour, talking-head avatar requirement, or fake market activity. Sound is opt-in and must not compete with speech.

Night and direct are presentation preferences for the same broker and work, not beginner/expert products. The direct view uses the same controller, data, commands, permissions, and disclosures. Neither presentation is earned. Do not infer expertise, suitability, or authorization from the chosen view. Selecting a broker/network is a separate, explicit action.

### Progression: the room becomes yours

| Context | What becomes visible | What must not happen |
|---|---|---|
| First visit | One clear question/instruction path; both presentations available | No examination, account, prior trade, or prior paper filing required to enter |
| First paper record explicitly saved | A retrievable, clearly labelled paper slip | No unlock tier, ownership certificate, or fabricated trade success |
| Return visit | Actual retained work and an optional offer to revisit it | No invented familiarity, automatic transcript retention, or claimed cross-device memory |
| First explicit watch | That instrument gains a place in the tray | No inferred holdings, repeated-trade incentive, or unrequested watch |
| More detail requested | Relevant analytical explanations and evidence controls | No hidden material terms until an experience threshold is passed |
| First permitted live action | Contextual terms, eligibility/access checks and wallet authorization | No transfer of authority from study completion or a quiz score |

R1 must support explicit paper-file/return and explicit watch/unwatch/return. Declining to trade is a valid outcome and must not reduce access or trigger pressure. Saving a comparison without trading is a useful later extension, but is not a new R1 storage subsystem; explicit watches already provide non-trading continuity. Do not introduce an engagement score, membership tier, XP model, NFT requirement, or unlock flag.

An optional invitation after a first saved paper instruction may offer the Night Desk, but it must also be accessible from day one. Use the invitation as orientation, never a lock. At a consequential live boundary, offer a brief explanation of the actual token, reference-versus-quote distinction, fees and authorization. No standalone test/grading system is in this sprint; comprehension support does not replace eligibility, transaction validation, or a fresh signature.

## 4. Frozen interfaces and cross-engineer boundaries

Engineer 1 lands contract definitions and representative test fixtures first, as a small contract-only PR. Others develop against these exported shapes with local deterministic doubles. Only Engineer 1 edits shared domain contracts; other engineers request changes through a short contract issue, not parallel edits.

### 4.1 Instruments, intent, capabilities

Create `lib/solana/contracts.ts` (client-safe) and `lib/solana/catalog.ts`. Server clients belong in separate server-only modules. Existing Base instrument ids and stored raw amounts remain byte-identical.

```ts
export type SolanaNetwork = 'solana:mainnet';
export type SolanaInstrumentId = `sol:${string}`;
export type JesseIntent =
  | { instrumentId: SolanaInstrumentId; side: 'buy'; unit: 'USDC'; amount: string }
  | { instrumentId: SolanaInstrumentId; side: 'sell'; unit: 'scaled-token'; amount: string };

export interface SolanaInstrument {
  id: SolanaInstrumentId;
  network: SolanaNetwork;
  deskId: 'jesse';
  mint: string;
  symbol: string;
  name: string;
  underlyingSymbol: string;
  decimals: number;
  tokenProgram: 'spl-token-2022';
  issuer: string;
  termsUrl: string;
  identitySourceUrl: string;
  verifiedAt: number;
  quoteSupported: boolean;
}

export interface DeskCapabilities {
  quote: boolean;
  paper: boolean;
  voice: 'elevenlabs-convai' | 'assemblyai-streaming' | null;
  live: boolean;
}
```

- Retain the current Base `TradeIntent` schema as the legacy branch; add `JesseIntent` to the shared intent union. Desk/mint validation, not shape alone, enforces which branch is valid. Reject `scaled-token` for Base and raw `token` sells for Jesse.
- Change `isOpenDesk` to consult explicit capabilities; preserve `OPEN_DESK_ID = 'hetty'` as the legacy/default storage owner. Planned Isabel/Arbitrum remain closed.
- `instrumentsForDesk(deskId)` returns only that desk's instruments. `getDeskInstrument(id)` recognizes exact canonical ids; EVM normalization is protocol-specific. Alias resolution requires `deskId`, defaulting to Hetty only at retained Hetty call sites.
- Type `DeskInstrument` as the legacy Base shape or `SolanaInstrument`; expose helpers for display name, address, and network. Narrow before accessing EVM-only fields. Do not append fake `venuePairs` to a Solana instrument.
- Remove the numeric-chain requirement from the general `QuoteAdapter` interface; Base implementation keeps its own chain property. `quote(input: unknown)` returns the shared paper-estimate union. `canQuote` enforces the desk catalog.

### 4.2 Jupiter paper estimate

Preserve legacy `BaseQuoteEstimate`; make shared `QuoteEstimate = BaseQuoteEstimate | SolanaPaperEstimate`. Narrow via `network === 'solana:mainnet'`/a type guard. All raw quantities and prices are serialized strings.

```ts
export interface SolanaPaperEstimate {
  version: 2;
  id: string;
  kind: 'estimate';
  mode: 'paper';
  liveExecutionEnabled: false;
  deskId: 'jesse';
  network: SolanaNetwork;
  venue: 'jupiter';
  intent: JesseIntent;
  instrumentAddress: string;
  instrumentName: string;
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  amountInRaw: string;
  amountOutRaw: string;
  inputAmount: string;
  outputAmount: string;
  requestedScaledAmount: string | null;
  effectiveScaledAmount: string | null;
  scaling: {
    multiplier: string;
    observedSlot: number;
    observedAt: number;
    nextEffectiveAt: number | null;
  };
  router: string;
  priceImpactPercent: string | null;
  feeBps: number | null;
  feeMint: string | null;
  slippageBps: number;
  minOutputRaw: string;
  providerRequestId: string;
  quotedAt: number;
  expiresAt: number;
  assumptions: string;
}
```

Contracts:

- `GET /api/desk/jesse/quote?instrumentId=...&side=...&unit=...&amount=...` returns a `SolanaPaperEstimate`, using the existing quote route/error envelope.
- Jupiter upstream: `GET https://api.jup.ag/swap/v2/order` with exact allowlisted mints, atomic `amount`, `swapMode=ExactIn`, `slippageBps=50`, no taker/receiver/referral. For the first release restrict to Metis via `excludeRouters=jupiterz,dflow,okx`, reducing RFQ expiry and transaction-validation variation. Display “Jupiter, Metis route”; do not claim best across all routers. If unavailable, fail honestly rather than switch routing policy silently.
- Header `x-api-key` stays server-side. Validate actual `router`, input/output mints, raw in/out, slippage/minimum, provider errors, and bounded fees. No transaction should be returned to the browser on this path.
- `priceImpact` is percentage points in current v2 docs; the old `priceImpactPct` is a deprecated ratio. Do not introduce a 100× display error. Missing values are unknown, never zero.
- Paper freshness policy: maximum 30 seconds from server receipt, shortened by a provider expiry or known multiplier activation. This is **Claflin's review window**, not a guaranteed provider order validity. Reject unusable/expired terms on arrival.
- `inputAmount`/`outputAmount` are human-readable amounts: USDC on the stablecoin leg and scaled units on the xStock leg. `amountInRaw`/`amountOutRaw` are atomic units. `requestedScaledAmount` is non-null only for sells; `effectiveScaledAmount` is the actual xStock leg for either side. Parsers verify these relationships against the frozen scaling snapshot, not Base's raw-unit display rules.
- A Jupiter route can span pools. Keep router/route summary from actual data; no fake single pool or Base block. A mint-read slot is evidence about metadata, not the Jupiter quote's execution slot.
- Paper assumptions state simulation at returned output, which known fees are represented, exclusion of actual settlement/gas, and no ownership/eligibility checks. Do not reuse the Aerodrome assumptions literal without revision.

### 4.3 Amount specification (Engineer 1; consumed by Engineer 2)

Let `r` be an integer atomic token amount, `d` mint decimals, and `m > 0` the effective Scaled UI multiplier:

- raw decimal token quantity = `r / 10^d`.
- displayed xStock quantity = `(r / 10^d) × m`.
- for a sell request of displayed quantity `q`, `r = floor((q / m) × 10^d)`; reject zero, overflow beyond Solana u64, or invalid precision. Show requested versus effective displayed quantity if rounding occurred. Never round spend upward.
- USDC buys parse six-decimal spend to integers; confirm the canonical USDC mint from authoritative sources and RPC rather than copying Base USDC.
- Use rational/integer decimal math for conversions. Token-2022's multiplier representation must be decoded using the supported library semantics; preserve its original observation and effective timestamp. Do not assume an 18-decimal EVM fixed-point multiplier or default missing data to one.
- Read the mint owner, decimals, extensions, current/pending multiplier and effective time. Reject unsupported/frozen/transfer-policy configurations on live preparation. Known activation within a review period shortens expiry. Recheck at live preparation and before signing; any changed material conversion needs a new review.
- Historical receipts preserve the multiplier used then, not today's multiplier. Client-side parsing of old receipts checks internal consistency against their immutable metadata snapshot, not current corporate-action values.

Exact unit fixtures: with `d=6, m=1.1`, `1_000_000` atoms display `1.1`; selling `5.5` displayed units requests `5_000_000` atoms. With `m=1.5`, selling `1` displayed unit requests `666_666` atoms and displays effective `0.999999`. Test pending activation on both sides of the boundary.

### 4.4 Market evidence contract

Engineer 1 owns types in `lib/solana/contracts.ts`; Engineer 2 owns their construction and math in `lib/solana/market/`.

```ts
export interface MarketObservation {
  feedId: number | null;
  symbol: string;
  source: 'pyth-pro';
  unit: 'usd-per-share' | 'usd-per-raw-token' | 'usd-per-scaled-token' | null;
  price: string | null;
  confidence: string | null;
  generatedAt: number | null;
  receivedAt: number;
  session: 'regular' | 'preMarket' | 'postMarket' | 'overNight' | 'closed' | 'unknown';
  status: 'fresh' | 'stale' | 'unavailable';
}

export interface MarketComparison {
  id: string;
  version: 1;
  instrumentId: SolanaInstrumentId;
  observedAt: number;
  token: MarketObservation;
  equity: MarketObservation;
  multiplier: string | null;
  status: 'comparable' | 'last-observation' | 'unavailable';
  referenceDifferenceBps: string | null;
  reasonCodes: string[];
}
```

- `GET /api/desk/jesse/comparison?instrumentId=...` returns that object; only allowlisted instruments. `GET /api/desk/jesse/marks` remains compatible with `MarksResult`, containing normalized xStock indicative marks, not underlying equity prices disguised as token prices. Enrich reference types deliberately; do not overwrite Base meanings.
- Pyth Pro ingestion runs in a dedicated Node process on the existing long-lived Hetzner backend, not in a Vercel request or a new per-user WebSocket. Use SDK redundancy across all three documented endpoints. Request `price`, `confidence`, `exponent`, `feedUpdateTimestamp`, `marketSession`, and `publisherCount`; `fixed_rate@1000ms`, JSON delivery, `formats: []` for this offchain presentation. Do not claim onchain signature verification.
- Resolve actual numeric Pyth Pro ids via the official symbology API. Do not use Core/Hermes hex ids or assume the page's Apple example proves account entitlement or price-unit semantics.
- Write latest normalized feed observations to a bounded Redis snapshot (`claflin:jesse:pyth:v1:<feedId>`), with a 7-day retention TTL; cache reads never change `generatedAt`. Track both provider envelope time and feed generation time internally: reject backwards observations, but accept a newer envelope's session/status metadata even when it carries the same older price. Deduplicate repeated envelopes across redundant connections. A retained observation is not necessarily fresh. Runbook must cover reconnects and graceful shutdown.
- E2 supplies a compiled Node entrypoint for the ingestion daemon; E4 packages it with its production dependencies. Do not assume a standalone Next build includes `scripts/` or the dev-only `tsx` runner. Validate daemon restart and retained-snapshot behavior on the staged backend.
- Browser reads comparisons every 5 seconds while visible, pauses in hidden tabs, and receives immutable `id` values. On review, pin the selected evidence snapshot; new tape updates never mutate reviewed terms or previous spoken claims.

**Comparison rules, authored for this release:**

1. Match exact token/issuer/network and the intended underlying. Prove from provider metadata/support whether the xStock feed is per raw token or per scaled/display unit. A ticker similarity is not proof. Store that mapping and its source in the catalog fixture.
2. Normalize to USD per displayed/equity-equivalent unit. If token feed `Praw` is per raw decimal token, `Pt = Praw / m`; if already per scaled unit, `Pt = Pscaled` (do not divide twice). Underlying reference `Pe` is USD per share. Use the multiplier effective at the token price's generation time, not a later multiplier read. If a corporate action lies between token/equity observations and their adjustment bases cannot be aligned from authoritative metadata, suppress comparison. If equivalence or adjustment basis is unverified, comparison is unavailable.
3. Reference difference = `10_000 × (Pt / Pe - 1)`. Compute with rational decimals; render basis points to one decimal with symmetric rounding. Label “reference difference,” not profit or executable arbitrage.
4. Freshness uses `feedUpdateTimestamp` (microseconds converted to milliseconds), not the streaming envelope timestamp. For this release, a price is fresh only when age is 0–15 seconds. More than 2 seconds in the future is invalid; a smaller future skew is labelled uncertain and not comparable. Token/equity generation times must be within 5 seconds for `comparable`.
5. `comparable` additionally requires equity `regular` session and positive finite values, verified normalization, and known confidence with `confidence/price <= 0.005` for both observations. These are conservative application display policies, not provider accuracy guarantees or trading signals. Retain confidence in matching normalized units.
6. Outside regular session, or if the equity observation is older, use `last-observation` with both absolute timestamps and a clear non-contemporaneous warning; never call it “Friday close” or “last close” without a separately verified closing-price source. A numeric historical difference is allowed only with verified units, a fresh token observation, and a nonfuture equity observation no older than 7 days. Otherwise suppress the number.
7. An unavailable comparison does not fabricate data or block an otherwise valid paper quote. For live, surface the missing evidence and rely on separately reviewed venue bounds/access policy; never imply the oracle approved the transaction.
8. Do not compare USDC-per-token Jupiter prices to USD references at assumed dollar parity. Showing a size-specific **USD** comparison later requires a timestamped USDC/USD observation; first release keeps Jupiter amounts in USDC alongside the USD reference card.

Exact fixtures: normalized token `101`, equity `100` → `100.0` bps; token `99` → `-100.0` bps. Raw-token price `110`, multiplier `1.1`, equity `100` → `0.0` bps. A stale equity value received in a new stream message remains stale. Zero denominator, missing exponent, unknown basis, excessive confidence, reversed arrival order, or future timestamps must not produce a confident spread.

### 4.5 Voice/controller contract

Engineer 3 owns `lib/jesse/`, `components/desk/JesseCall.tsx`, `JesseCall.module.css`, and voice routes under `/api/desk/jesse/voice/`. Do not edit `HettyCall.tsx`, the existing dictation endpoint, or Hetty's provider configuration to implement Jesse.

```ts
export interface DeskRevision {
  deskId: 'jesse';
  revision: number;
  sessionGeneration: number;
}
export interface JesseDraft {
  instrumentId: SolanaInstrumentId | null;
  side: 'buy' | 'sell' | null;
  unit: 'USDC' | 'scaled-token' | null;
  amount: string | null;
}
export type JesseCommand =
  | { type: 'draft'; intent: JesseIntent; quote: boolean }
  | { type: 'compare'; instrumentId: SolanaInstrumentId }
  | { type: 'explain'; topic: 'reference-difference' | 'market-hours' | 'scaled-units' | 'paper-mode' }
  | { type: 'describe' }
  | { type: 'focus'; target: 'desk' | 'evidence' | 'instruction' | 'record'; objectId: string | null }
  | { type: 'watch'; instrumentId: SolanaInstrumentId }
  | { type: 'cancel' }
  | { type: 'file-paper'; quoteId: string }
  | { type: 'clarify'; draft: JesseDraft; field: 'instrument' | 'side' | 'amount' | 'units'; question: string };
export type CommandResult = {
  status: 'applied' | 'clarify' | 'rejected' | 'stale';
  revision: number;
  quoteId: string | null;
  evidenceId: string | null;
  spokenText: string;
};
```

Engineer 1 puts these shared voice types in `lib/solana/contracts.ts` and exposes an atomic `applyJesseCommand(command, expected: DeskRevision): Promise<CommandResult>` controller seam over `useTradingDesk`. A separate pure command-policy function takes explicit draft/foreground/time. Inject E2's comparison reader and E3's readback formatter as ports; no server market client is imported into a browser module. Engineer 3's conversational parser resolves partial requests and corrections before producing a complete draft command. A comparison/read command does not silently replace a different selected instrument.

A `clarify` command clears obsolete quote authority and replaces the Jesse draft with the supplied, validated `JesseDraft`; the shared draft state and v2 Jesse checkpoint accept nullable unresolved fields, distinct from a complete `JesseIntent`. Do not coerce a missing side to buy. Preserve legacy Base draft/checkpoint semantics. The controller must support partial draft state rather than merely speaking a question over a stale populated ticket. The parser keeps slot provenance, and the UI shows missing side/amount explicitly. New speech cancels older queued confirmation actions, but does not erase the identity of the quotation being reviewed: capture that identity/revision at speech start, then permit an explicit final paper-filing command only if it is still the same freshly presented quote.

- Do not call React `edit(nextDraft)` and immediately `requestQuote()` against a stale render closure. The controller quotes the exact supplied intent and binds response acceptance to desk, revision, request, and session generation.
- Engineer 3 implements a bounded conversational layer with a deterministic command/permission controller. It must handle the supported jobs, explicit corrections, contextual explanations, and shared-object references—not just the prototype's exact sample strings. An LLM is not required by this brief and must not be introduced silently; any model/provider/prompt expansion needs a reviewed contract first. Keep financial computations and authorization outside language generation.
- Add presentation-only commands such as “show the two markets,” “bring my kept slip forward,” and “explain this.” Resolve “this” against the explicitly focused object; if none or several match, ask. `focus` may select only a known object on the active desk and never mutates, quotes, files, grants access, or submits. “Put these beside each other” means the defined equity/token comparison for the selected instrument, not arbitrary generated layouts. Archive explanations stay read-only. Supported financial turns remain compare/quote/correct/clarify/watch/cancel/explicitly file paper; unsupported conditions or products are clarified/refused, not silently simplified.
- AssemblyAI transport: client WebSocket to `wss://streaming.assemblyai.com/v3/ws`; `speech_model=universal-3-5-pro`, `sample_rate=16000`, `encoding=pcm_s16le`, `mode=balanced`, continuous partials enabled. Use verified catalog aliases for keyterms; never request the model to “correct” amounts into defaults.
- Our `POST /api/desk/jesse/voice/token` calls the documented upstream **GET `/v3/token`**, redemption 60 seconds, max session 600 seconds. Short-lived token only, `Cache-Control: no-store`; no permanent key in browser, logs, telemetry, URLs, or storage. Empty/missing credentials return unavailable—not simulated transcription. Apply explicit same-origin checks and distributed per-client/global budgets; no open paid proxy.
- Capture real 16kHz mono PCM through an AudioWorklet/resampler; do not label 44.1/48kHz samples as 16kHz. Send valid bounded audio frames, apply backpressure, and tear down all media tracks/worklets/sockets on stop, error, navigation, or desk switch. Never automatically replay audio after reconnect.
- Track `(sessionGeneration, turn_order)` for at-most-once final-turn effects. `SpeechStarted`/partial speech stops old TTS and invalidates pending confirmation. Final turns alone dispatch commands. Silence/turn-end confidence is not certainty that an amount is correct or a user approved spending.
- Playback: standalone ElevenLabs **TTS only**, through a bounded server route using the existing `ElevenLabsService.textToSpeech` seam; a new permitted `ELEVENLABS_VOICE_JESSE` id must be selected/verified. AssemblyAI remains the only microphone STT path for Jesse. TTS failure leaves exact text on screen and a retry control; never switch the ears to ElevenLabs ConvAI/Scribe.
- The TTS route accepts bounded text from the already grounded result, fixed allowed model/voice, same-origin/session budget, no arbitrary provider URL/voice selection. Never persist raw audio or complete transcripts by default. Explain provider processing at microphone consent.
- Echo cancellation is required, but do not treat it as proof against self-triggering. Test speakers as well as headphones. Provide push-to-talk fallback if duplex reliability is not accepted; describe the fallback honestly. No financial action from incidental background speech.
- Manual edits, instrument/desk/account/mode changes, archive navigation, disconnects, and new speech invalidate pending paper confirmations. “Yes” alone cannot file anything. Require a fresh, explicit “file this paper record” after the current quote has been presented; bind to its quote id and revision and dedupe repeat turns. Live signing/submission is absent from the command union.
- “What I heard” is a transcript record, not cryptographic proof of speaker identity or financial authorization. Do not fabricate a confidence percentage or signed-provider receipt.

### 4.6 Live boundary (R2)

Live is a separate proposal, not `mode: paper` with a different button. Engineer 1 owns the API/state machine; Engineer 4 owns the client wallet adapter and UI. Use Wallet Standard capabilities for Solana external-wallet connection/signing, with a version-compatible pinned Solana SDK. Do not assume existing Privy EVM hooks support Solana or auto-create a wallet. Engineer 4 verifies exact package versions and sends the dependency list to Engineer 1, who owns package installation/lockfile.

The shared `SolanaWalletPort` has `getAccount(): { address: string; network: SolanaNetwork } | null`, `connect(): Promise<void>`, `disconnect(): Promise<void>`, `signMessage(message: Uint8Array): Promise<Uint8Array>`, and `signTransaction(transaction: Uint8Array): Promise<Uint8Array>`, plus `subscribe(listener: () => void): () => void`. E4 implements it; E1 tests against it. Both signing methods return signature/signed-transaction bytes respectively and require explicit user interaction. Unsupported message-signing or transaction-signing capability blocks R2 rather than falling back to an unverified account claim.

```ts
export interface SolanaLiveProposal {
  version: 1;
  id: string;
  deskId: 'jesse';
  network: SolanaNetwork;
  mode: 'live';
  intent: JesseIntent;
  wallet: string;
  revision: number;
  reviewedEstimate: SolanaPaperEstimate;
  transactionBase64: string;
  messageHash: string;
  providerRequestId: string;
  lastValidBlockHeight: string;
  expiresAt: number;
  minOutputRaw: string;
  slippageBps: number;
  feeSummary: { networkFeeLamports: string; rentLamports: string; providerFeeBps: number | null };
}
```

- `POST /api/desk/jesse/live/prepare` accepts `{ intent, wallet, revision }`, validates access policy and mint/account/fee constraints, requests a **fresh** Jupiter order with taker and the same Metis-only policy, validates/simulates it, and returns proposal terms. No signing/submission here. Previous paper output does not bind the live quote; changed amounts/fees are shown as new terms. The embedded estimate is a normalized preview of this fresh order, not the old paper quote.
- Server stores immutable proposal binding and session ownership in Redis with bounded expiry. Bind to verified wallet/session proof using a short-lived challenge, nonce, expected origin/domain/network and replay protection; a claimed wallet address alone is not authentication. Keep paper access anonymous.
- `POST /api/desk/jesse/live/submit` accepts `{ proposalId, signedTransactionBase64, idempotencyKey }` from the authorized session, verifies exact message binding, wallet signatures, expiry and single-use state before forwarding `/execute`. Do not offer an arbitrary-transaction relay. No raw signed transaction logging or indefinite retention.
- `GET /api/desk/jesse/live/status?proposalId=...` is session-scoped and returns explicit submission/reconciliation state. Browser recovery may also read the known public signature through an allowlisted mainnet RPC status service.
- Decode the versioned message and resolve address lookup tables; validate allowed programs/instructions, expected signer/fee payer, input/output mints and owner token accounts, input debit, minimum output, network fees/rent, compute budget, and absence of unrelated transfers/approvals. Freeze a reviewed instruction/program allowlist from observed valid Metis routes; unknown program/extension semantics fail closed. Simulation alone is insufficient.
- Wallet operation: `signTransaction`, not automatic `signAndSendTransaction`. Never import a private key or provision a custodial signer. Ensure the returned signed message matches what was displayed. Verify network/account again after wallet response.
- Implement state machine `idle → preparing → review → signing → signed → submitting → submitted → confirmed|failed|unknown`, with `rejected` and `expired` branches. Persist proposal/idempotency identity and the derived signature **before broadcasting**; journal write failure blocks broadcast. Store server attempt state atomically before forwarding.
- If `/execute` times out, outcome is `unknown`, not “nothing submitted.” Reconcile the same signature; never build/rebroadcast a different order automatically. Double click, page reload, account change, and lost response cannot duplicate a swap. Retries may reconcile or retry only the exact same signed bytes under a proven provider-idempotency path, not generate fresh authority.
- Use block-height expiry for transaction validity; do not infer validity from a UI countdown alone. An unknown transaction may only be called expired/not landed after appropriate signature-status and validity evidence.
- Confirm independently from RPC transaction/status metadata; inspect `meta.err`, token balance deltas, signature, slot, and fees. Display actual amounts from chain evidence, not Jupiter quote output or a generic HTTP 200. Use `confirmed` commitment for the visible confirmed state; never label it finalized unless finalized is observed. Do not conflate journal entries with current holdings.
- Namespace browser journal `claflin.solana.live.v1.<wallet>.<signature>`; pending attempts without a signature use a separate proposal-id key. Never write Solana signatures into the EVM `0x` journal. Historical review terms remain immutable.
- Live default is off at both server and client: `JESSE_LIVE_ENABLED=false` and `NEXT_PUBLIC_JESSE_LIVE_ENABLED=false`. Neither the Base flag nor a client flag alone enables it. The lead approves enabling only after issuer/jurisdiction/product-access review and the live test gate. No planner or engineer is authorized to spend real funds by this document.

### 4.7 Presentation and continuity boundary

Engineer 1 owns the shared work/controller contracts; Engineer 4 owns the renderers. Add the following client-safe presentation contract without changing the financial schemas:

```ts
export type DeskPresentation = 'night' | 'direct';
export interface DeskPresentationState {
  mode: DeskPresentation;
  focus: 'desk' | 'evidence' | 'instruction' | 'record';
  objectId: string | null;
}
```

Mount the desk/controller and voice-session owner above the presentation subtree. Switching views changes only presentation state and a validated browser-local preference (`claflin.presentation.v1.jesse`); it must not remount the financial/session owner, refetch a quote as an implicit action, change desk/network/account or paper/live execution mode, reset the draft/revision, renew expired terms, or create/reuse authorization. If a quote expires during a transition, ordinary expiry policy still applies. In-flight operations remain the same operation. URL/view synchronization must not create a second controller.

The scene consumes a projection of validated work state. Camera movement, ledger animation, and paper transitions cannot trigger financial completion. A `focus` action never calls `file-paper` or live APIs. Keep semantic controls usable without WebGL, animation, hearing, or speech. Reduced-motion/low-graphics settings are preferences, not account capabilities.

Derive continuity only from actual saved paper records and explicit watches. Store no `experienceLevel`, `unlocked`, `expert`, or similar financial permission signal. Default Jesse R1 persistence is browser-local, not the prototype's tab-only sessionStorage; retain existing owner/desk isolation and truthful deletion/retention copy. Never migrate synthetic study records into actual history. Record/watches deletion removes their return-visit suggestions. Switching presentation retains the same saved work; switching broker/network remains a separate boundary.

At promotion, keep fixture study access in development and ensure the integrated public path fails honestly on provider/configuration errors. Do not fall back from a real request into a convincing scripted success. The public disclosure changes only when the corresponding real integration is verified, not when a feature flag is merely set.

## 5. Four parallel work packages

### Engineer 1 — Contracts, shared trading core, Jupiter, execution

**Own:** `lib/house.ts`; `lib/solana/presentation.ts`; shared `lib/trading/{domain,catalog,adapters,workflow,desk-mandate,desk-documents,paper-records,useTradingDesk,usePaperSync,voice-tools,ledger-export,desk-slips}.ts`; protocol-narrowing in retained Base execution/journal code; `lib/solana/{contracts,catalog,amounts,jupiter,proposal,execution,journal,controller}.ts`; `lib/trading/adapters/jupiter.ts`; desk quote/live routes; `app/api/paper/route.ts` validation; package manifest/lockfile. Do not touch market or voice internals owned by others.

Work order:
1. Land client-safe contracts, type guards, representative fixtures and failing legacy/isolation tests. Keep all existing Base quote fixtures valid.
2. Verify xStock identities/USDC, decimals, multiplier extensions and account access metadata; persist a sourced allowlist (no dynamic arbitrary-token catalog). Bind catalog membership to desk at every request/read/write boundary.
3. Add Jupiter paper adapter and strict protocol-specific parser; adapt request/controller, record, export, watch/draft and return-from-archive paths. Keep file confirmation idempotent.
4. Preserve existing paper v1 storage. Write Jesse records as `version: 2` under `claflin.paper.v2.jesse.<id>` with strict network/desk/quote agreement. Read both versions without rewriting old rows. Malformed or wrong-network rows cannot be imported/attributed as Jesse. The v2 wrapper carries `{ version, id, mode: 'paper', deskId: 'jesse', owner, createdAt, quote, instrumentSnapshot, comparison: MarketComparison | null }`. Freeze the actually presented comparison and instrument/scaling metadata; do not refetch/recompute while filing. Enforce bounded payloads and validate comparison instrument identity. Use `claflin.draft.v2.jesse` for nullable Jesse draft checkpoints; Base v1 keys remain untouched.
5. Keep optional account sync **Hetty-only for this release**. Add an explicit `supportsAccountSync(deskId)` gate, prevent Jesse network calls/import UI, and label Jesse records local-only. This avoids a half-migrated server schema and account/desk-switch race; it is not a claim of cloud backup. Existing Hetty sync behavior remains covered.
6. Add atomic Jesse controller (including revision/session guards and final-turn application). Base `useDeskExecution` and journal receive only narrowed Base estimates; never run their wallet/RPC hooks for Jesse. Mount one authoritative controller above both renderers. Implement presentation-only focus and preference state, explicit watch/unwatch persistence, and the view-switch invariants in §4.7. Do not add an experience/unlock score.
7. Build R2 server preparation/validation/idempotency/reconciliation and local journal; integrate the WalletPort from Engineer 4. Do not weaken transaction validation to meet the cutoff.

**Acceptance tests:** exact mixed-case mint survives round trip; invalid decoded mint rejected; Base aliases unchanged; raw/scaled examples above; pending corporate action; cross-desk quote/request/record/watch rejection; late responses after switching/editing; legacy records retained; duplicate paper save once; quote provider malformed/401/429/timeout/no route; Jupiter mint/output/fee mismatch; Solana u64 overflow; live gates listed in section 7.

**Handoff to E2/E3/E4:** exported types + fixtures; catalog mapping with sources; `applyJesseCommand`; quote API; record semantics; capabilities; live proposal API. Coordinate all breaking contract edits before merging.

### Engineer 2 — Pyth market intelligence and provenance

**Own:** `lib/solana/market/**`; `scripts/jesse-pyth-feed.ts`; `lib/trading/adapters/pyth.ts`; `app/api/desk/jesse/comparison/route.ts`; `components/solana/MarketEvidence.tsx` and `components/solana/MarketEvidence.module.css`; market fixtures/tests; a market-data operations section in the evidence handoff. Engineer 4 merges PM2/environment changes; Engineer 1 merges adapter registration.

Work order:
1. Verify Pyth access, numeric ids, exact xStock price basis, terms for display/retention, session fields, and corporate-action alignment. Report blockers immediately; do not substitute a symbol guess or an unrelated Core feed. Capture redacted schema examples and source references for E1.
2. Implement dedicated feed ingestion and Redis snapshot reader with reconnect/backoff, dedupe, staleness and partial-feed degradation. Never refresh a feed timestamp just because Redis or HTTP was read.
3. Implement deterministic normalization/comparison policy in section 4.4. Expose `readJesseComparison(instrumentId, now): Promise<MarketComparison>` and `readJesseMarks(now): Promise<MarksResult>`; both derive from the same cached evidence, never independent inconsistent calculations.
4. Supply comparison responses for live, closed/stale, missing, unknown units, corporate action, and provider outage. Freeze evidence when quotes are presented; historical evidence survives later updates as recorded.
5. Produce reviewed educational text for the four supported voice topics and concise reason-code explanations; do not produce buy/sell recommendations. Give wording to E3/E4 for shared reuse. Deliver the shared accessible market-evidence presenter to E4, with explicit timestamps/units/unavailable states and stable evidence identities. E4 arranges it spatially; E2 owns its data meaning and readable content.

**Acceptance tests:** exact arithmetic fixtures; raw-vs-scaled basis; 15-second freshness and 5-second alignment boundaries; confidence boundary; unknown session; out-of-order messages; missing/null fields; absent exponent; 7-day historical cutoff; future timestamp; closed session carried price; multiplier change; one feed drops while other remains; Redis restart or ingestion death; API reports unavailable rather than synthetic success.

**Handoff:** `MarketComparison` fixtures/readers; approved feed/units mapping; reason text; environment names; daemon startup/shutdown and freshness-health recipe. Send dependency requirements to E1 before adding packages.

### Engineer 3 — AssemblyAI conversation and spoken control

**Own:** `lib/jesse/**`; `components/desk/JesseCall.tsx`, `JesseCall.module.css`; `public/audio/jesse-pcm-worklet.js`; routes under `app/api/desk/jesse/voice/**`; `tests/jesse-voice.test.ts`, `tests/jesse-commands.test.ts`. Keep all broker-specific control logic in this directory, not copied through shared components.

Work order:
1. Implement the bounded supported-intent/slot/correction layer and shared-object references against E1's mock controller; do not promote the study parser's fixed sample phrases into the real interface. Finalize only complete, unit-safe intents. Share educational/reason wording with E2; never calculate prices inside language code.
2. Implement temporary-token route, PCM transport, lifecycle, event deduplication and cancellation. Verify the current provider contract with a short authorized session before assuming an SDK example matches production.
3. Add real standalone TTS using a permitted Jesse voice, grounded command results, interrupted-playback cancellation and text fallback. Keep provider-specific code behind a transport interface for deterministic tests.
4. Integrate compare, quote, correction, explanation, watch/cancel and bound paper filing. Hook manual edits/desk switches/archive changes into generation/revision invalidation. No live execution tool. Read return-visit context only from explicitly retained records/watches. Coordinate spoken emphasis with the same evidence/record id displayed by either renderer, and cancel stale speech/highlights together. Never infer familiarity or permissions from visit count.
5. Provide a stable component surface `JesseCall({ controller, onConnectionChange, onUserSpoken, onAgentSpoken })`; E4 mounts it only on Jesse. Provide a mock transport for E4's browser tests without real API calls.

**Acceptance tests:** provisional text no side effects; duplicate/formatted final handled once; stale session turn ignored; new instruction missing size clears it; explicit correction carries only allowed fields; “buy if”/multi-leg rejected; spoken units wrong/missing; noise/no speech; mic denied/device removed; disconnect/reconnect; speech interrupts old TTS; manual edit wins; cancel while quote pending; expired quote/old confirmation cannot file; repeated file command creates one record; TTS output cannot self-file; secrets absent; missing key is unavailable; every resource closes on switch/unmount.

**Handoff:** component/controller binding; typed-command parity; consent and fallback copy; provider configuration checklist; bounded manual test recipe and redacted observations (no raw user audio by default).

### Engineer 4 — Desk experience, wallet UI, integration QA and release

**Own:** `components/desk/**` except E3's Jesse component/styles; `components/solana/**` except E2's MarketEvidence files; `components/night-desk/**`, `lib/night-desk-scene.ts`, `app/night-desk/page.tsx`, `app/desk-study/page.tsx`; `app/page.tsx` and desk-entry query wiring; `lib/solana/useSolanaWallet.ts` and client wallet bridge; `lib/share.ts`; `e2e/**`, `playwright.config.ts`; `next.config.js`, `proxy.ts`, deployment configs and example env files; submission assets/docs. Shared domain/controller changes go to E1. Do not overwrite currently modified canonical docs without coordinating with their owner.

Work order:
1. Reuse the shipped Night Desk scene/composition and adapt it to E1's controller; keep fixture-only state and storage separate. Implement night/direct presentation switching with the same work and always-visible access. Promote /night-desk only after G3 and lead approval; keep / unchanged and /desk-study development-only. Resolve desk/view/shared-intent routing before hydration, with no transient Base write or quote and no second controller.
2. Narrow UI by quote/instrument protocol. Replace Base/Aerodrome labels only where appropriate; show Jesse units, network, route, source age, local-only records. Confirm new capability matrix is used for directory/open/closed decisions. Jesse page must never request Base allowances, sign-in, or live execution accidentally.
3. Integrate JesseCall and comparison reader. Manual ticket, typed commands and voice operate one revisioned document. Use provisional-hearing styling separate from authoritative field values. Keep numerical data accessible without narration/animation. Mount E2's evidence presenter and E3's conversational surface; do not independently rebuild their logic. First visit has no empty-history panels; return visit exposes actual saved work. No quiz, balance, paid-call or trade-count gate.
4. Implement Solana Wallet Standard connection bridge with explicit supported wallet capabilities; pass signature bytes to E1's proposal controller, never send autonomously. Show account/network/fees/minimum and distinct paper versus live actions. Test account changes, wallet rejection and unsupported wallet capability.
5. Own integration order, shared-file merge queue, end-to-end coverage, fresh-browser tests, responsive/keyboard checks, regression coverage and release review. E4 owns final spatial/art-direction coherence, not every implementation detail: E1 supplies persistence/controller tests, E2 the evidence presenter, E3 voice/attention tests. All owners supply their acceptance evidence so E4 is not a four-stream QA bottleneck.
6. Wire backend API/PM2 environment and Pyth daemon, same-origin proxy, exact AssemblyAI WebSocket CSP allowlist (no wildcard-all CSP workaround), AudioWorklet serving, voice limits and separate live gates. Stage backend/frontend together; verify the actual deployed URL, not only localhost or an HTTP 200.
7. Prepare Stocklana description, architectural diagram, source links, new-work disclosure and an authentic demonstration. The project lead approves claims and performs submission/deployment-authority actions. No new promotional renders until the real journey works.

**Acceptance tests:** direct Jesse URL and reload; mobile/keyboard/200% zoom; no mic auto-start; field correction and focus; slow/unavailable marks; late quote responses; file/read/delete/reload; export keeps historical units; Jesse→Hetty→Jesse isolation; planned desks still closed; voice session completely stops on switch; Base paper and voice regressions; gated Solana live journey including transaction ambiguity recovery; fresh anonymous judge can complete paper without credentials.

**Handoff:** tested deployed build/revision, evidence matrix, known limitations, release/rollback checklist, submission bundle and submission-receipt status. This engineer is the release captain, not the sole tester: every engineer ships tests for their owned modules.

## 6. Coordination and merge order

### Start checklist (all four can start after role assignment)

- E1: publish contracts/fixtures and own the only package/lockfile PR. Every dependency must be version-pinned, compatible with installed Next/React/Node, and preferably released at least seven days ago. No floating `latest`; do not bypass package security controls.
- E2: verify Pyth entitlement and units; ingest captured fixtures while credentials are pending.
- E3: build voice state machine against fixtures; verify AssemblyAI streaming access and permitted TTS voice.
- E4: build desk UI and wallet bridge against fixtures; prepare browser tests, integration branch, and submission draft.
- Lead: confirm remaining eligibility/submission rules, arrange required provider access through normal secret-management channels, assign product/access review, and approve any paid smoke sessions or live transaction separately. No secrets in issues or documents.

### Experience acceptance additions (all owners)

- A fresh anonymous visitor with zero records/watches can choose either presentation without a test, wallet, account, balance or trade.
- Quote/correct/review and explicit paper filing work in both views. Switching during draft, review, an in-flight request, and a live proposal preserves exact work identity and does not extend expiry or request a new signature.
- First save → reload → retrieve the same paper record; first watch → reload → unwatch. Removing work removes its return suggestion. Missing storage produces an honest error and no invented memory.
- “Explain this” with no focus clarifies; a focused archived record is described but cannot be changed or filed as the active draft. New speech cancels obsolete spoken/visual emphasis.
- Decline/cancel and low-graphics preference do not reduce available capabilities. Study sessionStorage is never interpreted as a real record or a passed eligibility check.
- Test cold arrival, return, provider failure, reduced motion and direct view on the integrated build. Prototype desktop checks do not certify real voice, mobile or live execution.

### Return handoff required from each engineer

Provide your branch/commit, owned files, implemented contracts, exact test commands/results, provider versus fixture evidence, setup variables by name only, and open blockers. Include first-visit/return and failure cases for your surface. E4 assembles one integrated branch and a concise handoff for the project lead's review; no one independently enables R2, replaces the homepage, or changes the financial thresholds. Keep incompleteness visible rather than marking the whole stream done because its happy path works.

### Dependency graph

```text
                         E1 contracts + sourced catalog
                         /             |             \
               E1 quotes/core     E2 evidence     E3 voice controller
                         \             |             /
                          E4 integrated R1 desk + QA
                                      |
                 E1 live validation <-> E4 wallet/review/recovery
                                      |
                       lead-approved R2 evidence gate
                                      |
                      submission / optional later revision
```

The contract PR is the intentional shared dependency. Do not pretend four isolated branches can independently invent the domain model and merge cleanly. After contracts, E2/E3/E4 need only fixture interfaces, not a finished live adapter, to make progress.

### Integration gates (work order, not completion-time promises)

| Gate | Deliverable | Owner/signoff |
|---|---|---|
| G0: proof and contracts | September 25 deadline recorded; identity and unit evidence; provider-access checks; types/fixtures; package choices | E1 + E2 + E3; lead resolves access/rules |
| G1: first vertical slice | Integrated Jesse entry → manual real Jupiter quote → validated paper file → reload; no Base/study-data leakage | E1 + E4 |
| G2: differentiated desk | Duplex evidence + closed-market warnings + real AssemblyAI conversation/correction + actual TTS + shared night/direct work | E2 + E3 + E4 |
| G3: submission-ready R1 | Real provider checks, first/return-visit and view-parity acceptance, regression pass, truthful demo and known limitations | E4 + lead |
| G4: R2 live | Product-access signoff, transaction policy, wallet tests, approved live evidence and reconciliation | E1 + E4 + lead |
| G5: submission | Receipt verified before confirmed September 25 cutoff; links playable/reachable; exact delivered scope | lead, E4 prepares |

The confirmed September 25 deadline makes R2 controlled live execution the full build target. Keep the same four-engineer split and prioritize integration, transaction recovery, and real-user testing over additional bounty tracks. Submit an accepted R1 early where submission rules permit, then revise toward R2 before the confirmed cutoff. If G4 remains blocked, the lead must explicitly approve and disclose the R1-only contingency; do not silently abandon live work or weaken its release gates.

Use one branch/working copy per engineer. Suggested branch names: `stocklana/core`, `stocklana/market`, `stocklana/voice`, `stocklana/experience`; release captain integrates to `stocklana/integration`. Do not create/reset branches over the current dirty tree. Use short PRs by gate; no shared ownership of `WorkingDesk`, `domain`, or the lockfile. Each PR describes contracts consumed, tests passed, and unverified provider assumptions. Never force-push/rewrite shared history to resolve integration conflicts.

## 7. Verification and release acceptance

Before code edits, read `AGENTS.md` and relevant guides in the installed `node_modules/next/dist/docs/`. Dependencies were installed during prototype work; each engineer must verify their own environment before assuming it is ready. Prefer Devin Cloud or another approved remote workspace for builds, servers and browser QA: the user requested avoiding local rendering/performance load. Desktop prototype QA passed; mobile was deferred and still needs its own acceptance pass. The repository's `prepare` script changes git hooks configuration: do not let setup unexpectedly modify the user's git config. Select an install procedure that does not run that lifecycle hook, then handle any required dependency build scripts explicitly without weakening security settings.

Existing test runner is Node test through `tsx`, not Vitest/Jest. Existing Playwright configuration has one Chromium project and can reuse a dev server; do not treat that as Safari/mobile coverage. Do not rerun or kill another engineer's server/browser session.

### Narrow developer commands

New test names below are deliverables, not files that exist yet. Existing test names were verified in the repo.

```bash
pnpm exec tsx --test --test-concurrency=1 tests/solana-core.test.ts tests/solana-jupiter.test.ts tests/solana-execution.test.ts tests/desk-isolation.test.ts tests/trading-workflow.test.ts
pnpm exec tsx --test --test-concurrency=1 tests/jesse-market.test.ts
pnpm exec tsx --test --test-concurrency=1 tests/jesse-voice.test.ts tests/jesse-commands.test.ts
pnpm exec playwright test e2e/jesse-desk.spec.ts
```

Each owner runs the applicable line; E4 doesn't re-gate unchanged modules on every merge. Use fake clocks, stub fetch/RPC/Redis, fake wallet signatures, and injected voice transport for repeatable tests. Fixtures must be labelled simulated, and no unit/browser test should place a trade or spend provider credits by default.

### Final combined gate, once per release candidate

```bash
pnpm test
pnpm typecheck
pnpm exec next build --webpack
pnpm exec playwright test
```

Use direct Next build, not `pnpm build`, because its postbuild invokes destructive standalone cleanup. Read the deployment docs before packaging separately. Check lint with the actual current config; README reports a historical mismatch but that is not proof of today's result. Run targeted lint on changed owned files and report genuine baseline failures separately; do not disable security rules/hooks to make a gate green.

### Evidence matrix (fill with links/results before release)

| Evidence | R1 required | R2 required |
|---|---|---|
| Official mint/program/decimals/multiplier match and USDC identity | Yes | Rechecked during preparation |
| Real mainnet Jupiter quote without wallet; exact input/output units | Yes | Fresh taker-bound terms |
| Real Pyth feed mapping/unit semantics and observed timestamps | Yes for comparison claim | Same; no oracle authorization claim |
| Real AssemblyAI microphone session and correct finalized turn | Yes for voice claim | Same |
| Real TTS heard; interruption and text fallback tested | Yes | Same |
| Browser paper file/reload and wrong-desk rejection | Yes | Same |
| Chrome + Safari microphone path; Android/iOS browser checks or explicit unsupported labels | Yes | Wallet compatibility separately |
| Manual, keyboard, reduced-motion, 200% zoom and 360px layout | Yes | Yes |
| Unit/integration/provider failure/timeout coverage | Yes | Yes |
| Product-access/issuer/jurisdiction policy reviewed and enforced | Accurate paper disclosure | Mandatory live signoff |
| Altered signed message / unrelated transfer / wrong signer / expired blockhash refused | N/A | Yes |
| Double-submit/reload/timeout reconciles same attempt, not a new swap | N/A | Yes |
| Separately authorized small mainnet buy and sell with chain evidence | N/A | Required before claiming both live directions |
| Fees and actual token deltas shown accurately; unknown outcome recovery | N/A | Yes |
| Deployed frontend/backend revision alignment, API proxy, CSP, no fixture fallbacks | Yes | Yes |

Real paid provider tests require owner-approved budget. Record test setup, command/scenario, revision, result and redacted evidence; do not publish wallets/transcripts without consent. A read-only quote is not a fill; a mocked wallet isn't evidence of mainnet compatibility.

### Measurement recipe, not marketing numbers

For a consented rehearsal capture monotonic timestamps for microphone start, provider speech-start, first partial received, final turn received, command applied, quote received, and TTS first audio. Record per-session traces and errors; distinguish network/provider time from browser time. Do not infer voice latency from Solana block time. Publish only measured figures with sample count, device/network, start/end definition and failures included. No fixed “98% confidence,” zero-error claims, or response-time claims copied from vendor marketing.

## 8. Access, risks, and fallback decisions

| Risk / unresolved fact | Owner and required next action | Honest fallback |
|---|---|---|
| Submission completion | Deadline resolved by official extension; E4 prepares and lead verifies acceptance | Submit before September 25, 16:00 ET; retain receipt |
| Pyth Pro entitlement/display rights or xStock feed units not established | E2 obtains access and explicit basis evidence; lead handles paid access | Hide numerical comparison and disclose blocker; not a completed Pyth bounty entry |
| Exact xStock mint/scaled-amount/transfer restrictions | E1 sources issuer metadata + RPC and policy review | Keep instrument disabled; no fake or substitute mint |
| Jupiter API credentials/current routes | E1 validates v2 contract and real quote; lead provides access | Explicit unavailable; fixtures only in test/demo mode, never production fallback |
| Unsupported Token-2022 route/wallet | E1/E4 identify unsupported capability before enablement | R1 paper; R2 stays gated |
| Voice/TTS unavailable | E3 reports entitlement/config problem, lead resolves | Manual/typed desk and text response; do not claim a verified voice demo |
| Dangerous partial/correction ambiguity | E3 + E1 enforce final-turn/revision policies | Clarify; no autoquote from uncertain input |
| Live transaction validation incomplete | E1 + lead security/access review | Live off; continue work visibly, disclose not live |
| Scope/integration overruns | E4 reports gate status, lead chooses contingency | Reduce instruments/decoration/optional features before safeguards |
| User comprehension not validated | E4 runs representative fresh-user task tests | Fix terminology/flow before adding features |

Required configuration names (no values in this document): `SOLANA_RPC_URL`, `JUPITER_API_KEY`, `PYTH_PRO_API_KEY`, existing Redis settings, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_JESSE`, `JESSE_LIVE_ENABLED`, `NEXT_PUBLIC_JESSE_LIVE_ENABLED`. Introduce `NEXT_PUBLIC_JESSE_ENABLED` for staged desk exposure with a corresponding server capability gate; E4 wires both consistently. Use existing secrets tooling, not committed dotenv values.

Feature flags are rollout controls, not authorization. Server must enforce live permissions, transaction policies, and rate budgets even if a client toggles flags. Avoid paid endpoints that accept arbitrary request content/hosts. Never log temporary-token URLs, signed transaction payloads, raw audio, or private credentials.

Initial application limits (lead-authored conservative defaults, not claims about venue capacity):

- Paper: buy at most 10,000 USDC; sell at most 1,000 scaled units; 50 bps slippage parameter. Live: buy at most 100 USDC or sell at most 1 scaled unit per proposal, 50 bps slippage, absolute quoted price impact at most 1%, known provider fee at most 50 bps, and network fees plus rent at most 5,000,000 lamports. Missing required fee/impact data blocks live preparation; no silent increase to obtain a route. These caps do not authorize a real trade or establish suitability.
- Quote/prepare upstream timeout 10 seconds; TTS timeout 15 seconds; submit timeout 20 seconds transitions to unknown/reconciliation, never automatic fresh submission. Reconciliation polls every 3 seconds for up to 60 seconds in the foreground, then retains an unknown/pending entry with explicit retry-status control and resumes on reload.
- Atomic Redis budgets: voice tokens 3/minute and 10/hour per client, 100/hour globally; TTS 12/minute per session, 600 characters/request, 100,000 characters/day globally; quotes/prepares 20/minute per client, 120/minute globally. Return 429 with retry information. Client identity combines a server-issued session and trusted-ingress IP handling; client-supplied forwarding headers alone cannot evade limits. If shared budget storage fails, paid voice/live preparation fails closed; reading existing records remains available.
- Live proposals and signing challenges expire within 60 seconds, shortened by actual block/quote validity; consumed nonces cannot be reused. Reconciliation attempt metadata survives proposal expiry for 30 days; raw signed transaction bytes need not survive the immediate forwarding attempt. Browser records remain local until explicit deletion, with a visible retention notice.
- The lead reviews any changes to amount/slippage/fee thresholds or budgets as policy changes, not a quick provider-error workaround.

Rollback: turn off Jesse exposure/voice/live independently as appropriate and roll frontend/backend to the previously tested pair. Keep records readable and transaction-status reconciliation available for already-submitted attempts even when new live preparation is disabled. Do not delete data or stop pending-outcome reconciliation to simplify rollback.

## 9. Submission and demonstration

Prepare an authentic approximately 2–3 minute capture (not a rendered feature promise):

1. State the user problem: an equity reference and a token venue are different markets with different hours, units and executable terms.
2. Open Jesse directly, identify the actual xStock mint/network and displayed units.
3. Ask for comparison; show live evidence and its timestamps. If markets are closed, demonstrate the truthful historical/closed label. Never force a production “market open” state for the video.
4. Speak a size, interrupt/correct it, show a single revised quote and the stale quote losing authority.
5. Explain briefly why the difference is not guaranteed profit; choose to file paper or explicitly sign if R2 passed. Show the right completion language and return after reload.
6. Show one failure/refusal (missing amount, stale evidence, or unsupported command) and manual recovery.
7. End with architecture and exact scope: Solana xStocks/Token-2022 + Jupiter + Pyth evidence + AssemblyAI STT + application controller + standalone TTS. State which services do what. Also show that a new visitor can use the Night Desk immediately, switch to direct view without losing the instruction, and return to an explicitly saved record. Do not present the experience as an earned tier.

Release captain prepares: public source link, deployed demo link, playable video, project description, target user/problem, architecture, new-versus-preexisting work, supported instruments, observed test evidence, known limitations, license/dependency/asset provenance. A slide deck is optional for Stocklana unless the actual submission form demands one; do not consume the critical path making one by default. Check required form fields early.

Lead verifies every submission claim. Do not reuse the existing promo's sub-200ms or model/confidence claims without proof. Do not say that AssemblyAI interprets investment intent or calculates Pyth comparisons—the application does that. Do not say “live trading” unless G4 passed. Make the deployed entry link explicit so judges don't land on Hetty and miss the Solana work.

## 10. Source references and verification limits

Authoritative pages consulted September 16, 2026:

- Stocklana tracks and judging (page retains superseded September 18 rules text): https://hackathons.solana.com/hackathons/stocklana
- Deadline extension: official @solana announcement dated September 15, supplied verbatim by the user in this session: “a deadline extension to market close on September 25 @ 4 PM ET.” No post URL was supplied; do not invent one.
- Jupiter Swap v2 order schema: https://developers.jup.ag/docs/api-reference/swap/order
- Jupiter order/sign/execute flow: https://developers.jup.ag/docs/swap/order-and-execute
- xStocks developer model: https://docs.xstocks.fi/developers
- xStocks multiplier/Token-2022 model: https://docs.xstocks.fi/developers/multipliers.md
- Pyth Pro access/SDK: https://docs.pyth.network/price-feeds/pro/getting-started
- Pyth Pro subscriptions/redundancy: https://docs.pyth.network/price-feeds/pro/subscribe-to-prices
- Pyth payload units, market session and carried prices: https://docs.pyth.network/price-feeds/pro/payload-reference
- Pyth feed discovery: https://docs.pyth.network/price-feeds/pro/price-feed-ids
- Pyth official symbology endpoint linked there: https://pyth.dourolabs.app/v1/symbols
- AssemblyAI streaming WebSocket schema/events: https://www.assemblyai.com/docs/streaming/api-spec/streaming-websocket
- AssemblyAI temporary-token API: https://www.assemblyai.com/docs/api-reference/streaming-api/generate-streaming-token

Docs establish interfaces, not account access, liquidity, numeric feed/mint mappings, wallet compatibility, regulatory eligibility, or live execution success. Those remain G0/G4 evidence tasks. Exact mint addresses, numeric feed ids, and new SDK versions are deliberately not invented here. Any provider-schema surprise is a contract blocker: report it to the contract owner, update the reviewed interface/fixtures, and only then resume implementation.
