# World's Fair Entry Plan — track picks and the Isabel slice

**Prepared:** 2026-10-01. **Status:** PLAN — directed work, not yet built. This document supersedes the Meteora-first framing of the World's Fair consideration recorded in [ROADMAP.md](../ROADMAP.md) and re-scopes [METEORA_LAUNCH_DESK.md](METEORA_LAUNCH_DESK.md) as an optional sidetrack add-on rather than the entry vehicle. It changes no code until slices land on their own evidence.

**Why this exists:** the earlier reconsideration assumed entering the World's Fair meant building a new desk for a new venue. Reading the [official rules](https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf) shows the competition is organized as **ecosystem tracks** — and Claflin already integrates two of the eight ecosystems today, with a third available cheaply. The entry does not depend on Meteora.

## 1. What the competition actually is

From the official rules §14 and the [World's Fair page](https://colosseum.com/worldsfair) (read 2026-10-01):

| Track | Pool | Awards |
|---|---|---|
| Solana | $100,000 | 10 × $10,000 |
| Tempo | $100,000 | 10 × $10,000 |
| Hyperliquid (Hypercore/HyperEVM) | $100,000 | 10 × $10,000 |
| Zcash | $100,000 | 10 × $10,000 |
| Ethereum L1 | $25,000 | 5 × $5,000 |
| Base | $25,000 | 5 × $5,000 |
| Arbitrum | $25,000 | 5 × $5,000 |
| Robinhood Chain | $25,000 | 5 × $5,000 |

Additive general awards on every submission: Grand Champion $30,000 (Phantom CASH), next 20 standout teams × $15,000, Public Good $5,000, University $5,000. All hackathon winners are interviewed for the Accelerator ($250,000 pre-seed, 12 weeks SF); Colosseum's fund remains Solana-oriented.

Mechanics that matter:

- **One submission per team**; up to **3 tracks** picked at registration. Track prizes are additive to general awards — a track pick is upside, not a trade-off.
- **Judging window:** only work completed 14 Sept – 12 Oct 2026 is judged (rules §5, FAQ). Pre-existing code is allowed but must be disclosed in the submission; misrepresentation is disqualifying.
- **Deadline:** submissions due 12 Oct 2026, 11:59pm PT (eventDates: 13 Oct 06:59 UTC). Winners announced by 5 Dec 2026.
- **Sidetracks are a separate channel.** Sponsor and regional bounties run on Superteam Earn (~$197–319K advertised, same 13 Oct deadline): the **Meteora DBC bounty (~$20K)** lives there, alongside regional tracks (Argentina, UAE, Spain, CZE, NL, Ukraine confirmed; a UK opportunity is advertised by Superteam UK — confirm the listing and eligibility on Earn before counting it).
- Judging criteria (rules §8): functionality, potential impact, novelty, UX, open-source/composability, business plan.

**Registration state:** the `papa` Colosseum account shows `registered: false` for `crypto-worlds-fair` (Copilot `/me`, 2026-10-01). Register at `colosseum.com/arena/hackathon/register?entry=worldsfair` — free optionality, do it before the plan needs it.

## 2. Track picks: Solana + Base + Robinhood Chain

One submission — the house — tagged to three ecosystems it genuinely integrates. The multi-rail house ("the house never asks visitors to prefer a chain") is the thing that makes three track picks coherent rather than opportunistic.

| Track | What already exists | In-window evidence | Gap |
|---|---|---|---|
| **Solana** | Jesse: verified xStock catalog, Jupiter Metis quotes, venue-duplex marks, dual-env-gated live settle, ConvAI voice, Room/Compact | The whole Jesse integration was built for Stocklana **inside** the 14 Sept – 12 Oct window, plus rail-neutral desk seams and the foyer rebuild | None material — package it |
| **Base** | Hetty: Aerodrome estimates, Chainlink marks, Privy-gated live path | Hetty's core predates the window → **disclose**; polish, foyer integration, and any in-window hardening count | Submission must foreground what changed in-window |
| **Robinhood Chain** | Isabel is planned; baseline reviewed in [Architecture](AGENTIC_ARCHITECTURE.md#robinhood-chain-integration-baseline) | Everything Isabel ships is in-window by definition | §3 — the slice below |

Rejected picks: **Tempo** and **Zcash** are the wrong product shape for a brokerage desk; **Hyperliquid** is a whole new rail (HIP-3 equity perps are thematically adjacent but a fresh venue in 11 days); **Ethereum L1** would be a third new rail with no existing code; **Arbitrum** is the Jay Cooke slot and weaker than Robinhood Chain as the third pick — Robinhood Chain is Orbit-family but the track judges will read "Arbitrum" as Arbitrum One.

Robinhood Chain is the strategic pick for a fourth reason: it is a chain *built for tokenized equities* judging a product that *is* a tokenized-equities brokerage, and it will likely be the least-contested track — few teams can integrate a weeks-old chain.

## 3. Isabel scope — verified inputs

Read from `docs.robinhood.com/chain` on 2026-10-01; recheck live parameters before release.

- **Network:** mainnet live, chain ID `4663` (testnet `46630`), ETH gas, Arbitrum Dedicated Blockchains, first-come-first-served sequencing.
- **Keyless REST:** `GET https://api.robinhood.com/rhj/assets` — per-asset `deployments[]` (checksummed contract + `chainId`), `currentMultiplier` (18-dp shares-per-token) + `pendingMultiplier`/`EffectiveTime`, `status`, `tradingCapabilities`. `GET /rhj/prices/{symbol}` — raw underlying-equity bid/ask, 15s cache, **not** multiplier-adjusted. `GET /rhj/corporate-actions`. All ~60 req/s, respect cache windows. **No API key required — Isabel's catalog and reference marks need no RPC dependency at all.**
- **Onchain Chainlink:** per-token `AggregatorV3Interface` feeds, multiplier-adjusted (token price = share price × multiplier), 24/5. Feed addresses are maintained on Chainlink's [Robinhood feeds page](https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood) — read from there, never hardcode. `oraclePaused()` is advisory during corporate actions (keep staleness as the primary guard); L2 sequencer-uptime check recommended. `uiMultiplier()` (ERC-8056) on the token for share-equivalent display.
- **Venues (verified 2026-10-01, see §4b):** **Lighter domain** is the quotable venue — `api.rh.lighter.xyz`, keyless REST, 25 rhj stock/USDG spot books with real quotes. **Rialto** has a real developer Quote API but requires a wallet-signed integrator key. **Uniswap is deployed but not functional** — canonical addresses hold 2109-byte stubs, no working factory, zero stock pools. RFQ (0x/1inch Fusion/LiFi) is the docs' primary-at-launch venue and is key-gated aggregator infrastructure. Direct mint/burn is KYB-only.
- **RPC:** Alchemy recommended (`robinhood-mainnet.g.alchemy.com/v2/{key}`); Chainstack/QuickNode/Blockdaemon/dRPC also listed. Public endpoints are rate-limited — env-gate `ROBINHOOD_RPC_URL` behind the same provider-key posture as `BASE_RPC_URL`.
- **Eligibility:** Stock Tokens are ERC-20 debt securities issued by Robinhood Assets (Jersey); US-person restrictions apply. As with Hetty, eligibility is our product's policy surface, never the chain's.

**The duplex maps directly.** rhj `/prices` (issuer-side underlying bid/ask) vs the onchain Chainlink feed (multiplier-adjusted token valuation) is the same honesty pattern Jesse runs as venue-duplex — two truthful sources that diverge, labelled, never blended. Isabel's tape can carry "underlying reference" and "onchain token mark" from day one.

## 4. Build slices

| Slice | Content | Gate |
|---|---|---|
| **A — marks + catalog** | Catalog derived from `/assets` (chainId 4663, `ASSET_STATUS_ACTIVE`), marks adapter reading rhj `/prices` + onchain Chainlink, honest stale/unavailable labels. Feeds desk tape and foyer wire. | **Landed 2026-10-01** — 24 triple-covered symbols; see §4a. |
| **B — estimate** | **Venue = Lighter domain orderbook** (`api.rh.lighter.xyz`, keyless): best bid/ask + depth vs USDG per stock market, read-only. Not Uniswap — see §4b. | **Landed 2026-10-01** — book-walking USDG estimate with depth/partial-fill labels, multiplier, and the three-way tape embedded. |
| **C — desk surface** | `lib/robinhood/` module (catalog/marks/flags), mandate + offering rows, registry entry, controller reuse, dual-env flags (paper default on, no live flag at all). | **Landed 2026-10-01.** Voiceless by design; reached via offering chips and `?desk=isabel`. |

Out of scope for the window: live execution, wallet ceremony, account sync, eligibility enforcement surface. Isabel stays paper and marks-first — consistent with every desk gate the house has held.

## 4a. Spike evidence (2026-10-01)

Slice A inputs were exercised live against mainnet, all keyless. This establishes feasibility, not correctness under production load.

- **`GET https://api.robinhood.com/rhj/assets`** — HTTP 200, ~162KB, ~0.2s. **194 assets, all with a chainId-4663 deployment, all `ASSET_STATUS_ACTIVE`.** Per-asset: checksummed contract, `currentMultiplier` (live values already diverging, e.g. CRM `1.001148`, DELL `1.000063`), `tradingCapabilities`, status, `logoUrl`.
- **`GET /rhj/prices/{symbol}`** and the **bulk `GET /rhj/prices`** (all 194 quotes in one ~99KB call, ~0.1s). Returns underlying `bid`/`ask`, `currency`, `dailyTradingVolume`, `dailyHigh`/`Low`, `isTradingHalt` (0 halted at read time), `mintBurnTokenVolume`/`mintBurnUsdVolume`, `generatedAt`, and — richer than documented — **`tokenBid`/`tokenAsk`, the multiplier-adjusted token prices computed server-side.** Verified across all 194 quotes: `tokenBid / bid == currentMultiplier` exactly (0 mismatches). Deployments carry `itnEnabled`/`atomicEnabled` flags.
- **Chainlink feeds:** machine-readable directory at `reference-data-directory.vercel.app/feeds-robinhood-mainnet.json` — **58 feeds total: 35 `Robinhood <SYM> / USD` equity feeds** + 23 crypto/stables. All 8 decimals, **86400s heartbeat** (24h — weekend/holiday gaps are normal for 24/5 equities; staleness policy must reflect that). **Coverage: 35 of 194 rhj symbols have an onchain feed** — all 35 feed symbols resolve to rhj assets (SGOV/QQQ/SPY/SLV/USO ETFs included). Feed set ⊂ catalog, verified at read time.
- **Keyless onchain read works:** `https://robinhood.drpc.org` (public dRPC endpoint) answered `eth_chainId` = `0x1237` (4663) and a live `latestRoundData()` on the AAPL feed proxy `0x6B22A786…` → **$330.47101721, updatedAt 19:50 UTC (~1.9h fresh)**. At the same moment rhj returned underlying 330.17/330.19 and tokenBid/Ask ~330.36/330.38 — the onchain mark vs issuer REST price divergence is real and labelable, exactly the duplex pattern. Rate limits apply; production reads should use env-gated provider RPC (`ROBINHOOD_RPC_URL`), not dRPC public.

**Consequences for slice A:**
- The marks adapter has **two keyless sources**: rhj `tokenBid`/`tokenAsk` (covers all 194) and Chainlink onchain (covers 35). The duplex label applies where both exist; the remaining 159 symbols are honestly "issuer-reference only" — or the desk catalog restricts to the 35 onchain-anchored names. Decide at integration; do not present REST-only marks as onchain-verified.
- `isTradingHalt`, `generatedAt`, heartbeat-vs-`updatedAt` staleness, `oraclePaused()` advisory, and multiplier state are all first-class fields — the honest-labels substrate exists without scraping.
- Slice B venue spike is complete — see §4b. Quote path verified via Lighter, not Uniswap.

## 4b. Venue spike (2026-10-01)

Goal: is there a quotable venue for stock tokens on 4663? Exercised live against `docs.robinhood.com/chain` venues, all keyless. This establishes a read path exists, not production correctness or execution acceptance.

- **Uniswap — deployed but not a venue.** Canonical addresses exist (`0x1F98431c…F984` factory, `0x61fFE014…B21e` QuoterV2, `0xC36442b4…11FE88` NFPM, `0x66a9893c…BA8Af` UniversalRouter, Permit2) but each holds only ~2109 bytes — stub/proxy deployments, not functional implementations: `feeAmountTickSpacing(3000)` and `owner()` return empty, EIP-1967 impl slot is zero, `getPool()` returns zero for NVDA/USDG, NVDA/WETH, and USDG/WETH at every fee tier. SwapRouter02 and the v4 PoolManager are absent. **No stock pools exist; do not plan on the Uniswap path.**
- **Lighter domain — the verified venue.** Robinhood Chain runs a dedicated Lighter instance (`robinhoodchain.lighter.xyz`, API `https://api.rh.lighter.xyz`, contract `0x94bAB969…AFfF9d`). Keyless REST:
  - `GET /api/v1/orderBooks` — 84 markets: 27 spot (`<SYM>/USDG`, USDG = `0x5fc5360D…1d168`, WETH = `0x0Bd7D308…AD73`), 57 perps. **25 of the rhj catalog have active spot books** (+ ETH, PONS — a Robinhood-only private name not in the rhj catalog).
  - `GET /api/v1/orderBookOrders?market_id=N` — real resting liquidity: SPY `765.14 / 765.15`, NVDA `231.08 bid / 231.21 ask`, AAPL `330.06 / 330.51` — all within cents of the Chainlink mark (AAPL spot mid 330.285 vs onchain 330.47 vs rhj token mid ~330.37: a three-way honest tape).
  - `GET /api/v1/orderBookDetails` — 24h stats: **~$2.06M across the 27 spot books**; SPY $1.17M / 8,356 trades, MU $177K, QQQ $85K; tail names thin (AAPL traded $380 that day, SGOV $138). Min quote 10 USDG; per-market `multiplier` field tracks corporate actions natively.
  - Liquidity is real but early: quotes are deep enough for estimates, realized volume concentrates in a handful of books. Label quote depth, not just price.
- **Rialto — exists, key-gated.** `docs.rialto.xyz` documents an onchain best-execution router aggregating propAMMs, with a developer **Quote API** (request firm quote → executable tx). Requires an integrator API key via wallet-signed onboarding — a candidate for the execution leg later, not needed for paper estimates.
- **RFQ via 0x — exercised with the repo's `ZEROX_API_KEY`, refused by policy.** The key works and 0x answers real quotes on 4663 for crypto pairs (USDG→WETH returned a firm route via `Orvex_CL`, `liquidityAvailable: true`; 56 sources advertised on the chain incl. `0x_RFQ`, `Orvex_CL`, `Rubicon_CLMM`, `RobinSwap_V3`). But **every stock token is gated in both directions**: `BUY_TOKEN_NOT_AUTHORIZED_FOR_TRADE` / `SELL_TOKEN_NOT_AUTHORIZED_FOR_TRADE` — "not authorized for trade due to legal restrictions" (NVDA, SPY, AAPL, TSLA, SGOV all blocked). This is 0x's compliance boundary, not a config gap — **do not wire 0x for equity legs.** Its honest role on 4663 is the crypto funding leg (X→USDG) if the client journey needs it. 1inch/LiFi were not exercised; assume the same policy class.
- **Direct mint/burn:** Authorized-Participant KYB only — never a client surface.

**Consequences for slices:**
- Isabel's estimate slice is **unblocked keyless**: venue = Lighter orderbook reads, quote asset USDG. Adapter shape mirrors Aerodrome (read-only quote → honest estimate), no key ceremony.
- **Catalog recommendation: restrict the desk to the 24 triple-covered symbols** — `rhj catalog ∩ Chainlink feed ∩ Lighter spot` = AAPL, AMD, AMZN, BABA, COIN, CRCL, CRWV, GOOGL, INTC, META, MSFT, MU, NVDA, ORCL, PLTR, QQQ, SGOV, SLV, SNDK, SPCX, SPY, TSLA, USAR, USO (BE has a book but no feed; 12 fed names have no book). Every offering then carries issuer reference + onchain mark + venue quote — three labelable sources, the fullest duplex the house has run.
- Lighter reads are public; **order placement** is a Lighter account/API-key matter — out of scope for the window, per the desk gate (paper-only).
- Optional later: Rialto integrator onboarding (wallet-signed) adds a second equity venue with firm quotes — the only remaining RFQ-class path for stock tokens. Not needed for Slice B.

## 5. Meteora repositioned

[METEORA_LAUNCH_DESK.md](METEORA_LAUNCH_DESK.md) remains a proposal. Under this plan it is **optional upside, not the entry**: Halley would strengthen the Solana track story *and* collect the Meteora sidetrack (a separate Superteam Earn submission, ~$20K). Two conditions before any Meteora work: Isabel slice A is landed, and the DBC devnet spike is green. The Meteora workshop (2 Oct, 08:30 PT) is worth attending only if the sidetrack stays in play. The venue-not-issuer hard line is unchanged.

## 6. Sequence to the deadline

| Days | Work |
|---|---|
| Oct 1–2 | Register (Solana + Base + Robinhood Chain). Isabel catalog + marks spike: exercise `/rhj/assets` + `/prices` live, pull Chainlink feed addresses, confirm a marks read end-to-end. Check Earn for a UK regional sidetrack. Meteora workshop only if the sidetrack is still in play. |
| Oct 3–5 | ~~Isabel slice A + slice B spike~~ — **done early**: slices A, B, C all landed Oct 1. Use the slack for desk polish, e2e smoke on the deployed site, and submission copy. |
| Oct 6–8 | Meteora decision point: if Isabel is clean and the devnet spike is green, Halley Scope 1; otherwise drop and harden. Submission copy begins — foreground in-window work, disclose pre-existing code. |
| Oct 9–11 | Demo video + submission polish (UX and business plan are judging criteria — the voice-broker metaphor and paper-first honesty are the pitch). Confirm closed-repo judge-access requirements. |
| Oct 12 | Submit before 11:59pm PT. Earn sidetrack submissions by 13 Oct 06:59 UTC. |

## 7. Honest risks

1. **Disclosure.** Hetty predates the judging window and must be disclosed as pre-existing work; the in-window story is Jesse + rail-neutral seams + foyer + Isabel. Do not let the submission imply otherwise — misrepresentation is disqualifying.
2. **Isabel venue risk — retired 2026-10-01.** The Lighter domain quote path is verified (§4b), so Isabel ships estimates, not just marks. Residual risk is depth honesty: 24h volume concentrates in ~6 books — thin names must label it.
3. **One submission.** This plan bets the single entry on the house; there is no second product slot to hedge with.
4. **Closed repo.** The repo is private; the Meteora sidetrack documents a judge read-access requirement (`dannxbt`) — confirm whether the main competition has an equivalent before submission day.
5. **Regional sidetracks** are geography-gated and separately submitted on Earn; confirm the UK listing exists and its eligibility rules before counting it.

*This document owns World's Fair sequencing only. [ROADMAP.md](../ROADMAP.md) owns the house's longer sequence; [METEORA_LAUNCH_DESK.md](METEORA_LAUNCH_DESK.md) owns the Halley design; [AGENTIC_ARCHITECTURE.md](AGENTIC_ARCHITECTURE.md) owns the Robinhood Chain integration baseline.*
