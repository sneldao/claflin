# Desks — per-desk mechanics

**Merged 2026-11-17** from JESSE_DESK, JESSE_MARKET_EVIDENCE and METEORA_LAUNCH_DESK (single-source consolidation; full prior text in git history). This is the one doc for per-desk mechanics. §-references in code and other docs to `METEORA_LAUNCH_DESK.md` (e.g. [`components/desk/foyer-receipts.ts`](../components/desk/foyer-receipts.ts) and ROADMAP §12 pointers) resolve to the §-headings of the Halley section below, and `tests/foyer-disclosure.test.ts` checks the Halley devnet tx signatures here. House context: [docs/README.md](README.md), [docs/PRODUCT.md](PRODUCT.md), [docs/ARCHITECTURE.md](ARCHITECTURE.md), [docs/HISTORY.md](HISTORY.md).

- [Jesse — Solana desk](#jesse)
- [Jesse market evidence — Pyth Pro verification handoff](#jesse-market-evidence)
- [Halley — Meteora launch desk](#halley-meteora-launch-desk)
- [Other desks (pointers)](#other-desks-pointers)

<a id="jesse"></a>
## Jesse — Solana desk

**Status:** House foyer and offering book on first visit; Jesse opens through an eligible Backed xStock offering or the direct `/?desk=jesse` deep link. Seated paper desk open when `NEXT_PUBLIC_JESSE_PAPER_ENABLED` is not `false` (default on). Stocklana entry: `/?desk=jesse&view=room`; offering-aware entry may include `?offering=<solanaOfferingId>`. Jesse ConvAI line wired; Room/Compact are presentations of the same controller (`/?desk=jesse&view=room|compact`). **Pyth Pro** equity-versus-xStock evidence (raw-token basis verified 2026-09-21; Lazer→file daemon, see `lib/solana/market/snapshot-file.ts`). **Venue duplex** and **PreStocks** remain as free/secondary evidence. **Live settle** (Jupiter order → wallet sign → execute) opens when both `NEXT_PUBLIC_JESSE_LIVE_ENABLED=true` and `JESSE_LIVE_ENABLED=true` are set; the ticket defaults to paper with an explicit live toggle. `/night-desk` redirects to Jesse Room view; fixture study at `/night-desk?study=1` (and `/desk-study` in development).

### Product bar

Jesse is a first-class Claflin desk: same room craft as Hetty, real Jupiter Metis paper quotes, explicit v2 paper filing that survives reload, honest market evidence (including unavailable), and an env-gated live Solana settle path that never pretends to be paper.

### House model

```text
Foyer → visitor instruction → concrete offering
         └─ eligible desk (Jesse for Backed xStocks / Solana)
              └─ one controller per desk
                   ├─ view=compact → seated composition
                   └─ view=room  → NightDeskScene + HTML work overlays
```

The offering chooses the concrete product/mandate/rail/venue. Desk eligibility comes from catalog coverage; Room and Compact are presentations of the same work — never remount finance, never invent quotes.

### Entry

- Fresh visit → Claflin foyer and house book. An instruction resolves to concrete offerings; a Jesse-covered Backed xStock offering can then open Jesse.
- Deep link: `/?desk=jesse&view=room` (Stocklana submission URL) or `/?desk=jesse` / `/?desk=hetty`. A deep link remains valid without an offering.
- Offering context: `/?desk=jesse&offering=<solanaOfferingId>` preselects that instrument through Jesse's controller only when the catalog offering explicitly covers Jesse; mismatched offering parameters are removed.
- Presentation: `?view=room` or `?view=compact` (per-desk preference in `claflin.presentation.v1.<deskId>`)
- Canonical Room view: `/?desk=jesse&view=room` (also reached via `/night-desk`)
- Last open desk remembered in `claflin.desk.v1.last`
- House directory → switch desks without losing parked work
- Surface: [`components/desk/JesseDeskSurface.tsx`](../components/desk/JesseDeskSurface.tsx)
- Authority: [`createJesseController`](../lib/solana/controller.ts) via [`useJesseDesk`](../lib/solana/useJesseDesk.ts)
- Hetty’s Base documents never load for Jesse (`usesLegacyDeskDocuments` in [`lib/desk/registry.ts`](../lib/desk/registry.ts))
- Submission pack: `STOCKLANA_SUBMISSION.md` (judges open `/?desk=jesse&view=room`)

### Storage keys

| Key | Purpose |
|---|---|
| `claflin.paper.v2.jesse.*` | Filed paper records |
| `claflin.draft.v2.jesse` | Draft checkpoint |
| `claflin.watched.v2.jesse` | Explicit watches |
| `claflin.presentation.v1.jesse` | Room/compact view preference |
| `claflin.jesse.live.v1.*` (Redis / memory) | Short-lived live proposals (server) |

Legacy `claflin.paper.v1.*` rows are untouched. Account sync is Hetty-only.

### Ports

- Quote: `GET /api/desk/jesse/quote` → Jesse runtime coverage → Jupiter adapter → `parseJesseEstimate` (optional `JUPITER_API_KEY` for higher rate limits; keyless works)
- Compare (Pyth Pro): `GET /api/desk/jesse/comparison?instrumentId=sol:…` → snapshots from the Lazer daemon's host-local file (`PYTH_SNAPSHOT_FILE`, default `/opt/claflin/state/pyth-snapshots.json`); normalizes raw-token prices by mint multiplier; honest `unavailable` when feeds/multiplier missing
- Venue duplex (free): `GET /api/desk/jesse/venue-duplex?instrumentId=sol:…` → Backed public `price-data` when present, else Jupiter Price v3 `stockData`, versus Jupiter venue `usdPrice` — evidence only, never labelled Pyth
- Marks: `GET /api/desk/jesse/marks` → Jesse mark adapter ([`lib/trading/adapters/jupiter-marks.ts`](../lib/trading/adapters/jupiter-marks.ts)) → observed marks built from the same venue-duplex read; the venue leg is the mark and a comparable issuer/stock reference rides along as `stockReference` with `differenceBps`. Feeds the desk tape, the foyer wire, Jesse's broker take and the ticket's onchain-versus-reference gap strip, so those surfaces cannot disagree with the evidence panel
- PreStocks (secondary): `GET /api/desk/jesse/prestocks` → issuer mark vs tokenPrice duplex; evidence only, not paper-filing
- Live prepare: `POST /api/desk/jesse/live/prepare` → fresh Metis `/order` with `taker` (both live flags required)
- Live submit: `POST /api/desk/jesse/live/submit` → message-bound signed tx → Jupiter `/execute`
- Live status: `GET /api/desk/jesse/live/status?proposalId=…`
- Voice token: `POST /api/desk/jesse/voice/token` → AssemblyAI short-lived token, or 503 when unconfigured
- Voice session: `POST /api/desk/jesse/session` → ElevenLabs ConvAI signed URL

### View

Room / Compact is a preference only (`claflin.presentation.v1.jesse`). Toggle on the desk or use `?view=room|compact` (legacy `night|direct` still accepted). Room mounts the approved 3D scene with the same ticket, line, and ledger as Compact — scene focus never authorizes money. Switching never remounts the controller, re-quotes, or resets the draft. `/night-desk` redirects to Room view; `?study=1` keeps the fixture study. The room reacts to the work: fresh tape readings warm the lamp (shared scene `tape` channel), and filing lands a stamp ceremony — slam, thud, sheen, staggered receipt — with the just-filed ledger line dropping in 450ms later. No second motion library; CSS + the existing synth in [`lib/sounds.ts`](../lib/sounds.ts) only.

### Command grammar

Typed bar and speech parser: [`lib/jesse/speech.ts`](../lib/jesse/speech.ts). Examples:

- `buy 100 USDC of Apple`
- `compare NVIDIA`
- `file this paper record`
- `cancel`

Missing amounts never inherit. Unknown tickers never resolve to the catalog. Live settle is a separate UI path (wallet sign) — not a voice tool in this release.

### Evidence honesty

- **Pyth panel:** equity vs xStock from Pro/Lazer snapshots. Token basis is `usd-per-raw-token` (verified 2026-09-21). Filing does not wait on evidence. Quiet Pyth Pro credit on the panel.
- **Venue duplex:** free Backed/Jupiter reference vs Jupiter venue USD when Pyth snapshots are cold. The same read backs the `marks` adapter, so the tape, broker take and gap strip share one number with the evidence panel.
- **PreStocks:** SPV issuer mark vs issuer token price — secondary bounty track only.

### Live settle (gated)

Implements build-plan §4.6 slice: prepare → review → `signTransaction` → execute. Defaults **off**.

| Env | Role |
|---|---|
| `NEXT_PUBLIC_JESSE_LIVE_ENABLED=true` | Shows the settle UI; sets `DESK_CAPABILITIES.jesse.live` |
| `JESSE_LIVE_ENABLED=true` | Server accepts prepare/submit/status |

Neither flag alone enables real funds. Per-order limits: **250 USDC** buy / **10** scaled sell. Paper filing stays the default option alongside live. Execute timeout → `unknown` — reconcile the same signature; do not resign a different order. UI: paper/live toggle on [`JesseTicket`](../components/desk/JesseTicket.tsx) + [`JesseLiveSettle`](../components/desk/JesseLiveSettle.tsx). Wallet: Phantom/Solflare-shaped browser port ([`lib/solana/wallet.ts`](../lib/solana/wallet.ts)). Capability probe: `GET /api/desk/jesse/live/status` (no `proposalId`).

```bash
NEXT_PUBLIC_JESSE_LIVE_ENABLED=true
JESSE_LIVE_ENABLED=true
```

### Voice agent

Provisioned like Hetty — separate ElevenLabs ConvAI agent, Solana/xStock prompt, client tools executing against `applyJesseCommand` in the browser:

```bash
node --env-file=.env.local scripts/create-jesse-agent.mjs   # once
node --env-file=.env.local scripts/update-jesse-agent.mjs   # prompt/tools refresh
```

| Env | Purpose |
|---|---|
| `ELEVENLABS_AGENT_JESSE` | ConvAI agent id (never shipped to the browser) |
| `ELEVENLABS_VOICE_JESSE` | Brian (`nPczCjzI2devNBz1zQrb`) — TTS + agent voice; distinct from Hetty’s Rachel |

Session mint: `POST /api/desk/jesse/session`. Call surface: [`JesseCall`](../components/desk/JesseCall.tsx) — lift the receiver or press `H`. `DESK_CAPABILITIES.jesse.voice` is `elevenlabs-convai` when paper is open. AssemblyAI dictation/`/api/desk/jesse/voice/token` remains for the Stocklana streaming path.

Jesse has a second carrier too: `JesseCallAssemblyAI` runs the same prompt and client tools on AssemblyAI's Voice Agent API (see `ASSEMBLYAI_VOICE_AGENT.md`; `?line=` per visit, `NEXT_PUBLIC_JESSE_VOICE` per deployment). On an unpinned visit, a carrier that cannot open the line hands the pending ring to the other once — establishment failures only, never mid-call or mic denial; a pinned `?line=` never swaps.

### Known limits

- Venue-duplex-derived marks feed the same tape/wire/take/gap-strip as the evidence panel (adapter in `lib/trading/adapters/jupiter-marks.ts`)
- Pyth numerical compare needs the Lazer daemon writing the snapshot file (`PYTH_PRO_API_KEY`) — without snapshots the panel stays honest-unavailable
- Venue duplex is free evidence, not Pyth Pro quality or an exchange print
- PreStocks is evidence-only — not filed as xStock paper
- Live settle requires both flags; instruction-allowlist / wallet challenge auth from the full R2 plan are not yet complete
- Hearable Solana-native phrases on the Jesse lead (quote / correct / compare / refuse)
- Account call-transcript sync stays Hetty-only
- Stocklana judges should open `/?desk=jesse&view=room` — see `STOCKLANA_SUBMISSION.md`

### Flags

```bash
# Close Jesse’s seated desk
NEXT_PUBLIC_JESSE_PAPER_ENABLED=false

# Enable live Jupiter settle (both required)
NEXT_PUBLIC_JESSE_LIVE_ENABLED=true
JESSE_LIVE_ENABLED=true

# Pyth Pro Lazer daemon (server)
PYTH_PRO_API_KEY=
```

<a id="jesse-market-evidence"></a>
## Jesse market evidence — Pyth Pro verification handoff

E2 work item 1 output, per `STOCKLANA_BUILD_PLAN.md` §4.4 and the Engineer-2 work order. Symbology verified **2026-09-17**. Unit basis verified from live Lazer samples **2026-09-21** (All Access trial).

### Verified feed mapping

Resolved via the official Pyth Pro symbology API (`https://pyth.dourolabs.app/v1/symbols`, linked from https://docs.pyth.network/price-feeds/pro/price-feed-ids). No Core/Hermes hex ids are used anywhere; the ids below are numeric Pyth Pro (Lazer) ids.

| Instrument | Equity feed (USD/share) | Token feed | Redemption-rate feed |
| --- | --- | --- | --- |
| AAPLx (`sol:XsbE…zJp`) | `922` Equity.US.AAPL/USD | `1792` Crypto.AAPLX/USD | `1791` Crypto.AAPLX/AAPL.RR |
| NVDAx (`sol:Xsc9…qEh`) | `1314` Equity.US.NVDA/USD | `1833` Crypto.NVDAX/USD | `1832` Crypto.NVDAX/NVDA.RR |
| TSLAx (`sol:XsDo…oB`) | `1435` Equity.US.TSLA/USD | `1847` Crypto.TSLAX/USD | `1846` Crypto.TSLAX/TSLA.RR |

The machine-readable source of truth is `lib/solana/market/feeds.ts`.

Symbology metadata observed for all six spot feeds: `state: stable`; equity feeds are `asset_type: equity`, `instrument_type: spot`, `exponent: -5`, sessions `regular` (09:30–16:00 America/New_York, Mon–Fri, exchange holidays closed), `pre_market`, `post_market`, `over_night`; token feeds are `asset_type: crypto`, `instrument_type: spot`, `exponent: -8`, 24/7 schedule; redemption-rate feeds are `asset_type: crypto-redemption-rate`, `instrument_type: rate`, `exponent: -8`, 24/7.

### Payload contract (verified against the payload reference)

https://docs.pyth.network/price-feeds/pro/payload-reference (2026-09-17):

- Requested properties: `price`, `confidence`, `exponent`, `feedUpdateTimestamp`, `marketSession`, `publisherCount`.
- `marketSession` values: `regular`, `preMarket`, `postMarket`, `overNight`, `closed` — matches the `MarketObservation.session` enum.
- `feedUpdateTimestamp` is microseconds since epoch and names when the price was *generated*. Freshness decisions use `feedUpdateTimestamp`, never the envelope time.
- Actual price = `price × 10^exponent`.
- Delivery: JSON, `fixed_rate@1000ms`, `formats: []` (offchain presentation; no onchain signature claim is made).

### Unit basis — verified 2026-09-21

Live Lazer samples under All Access trial entitlement showed `notEntitled: []` for all nine feeds. Observed relationships:

- AAPL / NVDA: `Pt ≈ Pe × R` (redemption rate) within ~3 bps, while `|Pt − Pe|/Pe` was larger.
- TSLA: `R = 1`, so both relations coincide.
- RR values matched Backed Scaled UI Amount multipliers for the same mints.

Conclusion: token feeds price **USD per raw token** → `tokenUnitBasis = 'usd-per-raw-token'`. Comparison divides by the mint multiplier effective at the token price’s generation time (never twice).

### Access / entitlement status

- Trial key entitled **All Access** (excl. 24/7 Pyth Indices) through end of trial (Marc Tillement / Pyth, 2026-09-21).
- Daemon: `scripts/jesse-pyth-feed.ts` merges Lazer rows in memory and atomically flushes a host-local snapshot file (`/opt/claflin/state/pyth-snapshots.json`, override `PYTH_SNAPSHOT_FILE`) every 8s; the comparison route reads the file. No Redis in this path — it was moved off Upstash after per-row writes exhausted the shared free-tier request quota. Env: `PYTH_PRO_API_KEY` only.
- Key is server-side only; never shipped to the browser.
- Public credit: evidence panel links Pyth Pro with Stocklana thanks.

### Sources

- Symbology: https://pyth.dourolabs.app/v1/symbols (2026-09-17)
- Payload reference: https://docs.pyth.network/price-feeds/pro/payload-reference (2026-09-17)
- Feed-id discovery doc: https://docs.pyth.network/price-feeds/pro/price-feed-ids (2026-09-17)
- Subscribe: https://docs.pyth.network/price-feeds/pro/subscribe-to-prices

<a id="halley-meteora-launch-desk"></a>
## Halley — Meteora launch desk

> **Reading note.** This is the Meteora design for **Halley** — the launch desk. The product identity is **Halley**, the Solana rail is the *market*, and **Meteora DBC** is the *venue* on that market. The three are not synonyms. The product is "Halley · Solana · Launch desk · venue Meteora DBC." See `DESK_CANON.md` §"Edmond Halley" and the canon module [`lib/desktop.canon.ts`](../lib/desktop.canon.ts).

**Status:** **SCOPE 1 BUILT — live launch implemented behind dual flags, devnet-verified (no mainnet mint yet); slip UX Phases 1–5 complete (§12).** Halley is the seated fourth desk (LINE 4, Edmond Halley, "The Comet Caller"), in the same sequence as Tennie/Jay on the Roadmap. It reuses every shared seam the house already owns (mandate → offering → desk runtime → adapters → controller → voice → dual-env flags → paper/live split), does not touch Jesse's verified-catalog integrity, and does not move any approved work. The house is **venue, not issuer** — the launched mint is a tracker/exposure token, never stock ownership.

Dated amendments (oldest first; the §-numbers below are this section's headings):

- **2026-10-01** — Prepared; repositioned under `WORLDS_FAIR_PLAN.md`: the World's Fair entry does not depend on this desk — the main submission is the house tagged Solana + Base + Robinhood Chain, and the Meteora DBC prize is a Superteam Earn sidetrack (~$20K), not a main track. Halley is attempted only if Tennie's marks slice lands and the devnet spike is green.
- **2026-10-02** — Devnet spike green (§11): full Token-2022 pair lifecycle (create → trade → DAMM v2 migrate) proven end-to-end.
- **2026-10-03** — Approved and landed: pair-first launch configuration, USDC fallback, tracker/exposure token framing (never stock ownership), Pyth-anchored estimates, paper records, and the ConvAI voice line (§10).
- **2026-10-10** — Live launch path landed (`lib/meteora/live-*`, `/api/desk/halley/live/*`, `HalleyLiveLaunch`) behind `HALLEY_LIVE_ENABLED` + `NEXT_PUBLIC_HALLEY_LIVE_ENABLED` (§7); the production builder deployed a working DBC launch on devnet end-to-end (`pnpm exec tsx scripts/halley-devnet-launch.ts`).
- **2026-10-13** — Integration deepened: launch profiles now cover fee schedule (anti-snipe exponential decay 50%→1%, session/volatility fee when the equity tape rests), liquidity (conviction: 50% permanently locked + 90-day creator vesting), and post-graduation (Customizable DAMM v2 config — dynamic fee or compounding). The price band is an explicit `bandBps` on the intent (house defaults 10%/50%/200% by curve). `graduationQuote` now means *quote collected at migration*, sized via `supplySplitFor` — the earlier market-cap reading is gone. New participant surface: `/api/desk/halley/live/swap` + `/live/claim` + `/live/tx` (wallet-signed buy/sell on the curve and partner fee claims, SPL quotes only — Token-2022 quote pools are refused `coverage_pending`), `/api/desk/halley/presets` (five SDK-validated presets for other builders, pay-to-use via `poolCreationFee` once published on-chain), and `/api/desk/halley/pool-status` now follows the launch through graduation — the DAMM v2 pool's price, liquidity, and premium/discount against the equity anchor. Conviction launches vest the unsold remainder on-chain (30-day cliff, daily over a year). Slip UX Phases 1–5 complete (§12). Still open: a real mainnet launch (operator key required — `scripts/halley-publish-presets.ts` + `halley-devnet-launch.ts` are the mechanics), and DLMM conviction-pool execution (the estimate carries the plan; nothing submits it).

### §1 — The decision being proposed

A **voice-driven, fundamental-anchored price-discovery launch of a tokenized equity (or equity pair)** onto a Meteora **DBC** bonding curve, graduating into **DAMM v2** liquidity. The defensible core, in one line:

> When a tokenized stock is newly issued or thinly traded, the caller *rings the launch desk* and the broker takes the name onto a DBC whose opening price is **anchored to the real equity** (the Pyth feed the house already ingests) inside a **tight band** — not a 0→∞ pump. USDC bonds the curve as it comes in; at the graduation threshold the pool migrates to DAMM v2, and the desk's tape then *watches the launch discover price* before it becomes a normal trade. The flagship configuration is the **stock-pair** (NVDAx quoted in AAPLx), where the curve discovers the *relative* price — the exact "stock-pairs" idea the category calls out.

A DBC launch with a flat pump curve is "a meme coin with a ticker." Anchoring the band to a **fundamental reference** is what makes it *about equities*.

### §2 — Why a new desk, not a Jesse re-tag

- An **offering** is `mandate + instrument + rail + venue` (`lib/desk/offerings.ts`), and the governing rule is *"similar exposures on different rails remain distinct, never a silent substitution."* A DBC launch is a different **venue** (Meteora, not Jupiter) *and* a different **issuer boundary** (a name being *launched*, not a verified Backed mint with a live Scaled-UI multiplier). Forcing it into `backed-xstocks`/`jupiter` would corrupt the one property the Jesse desk is honest about — its verified catalog.
- **Each desk is a broker doing one job on one rail.** Hetty = Base/trade, Jesse = Solana/trade. A launch is a *different job* (bring a new name onchain and discover its price), so it gets a *different broker*.
- A launch's mint is **created at launch time**, so its offering cannot come from the static `SOLANA_INSTRUMENTS` catalog. `lib/desk/offerings.ts` has a **dynamic `LaunchOffering` variant** whose instrument id resolves *post-deploy* — the one genuinely new shape in the offering model.

### §4 — Seams and drop-ins

| Seam | File | What changed |
|---|---|---|
| Mandate | `lib/desk/mandates.ts` | `meteora-launch` (Solana rail, venues `meteora-dbc` / `damm-v2`, USDC quote). |
| Offerings | `lib/desk/offerings.ts` | Dynamic `LaunchOffering`: the mint is created at launch, so the instrument id resolves post-deploy, not from the static catalog. |
| Desk runtime | `lib/desk/registry.ts` | `halley` in `RUNTIME_BASE` + `EXTENDED_CAPABILITIES`; `DESK_CAPABILITIES` in `lib/house.ts`. |
| Adapter + execution | `lib/meteora/` | DBC config builder, launch estimate (projected price path), launch submit (mirrors `live-submit.ts`), graduation→DAMM v2 watcher. |
| Controller | `lib/meteora/useHalleyDesk.ts` | Reuses the `useJesseDesk` state machine; adds a `launch` stage + `launchDraft` shape. |
| Voice | `lib/meteora/desk-tools.ts`, `voice-tools.ts` | Launch handlers, same progressive-reveal + paper-only pattern as `lib/jesse/desk-tools.ts`. Live is the on-screen wallet ceremony, never voice. |
| Flags | `lib/meteora/flags.ts` | Dual env gate; paper open, live off by default. |
| Surface | Room view | The launch slip: bonding curve on the ticket, graduation threshold, live price-discovery tape after launch. |

```ts
// lib/meteora/flags.ts  — same dual-gate shape as Jesse
export function halleyPaperClientEnabled() { return process.env.NEXT_PUBLIC_HALLEY_PAPER_ENABLED !== 'false'; }
export function halleyLiveClientEnabled()  { return process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED === 'true'; }
export function halleyLiveServerEnabled()  { return process.env.HALLEY_LIVE_ENABLED === 'true'; }
export function halleyLiveEnabled()        { return halleyLiveClientEnabled() && halleyLiveServerEnabled(); }
```

### §5 — Voice tools (progressive reveal, paper-only)

Handlers execute in the caller's browser against `useHalleyDesk`; **no handler signs or submits** (the house rule: voice cannot sign, submit or reconcile).

- `choose_pair` — base xStock + quote xStock (the equity-pair axis; single-name launches use a USDC quote).
- `choose_curve` — `flat` / `exponential` / `long` / **`equity-pair`** (the anchor).
- `set_graduation` — USDC threshold at which the pool migrates to DAMM v2.
- `request_launch_estimate` — the **projected** price path for the chosen config. Labeled an *estimate, never an order*; never an executable figure.
- `watch_launch` — the price-discovery tape after graduation (venue duplex, honest stale/unavailable).
- `describe_desk`, `cancel_instruction` — standard.
- `confirm_launch` — appears **only after** the estimate is in review (progressive reveal, same as `record_paper` on Jesse). It *prepares* the server launch proposal; the actual sign is the on-screen wallet ceremony, exactly as live settle is today.

### §6 — Curve presets and anchor posture

| Preset | Meaning |
|---|---|
| `flat` | Near-linear bonding; minimal early price movement. |
| `exponential` | The default meme-style curve; shown for contrast, not the story. |
| `long` | Extended low-movement tail before the steepening; slower discovery. |
| **`equity-pair`** | **Opening price anchored to the Pyth ratio of the two equities; low-volatility band (`bandBps`).** The differentiator — price discovery *around a fundamental anchor*, for a single name (vs USDC) or a relative price (vs a peer xStock). |

The `equity-pair` band reuses the house's existing Pyth ingestion and the reference-difference math from the Jesse market contract — the same data path that powers the venue/reference duplex, redirected into a launch price anchor.

**Anchor posture (2026-10-11):** the equity mark is canonical while the tape is awake. When it rests — nights, weekends, holidays — the anchor falls back to the **live onchain xStock venue mark** (`readVenueDuplex`, the same jupiter-price-v3 evidence Jesse's tape shows): the launch stays anchored around the clock because the venue never closes. Pair launches read both legs on one basis, never mixed; the resting equity reading and the venue-versus-equity gap ride along as `restingEquity` evidence — a comparison, never an arbitrage. Only when neither basis answers does the estimate refuse (`anchor_stale`/`anchor_unavailable`), and unanchored launches remain an explicit user choice.

### §7 — Live launch (landed 2026-10-10 — reuses the Jesse live pattern)

The live path is `lib/meteora/live-{contracts,prepare,submit,store,ledger,flags}.ts` + `/api/desk/halley/live/{prepare,submit,reconcile}` + `components/desk/HalleyLiveLaunch.tsx`, mirroring `lib/solana/live-*`:

- A server-side **launch proposal** in the same Redis/memory store, with `expiresAt`, wallet match, message-hash binding, and an idempotency key.
- **Two signed transactions, not one.** The full 16-segment curve config exceeds Solana's packet limit, so the SDK's `createConfigAndPoolWithFirstBuy` (firstBuy = none) returns `createConfigTx` + `createPoolWithFirstBuyTx`. Both share one blockhash/review window; the ephemeral config and base-mint keypairs partially sign server-side; the launcher's wallet signs both; the server verifies both message hashes and the payer signature slot, then broadcasts config → confirm → pool → confirm. Outcomes are `confirmed` / `failed` / **`partial`** (config landed, pool failed — a stranded config account is disclosed, never silently relaunched) / `unknown`.
- Reconciliation reads **both** signatures via `getSignatureStatuses` (`/api/desk/halley/live/reconcile`); the browser ledger (`claflin.halley.live-ledger.v1`) writes both pointers before submit returns so a timed-out tab still has evidence.
- Default **off** at both server and client (`HALLEY_LIVE_ENABLED` / `NEXT_PUBLIC_HALLEY_LIVE_ENABLED`); a Meteora-scoped self-declaration (`claflin.eligibility.v1.meteora-launch`) gates the ticket first. `HALLEY_DAMM_CONFIG` overrides the migration config catalog default.
- State machine, unknown-outcome handling ("reconcile the existing signatures; do not relaunch"), and "never rebroadcast a different order" rules carry over unchanged.
- Devnet evidence: `scripts/halley-devnet-launch.ts` exercises the *production* `prepareHalleyBuiltLaunch` end-to-end. 2026-10-10 run — config tx `2SUpb1NU5HV9WtaTyFgpExGF3F2XRDdK18b55kkcZ4ZAxBBNFm7DNP7b1K55HufyHaped1m9TEF35fdpSqLupjUB`, pool+mint tx `4ZSK6rLnSu2XBiFMzsYYvsp6CHvwHNFDHoijr99AJATt5tvxSxFr7DqE2X7mA9uXgmgjhi4uF18scv94SEQQV5t2`, pool `ENc25NP6xrpZkB7hWaUeT3CT59SXDw3qX183NdFkeVUN`, mint `F9ukGrYKtZotEwRSjMcYD5JoBpBkrbR1w4R99gh2jkU4` (all devnet). The participant surface (`/api/desk/halley/live/swap`, `/live/claim`, `/live/tx`) is wallet-signed buy/sell on the curve and partner fee claims, **SPL quotes only — Token-2022 quote pools are refused `coverage_pending`**.

The launch *issuing* of the security mint is **out of scope** — see §8. What is in scope is *venue* (a DBC for a fresh tracker mint, or a relative-price pair), not *issuer*.

### §8 — Scope

**Scope 1 (built).** As built (amended 2026-10-03 after the spike): **DBC always mints a fresh base token** — an existing xStock cannot be placed on a curve as the base. What Scope 1 builds is a **new tracker/exposure token** (name + symbol chosen on the slip) quoted in USDC or a badged xStock (AAPLx/NVDAx/TSLAx — badge PDAs verified on mainnet, `lib/meteora/catalog.ts`), optionally anchored to the equity's Pyth mark (or the pair ratio for an xStock quote). The tracker token is *never* represented as stock ownership — the house is venue and infrastructure, the launcher's wallet is the mint's creator. Live launch shipped 2026-10-10 (§7); whether flags open in production remains a deliberate release decision. Remaining limits: a real mainnet launch (operator key required) and DLMM conviction-pool execution are still open.

**Scope 2 (differentiator, attempt only if Scope 1 is solid).** The **conviction pool → DLMM** graduation: commit USDC pre-launch, and migrate that position into a **DLMM** at graduation instead of flat DAMM v2. The strongest originality card and the riskiest piece; execution is still open (the estimate carries the plan; nothing submits it).

**Out of scope (explicit).** *Issuing a brand-new stock mint.* Issuance authority + securities law is a real surface the house does not promise to judges. The "new name" framing stays a **venue for existing/relatively-thin mints**, never an issuer.

### §9 — The honest risks

1. **Regulatory.** A stock-token launch is a securities action. Keeping the house as **venue** (existing Backed mints / a relative-price pair) rather than **issuer** is the clean path. Judges in a trading category will probe this; name it proactively in the submission.
2. **The DBC-from-zero instinct.** The naive read is "launch a stock from $0 up a curve" — that is a meme pump with a ticker. The anchored band is what makes it *about equities*. Do not lose it in the build.
3. **Mainnet traction bar.** Usage cannot be faked. A conviction pool seeded by the team is the honest version of "people participating"; frame volume as "first launch live," not high.

### §10 — Go decision (2026-10-03)

Scope 1 approved — pair-first, USDC supported, tracker-token framing. Settled: the World's Fair entry is the house (Solana + Base + Robinhood Chain) with Meteora DBC as the Earn sidetrack; venue-not-issuer confirmed as the hard line (tighter than drafted — tracker/exposure token, because DBC always creates a fresh base mint); the devnet spike answered feasibility; Halley is a **desk** (LINE 4, Edmond Halley, "The Comet Caller") with full voice parity (`lib/meteora/voice-tools.ts` + `desk-tools.ts`, `HalleyCall`, `POST /api/desk/halley/session`, agent `ELEVENLABS_AGENT_HALLEY`). Open: whether a single submission can tag both the Solana track and the Meteora sidetrack.

### §11 — Spike results (completed 2026-10-02 — green)

Full evidence and tx links live in `~/Dev/meteora-dbc-spike/RESULTS.md` (isolated repo, nothing in production code). A Token-2022 quote-mint pool (mock xStock pair) was launched, traded, and migrated to DAMM v2 on devnet end-to-end — no token badge, no keeper, no Meteora-side allowlisting required for a plain Token-2022 mint.

Resolved by the spike:

- **Exact DBC init/graduate transaction shapes** — `createConfigAndPool` (one tx) → buys → `migration_damm_v2` (one tx, permissionless once the pool state machine reaches `LockedVesting`). Migration progress is `PreBondingCurve → [PostBondingCurve] → LockedVesting → CreatedPool`; with zero vesting configured the curve-completing swap jumps straight to `LockedVesting`, and `create_locker` is only required when vesting is set.
- **Valid DAMM v2 migration config** — not the generic index-0 config. The program requires `poolCreatorAuthority ==` the DBC pool authority PDA plus full-range sqrt prices, `vaultConfigKey == default`, Timestamp activation, and an unscheduled linear/exponential fee scheduler. Devnet: config indices 20000–20006 (`7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd` used here).
- **Token badge** — required for real xStocks (they carry `permanentDelegate`, `transferHook`, `pausableConfig` etc., beyond the metadata-only permissionless set) and **already resolved on mainnet**: Meteora has created badges for all three catalog mints (verified via RPC — badge PDAs exist for AAPLx, TSLAx, NVDAx). Meteora's own docs describe the badge path as "the path used for Stock Tokens." Zero transfer fee is enforced at badge creation and on every quote transfer; DBC-owned DAMM v2 migration configs carry `CreatePoolWithoutMintValidation` so badged mints graduate cleanly.
- **Fees/quote-token behavior on a stock pair** — a Token-2022 quote mint behaves identically to SPL through the whole lifecycle; the only friction is thin-curve tail buys, which need `swap2` `PartialFill` rather than `ExactIn`.

Still open (product-side, not protocol): where the equity-pair anchor reads the Pyth ratio and how the band bounds (`bandBps`) are set per the launch config (reuse `lib/solana/market/` normalization); the dynamic `LaunchOffering` shape (how a post-deploy mint id enters `INSTRUMENT_OFFERINGS` without touching the static verified catalog); whether the conviction pool is a DAMM v2 position or a separate deposit program, and how it migrates to DLMM at graduation.

### §12 — Surface design — Phases 1–5 (landed 2026-10-13)

Halley's slip is the reference implementation of the progressive-disclosure rules in `DESK_CANON.md` — the rules live there, this section records only what the desk does. Code: `components/desk/HalleyDeskSurface.tsx`, `HalleyPlate.module.css`, `WorkingDesk.module.css`, `lib/meteora/{plate,useHalleyDesk,desk-tools,voice-tools}.ts`, `lib/desk/detail-density.ts`, `lib/sounds.ts`. Verification: [docs/RELEASE_VALIDATION.md](RELEASE_VALIDATION.md).

**Phase 1 — folds belong to the platform.** The `manualOpen` / `onStepToggle` state machine is gone; the three steps share `<details name="halley-slip">`, so the browser owns exclusivity, focus, and a11y. The desk only nudges — `desiredSectionRef` / `foldRef` open what is due and rest closed on summary chips when the draft is complete (`desiredSection = null`). Height is fluid in pure CSS: `@supports (interpolate-size: allow-keywords)` animates `::details-content` over 240/320 ms on `--ease-swift` with the content rising 4 px, closing in 160 ms so leaving feels lighter than arriving; `prefers-reduced-motion: reduce` bypasses entirely. E2E: `e2e/halley-folds.spec.ts` — mutual exclusivity, hand override, completion closure in real Chromium.

**Phase 2 — pencil and ink** (`f0cf6e4`). `applyDraftEdit` tracks provenance (`'house' | 'caller'`) per field: a declined anchor (`anchorSymbol: null`) is never silently re-anchored and a caller-typed figure is never rescaled when the quote changes. House-pencilled values render graphite italic with the `.houseMark` badge, inking via `@keyframes inkFill` when touched; an estimate under review is strictly solid ink.

**Phase 2 — launch size presets**, the working depth of Step 3 (`LAUNCH_SIZE_PRESETS` / `LAUNCH_SIZE_SPECS` / `matchingLaunchSizePreset` in `plate.ts`):

| Preset | Supply | Graduation (USDC) | Graduation (xStock) |
|---|---|---|---|
| Small | 100,000 | 50 | 0.5 share |
| Standard | 1,000,000 | 150 | 1 share |
| Large | 1,000,000,000 | 5,000 | 25 shares |

Tapping a preset inks the choice as caller-owned; a custom figure in Fine-tune releases the chip cleanly. `matchingLaunchSizePreset` reflects which preset the draft matches, so switching quote updates the selected chip without overwriting caller numbers.

**Phase 3 — the slip follows the conversation** (`3cd6d28`). `useHalleyDesk` tracks `lastWritten`; `SECTION_FOR_FIELD` maps each draft field to its fold (`halley-step-1/2/3`). Spoken tool calls (`name_launch`, `choose_anchor`, `choose_quote`, `set_supply`, `set_graduation`) and hand edits open the section under discussion.

**Phase 4 — mobile.** At ≤ 760 px historical turns (`.captionLine[data-tail='true']`) are suppressed and the active turn clamped to two lines, the whole call folding behind one disclosure; `.slipLine` sticks to the top against the sticky `.stickyCta` so folds scroll cleanly between them. A delegated `onClick` on `.fields` measures the tapped `<summary>` before the native collapse and restores alignment in `requestAnimationFrame`, so the section under your finger never jumps.

**Phase 5 — zoom.** `lib/desk/detail-density.ts` exposes `useDetailDensity` (`useSyncExternalStore` + `localStorage` `claflin.detail-density.v1`); a quiet toggle in the mode stamp picks `brief` (default) or `full`, and `full` opens the fine-detail disclosures (`assumptionsFold`, `productDetails`, `captionHistory`) and Fine-tune across the surface. Voice is zoom too: `halleyRevealTargetForTopic` maps `explain_concept` topics (`anchor`, `graduation`, `tracker-token`, `curve-shape`, `paper-mode`, `namesake`) to element ids and `desk-tools.ts` calls `d.reveal(target)` — a jump and expansion, never a draft edit. Draft→review commits inside `document.startViewTransition`, with `.slipLine` and `.reviewTitle` sharing `view-transition-name: halley-slip-line` so the one-liner morphs into the review headline (plain commit under reduced motion).

**Fine-tune fold.** Curve chips, `#halley-supply`, and `#halley-grad` rest inside `<details id="halley-fine-tune">` — "Fine-tune (curve, supply, graduation)" — remembered in `sessionStorage` (`claflin.halley.fine-tune`) and opened automatically at `full` density. `jumpToId` opens every ancestor fold, so a jump from voice, keyboard, or an error link lands on a visible field.

**Completion tick.** `playStampTick` (`lib/sounds.ts`) fires `playStampThud(0.1)` — a tenth-weight stamp — as each section completes and writes its summary chip.

<a id="other-desks-pointers"></a>
## Other desks (pointers)

**Hetty — Base desk.** The first desk: Base trade rail, account sync, and the legacy desk documents Jesse deliberately does not load. Live-avatar/session work for the seated desks is planned separately in [docs/LIVE_DESK_AVATAR_PLAN.md](LIVE_DESK_AVATAR_PLAN.md); house context in [docs/README.md](README.md) and [docs/ARCHITECTURE.md](ARCHITECTURE.md).

**Tennie — Robinhood Chain desk.** Third desk, marks-first on Robinhood Chain's keyless `/rhj` asset/price APIs plus onchain Chainlink feeds. Paper-only; eligibility is covered in [docs/PRODUCT.md](PRODUCT.md) (eligibility section).
