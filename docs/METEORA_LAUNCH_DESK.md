# Meteora Launch Desk — Design Plan (working title)

**Prepared:** 2026-10-01. **Status:** **PROPOSAL — under consideration, not approved.** No code is planned or committed under this document until the project lead makes an explicit go decision. Working broker name is **Halley** (comet → Meteora; rename freely — the name is not load-bearing). **Repositioned 2026-10-01 under [WORLDS_FAIR_PLAN.md](WORLDS_FAIR_PLAN.md):** the World's Fair entry does not depend on this desk — the main submission is the house tagged Solana + Base + Robinhood Chain, and the Meteora DBC prize is a Superteam Earn sidetrack (~$20K), not a main track. Halley is attempted only if Isabel's marks slice lands and the devnet spike is green.

**Why this exists now:** [STOCKLANA_BUILD_PLAN.md](STOCKLANA_BUILD_PLAN.md) §1 ("Contest focus and deadline") records that **Meteora DBC was declined** as a primary target and Clawpump/Tessera were declined, on the basis that launching a token "conflicts with the house's no-token, provenance-first direction." That decision was made for **Stocklana** (deadline 25 Sept 2026, now **closed**; judging runs through 2 Oct). The **Colosseum Crypto World's Fair** (submissions due **12 Oct 2026**) reintroduces a Meteora **DBC** bounty as a Superteam sidetrack (~**$20K**) whose framing explicitly invites *stock-pair* and *RWA/tokenized-equity* launches — and the World's Fair overall track ($840K prizes, $250K pre-seed via the Colosseum Accelerator) is where the real value is. This document is the reconsideration: **if** the house takes the Meteora track, here is what "making it real" would look like, designed into the product rather than bolted on.

**Relationship to the house:** This is a *candidate fourth desk*, in the same sequence as Isabel/Jay in the [Roadmap](../ROADMAP.md) §5. It reuses every shared seam the house already owns (mandate → offering → desk runtime → adapters → controller → voice → dual-env flags → paper/live split). It does not touch Jesse's verified-catalog integrity and does not move any approved work.

---

## 1. The decision being proposed

Add a **Meteora launch desk** (working name Halley) whose single job is a **voice-driven, fundamental-anchored price-discovery launch of a tokenized equity (or equity pair)** onto a Meteora **DBC** bonding curve, graduating into **DAMM v2** liquidity — entering the World's Fair **Meteora DBC track** as a secondary, while anchoring the primary submission on the **Solana track + overall top-20/Grand Prize**, and treating the **Accelerator** as the prize that actually matters.

The defensible core, in one line:

> When a tokenized stock is newly issued or thinly traded, the caller *rings the launch desk* and the broker takes the name onto a DBC whose opening price is **anchored to the real equity** (the Pyth feed the house already ingests) inside a **tight band** — not a 0→∞ pump. USDC bonds the curve as it comes in; at the graduation threshold the pool migrates to DAMM v2, and the desk's tape then *watches the launch discover price* before it becomes a normal trade. The flagship configuration is the **stock-pair** (NVDAx quoted in AAPLx), where the curve discovers the *relative* price — the exact "stock-pairs" idea the category calls out.

That framing is deliberate. A DBC launch with a flat pump curve is "a meme coin with a ticker." Anchoring the band to a **fundamental reference** is what makes it *about equities*, and it is the single decision that separates this from the meme-stock meta the category asks you to outlast.

## 2. Why a new desk, not a Jesse re-tag

This is forced by the house's own contracts, not a preference.

- An **offering** is `mandate + instrument + rail + venue` (`lib/desk/offerings.ts`), and the governing rule is *"similar exposures on different rails remain distinct, never a silent substitution."* A DBC launch is a different **venue** (Meteora, not Jupiter) *and* a different **issuer boundary** (a name being *launched*, not a verified Backed mint with a live Scaled-UI multiplier). Forcing it into `backed-xstocks`/`jupiter` would corrupt the one property the Jesse desk is honest about — its verified catalog.
- The house metaphor already solves placement: **each desk is a broker doing one job on one rail.** Hetty = Base/trade, Jesse = Solana/trade. A launch is a *different job* (bring a new name onchain and discover its price), so it gets a *different broker*. That is idiomatic, scales the existing seams, and makes "depth of Meteora integration" *inherent* — the desk exists to use Meteora — rather than decorative, which is the line a bolt-on fails.
- Consequence: a launch's mint is **created at launch time**, so its offering cannot come from the static `SOLANA_INSTRUMENTS` catalog. `lib/desk/offerings.ts` needs a **dynamic `LaunchOffering` variant** whose instrument id resolves *post-deploy*. This is the one genuinely new shape in the offering model; everything else is a new row in existing tables.

If the lead instead wants a *feature on Jesse* rather than a desk, the honest answer is that it does not fit: it would mean Jesse — whose catalog is verified mints with a live multiplier — also *launches* tokens, which is a job change, not a feature. The desk boundary is where this idea keeps the house coherent.

## 3. How it maps to the Meteora judging criteria

| Criterion | How this design answers it |
|---|---|
| **Depth of Meteora integration** | The desk's one job *is* DBC → DAMM v2. Not an add-on to a trading desk; Meteora is the venue the desk was built for. This is the line a bolt-on fails and a launch desk passes. |
| **Technical execution** | Reuses the house's proven proposal/gate/reconcile live pattern (`lib/solana/live-submit.ts`) and the dual-env-flag model (`lib/solana/flags.ts`). New code is a new rail, not a rewrite. |
| **Originality and taste** | Voice-first broker + fundamental-anchored **equity-pair** curve is new in the category. "Lasts beyond the meme-stock meta" by design (the anchor), not by claim. |
| **Impact potential** | A *class* of launches (any thinly-traded name or pair), not one token. |
| **Traction/Volume** | **Weakest line** for an 11-day build. A real (tiny) mainnet launch with participation is what can be shown; do not pretend volume is high. A conviction pool seeded by the team is the honest version of "people participating." |

## 4. Design into the product — seam by seam

| Seam | File | What changes |
|---|---|---|
| Mandate | `lib/desk/mandates.ts` | Add `meteora-launch` (Solana rail, venues `meteora-dbc` / `damm-v2`, USDC quote). |
| Offerings | `lib/desk/offerings.ts` | Add a **dynamic `LaunchOffering`**: the mint is created at launch, so the instrument id resolves post-deploy, not from the static catalog. |
| Desk runtime | `lib/desk/registry.ts` | Add `halley` to `RUNTIME_BASE` + `EXTENDED_CAPABILITIES`; add `DESK_CAPABILITIES` in `lib/house.ts`. |
| Adapter + execution | **new `lib/meteora/`** | DBC config builder, launch estimate (projected price path), launch submit (mirrors `live-submit.ts`), graduation→DAMM v2 watcher. |
| Controller | **new `lib/meteora/useHalleyDesk.ts`** | Reuse the `useJesseDesk` state machine; add a `launch` stage + `launchDraft` shape. |
| Voice | `lib/meteora/desk-tools.ts` | New launch handlers, same progressive-reveal + paper-only pattern as `lib/jesse/desk-tools.ts`. Live is the on-screen wallet ceremony, never voice. |
| Flags | **new `lib/meteora/flags.ts`** | Dual env gate; paper open, live off by default. |
| Surface | Room view | A **launch slip**: the bonding curve drawn on the ticket, graduation threshold, and a live price-discovery tape after launch. |

### 4.1 Concrete drop-ins (matched to the existing shapes)

```ts
// lib/desk/mandates.ts  — new entry
'meteora-launch': Object.freeze({
  id: 'meteora-launch',
  label: 'Meteora Launch Desk',
  product: 'DBC bonding-curve launch → DAMM v2',
  issuer: 'Meteora DBC',
  rails: [{ kind: 'solana', network: 'solana:mainnet' }],
  venues: ['meteora-dbc', 'damm-v2'],
  quoteAsset: 'USDC',
  status: 'active',
}),
```

```ts
// lib/desk/registry.ts  — RUNTIME_BASE entry
halley: Object.freeze({
  deskId: 'halley',
  coverages: Object.freeze([
    Object.freeze({
      mandate: MARKET_MANDATES['meteora-launch'],
      adapters: Object.freeze({
        quote: 'meteora-dbc', marks: 'damm-v2',
        execution: 'meteora-live', voice: 'elevenlabs-convai',
      }),
    }),
  ]),
  storage: Object.freeze({ scope: 'browser-local', engine: 'controller', historyLimit: 100 }),
  presentationDefault: 'room',
  surface: 'halley',
}),
```

```ts
// lib/meteora/flags.ts  — same dual-gate shape as Jesse
export function halleyPaperClientEnabled() { return process.env.NEXT_PUBLIC_HALLEY_PAPER_ENABLED !== 'false'; }
export function halleyLiveClientEnabled()  { return process.env.NEXT_PUBLIC_HALLEY_LIVE_ENABLED === 'true'; }
export function halleyLiveServerEnabled()  { return process.env.HALLEY_LIVE_ENABLED === 'true'; }
export function halleyLiveEnabled()        { return halleyLiveClientEnabled() && halleyLiveServerEnabled(); }
```

## 5. Voice tools (progressive reveal, paper-only)

Mirrors the `lib/jesse/desk-tools.ts` table. Handlers execute in the caller's browser against `useHalleyDesk`; **no handler signs or submits** (the house rule: voice cannot sign, submit or reconcile).

- `choose_pair` — base xStock + quote xStock (the equity-pair axis; single-name launches use a USDC quote).
- `choose_curve` — `flat` / `exponential` / `long` / **`equity-pair`** (the anchor).
- `set_graduation` — USDC threshold at which the pool migrates to DAMM v2.
- `request_launch_estimate` — the **projected** price path for the chosen config. Labeled an *estimate, never an order*; never an executable figure.
- `watch_launch` — the price-discovery tape after graduation (venue duplex, honest stale/unavailable).
- `describe_desk`, `cancel_instruction` — standard.
- `confirm_launch` — appears **only after** the estimate is in review (progressive reveal, same as `record_paper` on Jesse). It *prepares* the server launch proposal; the actual sign is the on-screen wallet ceremony, exactly as live settle is today.

## 6. Curve presets (the "novel config" credit)

| Preset | Meaning |
|---|---|
| `flat` | Near-linear bonding; minimal early price movement. |
| `exponential` | The default meme-style curve; shown for contrast, not the story. |
| `long` | Extended low-movement tail before the steepening; slower discovery. |
| **`equity-pair`** | **Opening price anchored to the Pyth ratio of the two equities; low-volatility band.** This is the differentiator — price discovery *around a fundamental anchor*, for a single name (vs USDC) or a relative price (vs a peer xStock). |

The `equity-pair` band reuses the house's existing Pyth ingestion and the reference-difference math from the Jesse market contract — the same data path that powers the venue/reference duplex, redirected into a launch price anchor.

## 7. Live launch (reuses the Jesse live pattern)

`lib/meteora/live-launch.ts` mirrors `lib/solana/live-submit.ts` almost line-for-line:

- A server-side **launch proposal** in the same Redis/memory store, with `expiresAt`, wallet match, `signedTransactionBindsToProposal`, and an idempotency key.
- Reconcile **two** signatures: the DBC-init signature *and* the DAMM v2 migration signature (a graduation is two onchain steps, not one).
- Default **off** at both server and client (`HALLEY_LIVE_ENABLED` / `NEXT_PUBLIC_HALLEY_LIVE_ENABLED`); neither alone enables real funds — identical posture to `JESSE_LIVE_ENABLED`.
- State machine, unknown-outcome handling, and "never rebroadcast a different order" rules carry over unchanged.

The launch *issuing* of the security mint is **out of scope** — see §9. What is in scope is *venue* (a DBC for an existing Backed mint, or a relative-price pair), not *issuer*.

## 8. Scope and the 12 Oct 2026 deadline (~11 days)

**Scope 1 — the defensible core (must land).** Launch an **existing** thinly-traded xStock (or an xStock *pair*) onto a DBC for price discovery, graduate to DAMM v2, on **mainnet with a tiny real USDC commitment**. The house is *venue*, not issuer (Backed issues; the desk provides the launch venue) — this keeps the regulatory surface clean and the build fast. Scope 1 alone satisfies "working code on mainnet" + "depth of integration."

**Scope 2 — the differentiator (attempt only if Scope 1 is solid).** The **conviction pool → DLMM** graduation: commit USDC pre-launch, and migrate that position into a **DLMM** at graduation instead of flat DAMM v2. This is the "creative end-to-end flow using all of our stack (DBC, DAMM v2 and DLMM)" and the strongest originality card. It is also the riskiest piece.

**Out of scope (explicit).** *Issuing a brand-new stock mint.* Issuance authority + securities law is a real surface the house should not promise to judges in 11 days. The "new name" framing stays a **venue for existing/relatively-thin mints**, never an issuer.

### Suggested sequence

| Day | Work |
|---|---|
| 1–2 | **Feasibility gate (do this first):** DBC **devnet spike** for an existing xStock pair — deploy, fund, observe the graduation→DAMM v2 call sequence and the exact init/graduate transactions. Everything else depends on this. |
| 3–4 | Server launch proposal + launch estimate (projected price path). |
| 5–6 | `useHalleyDesk` controller + the curve-on-the-slip Room UI. |
| 7–8 | Voice tools + deterministic grammar. |
| 9–10 | Conviction-pool/DLMM (Scope 2) **or** harden + demo. |
| 11 | Copy, one clean mainnet launch, and grant `dannxbt` read access (the category requires it for closed repos — this repo is closed). |

## 9. The honest risks

1. **Regulatory.** A stock-token launch is a securities action. Keeping the house as **venue** (existing Backed mints / a relative-price pair) rather than **issuer** is the clean path. Judges in a trading category will probe this; name it proactively in the submission.
2. **The DBC-from-zero instinct.** The naive read is "launch a stock from $0 up a curve" — that is a meme pump with a ticker. The anchored band is what makes it *about equities*. Do not lose it in the build.
3. **Mainnet traction bar.** "We prefer projects who have gone live on mainnet and have people actively using it." Usage cannot be faked in 11 days. A conviction pool seeded by the team is the honest version of "people participating"; frame volume as "first launch live," not high.

## 10. What a go decision requires

This is a proposal. Before it becomes a workstream, the lead should settle:

- **Do we take the World's Fair at all**, and is Meteora-DBC the right secondary given the existing *decline* in [STOCKLANA_BUILD_PLAN.md](STOCKLANA_BUILD_PLAN.md) §1? (The World's Fair overall track is the real value; Meteora is one lever.)
- **Venue, not issuer — confirmed as the hard line?** If the lead wants a true "new name" launch, that is a separate, larger, legal question, not an 11-day build.
- ~~**Is the devnet spike green?**~~ **Answered 2026-10-02 — yes.** The full Token-2022 pair lifecycle (create → trade → DAMM v2 migrate) is proven on devnet; see §11. The remaining gate is the product go/no-go, not protocol feasibility.
- **Does Halley get a broker, or is it a mode?** This plan assumes a desk. A "launch mode on Jesse" is the alternative and, per §2, does not fit the verified-catalog integrity.
- **Submission mechanics:** one submission per team; confirm whether the World's Fair lets a single submission tag both the Solana track and the Meteora sidetrack, or whether the Meteora sidetrack is a separate Superteam entry.

## 11. Open technical questions (resolve in the spike)

**Spike completed 2026-10-02 — green.** Full evidence and tx links live in
`~/Dev/meteora-dbc-spike/RESULTS.md` (isolated repo, nothing in production code).
A Token-2022 quote-mint pool (mock xStock pair) was launched, traded, and
migrated to DAMM v2 on devnet end-to-end — no token badge, no keeper, no
Meteora-side allowlisting required for a plain Token-2022 mint.

Resolved by the spike:

- **Exact DBC init/graduate transaction shapes** — `createConfigAndPool` (one
  tx) → buys → `migration_damm_v2` (one tx, permissionless once the pool state
  machine reaches `LockedVesting`). Migration progress is
  `PreBondingCurve → [PostBondingCurve] → LockedVesting → CreatedPool`; with
  zero vesting configured the curve-completing swap jumps straight to
  `LockedVesting`, and `create_locker` is only required when vesting is set.
- **Valid DAMM v2 migration config** — not the generic index-0 config. The
  program requires `poolCreatorAuthority ==` the DBC pool authority PDA plus
  full-range sqrt prices, `vaultConfigKey == default`, Timestamp activation,
  and an unscheduled linear/exponential fee scheduler. Devnet: config indices
  20000–20006 (`7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd` used here).
- **Token badge** — required for real xStocks (they carry `permanentDelegate`,
  `transferHook`, `pausableConfig` etc., beyond the metadata-only permissionless
  set) and **already resolved on mainnet**: Meteora has created badges for all
  three catalog mints (verified via RPC — badge PDAs exist for AAPLx, TSLAx,
  NVDAx). Meteora's own docs describe the badge path as "the path used for
  Stock Tokens." Zero transfer fee is enforced at badge creation and on every
  quote transfer; DBC-owned DAMM v2 migration configs carry
  `CreatePoolWithoutMintValidation` so badged mints graduate cleanly.
- **Fees/quote-token behavior on a stock pair** — a Token-2022 quote mint
  behaves identically to SPL through the whole lifecycle; the only friction is
  thin-curve tail buys, which need `swap2` `PartialFill` rather than `ExactIn`.

Still open (product-side, not protocol):

- Where the equity-pair anchor reads the Pyth ratio and how the band bounds are set per the launch config (reuse `lib/solana/market/` normalization).
- The dynamic `LaunchOffering` shape: how a post-deploy mint id enters `INSTRUMENT_OFFERINGS` without touching the static verified catalog.
- Whether the conviction pool is a DAMM v2 position or a separate deposit program, and how it migrates to DLMM at graduation (this decides whether Scope 2 is realistic).

---

*This document is a design proposal for evaluation. It changes nothing in the product, the registry, or the approved Stocklana submission. It supersedes nothing; it is the reconsideration the World's Fair's Meteora track makes worth re-litigating, and it records the prior decline so the decision is made with that history in front of it.*
