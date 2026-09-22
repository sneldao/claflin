# Stocklana submission pack

**Deadline:** Friday 25 September 2026, 16:00 ET.  
**Primary track:** Stocklana main. Secondary: PreStocks bounty (evidence duplex) and Pyth Pro equity-vs-xStock duplex (All Access trial; raw-token basis verified). Free venue duplex remains as fallback evidence.

## Deep link judges must open

```
https://claflin.trustfall.xyz/?desk=jesse
```

(Replace host with the deployed production URL if different.)

- First visit with no preference → Claflin foyer and house book (instruction → concrete offering → eligible desk).
- `/?desk=jesse` → Jesse Solana desk immediately.
- `/?desk=hetty` → Hetty Base desk.
- `?offering=<id>` may be added to a desk link only when that catalog offering covers the desk; direct `?desk=jesse` remains sufficient for judging.
- Last open desk is remembered in `claflin.desk.v1.last`.

Do **not** submit bare `/` without `?desk=jesse` for Stocklana — judges may land on the foyer or a remembered Hetty session. Prefer the Jesse deep link.

Optional Room demo: `/?desk=jesse&view=room` (same controller; `/night-desk` redirects there). Do **not** demo `/night-desk?study=1` fixtures as live markets.

## Architecture one-liner

**House → instruction → offering → eligible desk → view.** Voice or typed intent → selected offering/desk controller → market estimate → explicit paper ledger; optional gated live Jupiter settle on Jesse. Offerings carry mandate/rail/venue (Jesse/Backed xStocks/Solana/Jupiter or Hetty/Coinbase Tokenized Stocks/Base/Aerodrome); desk eligibility comes from catalog coverage. Room and Compact are two layouts of the same work. Vendors supply audio and market data; the application owns offerings, quotes, refusal, and filing.

## Prior-work disclosure (paste into submission)

Claflin is an existing Deco-futurist brokerage house product. Before Stocklana, the live working desk was **Hetty Green on Base** (Coinbase Tokenized Stocks paper flow, ElevenLabs ConvAI, optional gated Base execution).

**New for Stocklana (Jesse Livermore / Solana):**

- Seated Solana paper desk with verified Backed xStock catalog (Token-2022, live scaled-UI multiplier at quote time)
- Jupiter Swap v2 Metis paper estimates and v2 local paper records
- Jesse ElevenLabs ConvAI line + deterministic speech grammar (same path as typed commands)
- Room/Compact live views of the same controller (`NightDeskScene` overlays for Room; seated grid for Compact)
- Free venue duplex: Backed issuer quote (or Jupiter xStocks stockData) vs Jupiter venue USD — honest labels when Pyth is cold
- Pyth Pro equity-vs-xStock evidence (Lazer→Redis; raw-token basis verified 2026-09-21 under All Access trial)
- PreStocks issuer-mark vs token-price duplex (evidence only; honest unavailable degradation)
- Env-gated live Solana settle: Jupiter order(taker) → wallet sign → execute (off unless both live flags are set)
- House foyer and offering book so Claflin is the institution: instructions resolve to concrete Base/Solana offerings, and only eligible desks can open them

**Not claimed by default:** that live settle is on in production (flags default off), or that `/night-desk?study=1` fixtures are live markets. Pyth Pro compare requires the Lazer daemon + Redis snapshots; when cold, the panel stays honest-unavailable.

## Demo script (~2–3 minutes)

1. **Problem (10s).** Equity/stock reference and token venue are different markets — hours, units, executable terms.
2. **Open Jesse.** Load `/?desk=jesse` (or `/?desk=jesse&view=room` for Room view). State: Claflin house, Jesse’s Solana desk, Backed xStocks. If time permits, first show `/` resolving “Apple” into separate `AAPLc`/Base and `AAPLx`/Solana offerings; the eligible desk links carry the selected offering. Room and Compact are the same work.
3. **Voice-first.** Ring the line (or tap) “buy 100 USDC of AAPLx”. Show the slip: Jupiter · Token-2022 · mint · scaled multiplier.
4. **Correct.** Tap or speak “make that 50 USDC of AAPLx”. New slip supersedes; old authority gone.
5. **Evidence.** Show **Pyth Pro** compare when available (equity vs xStock). Otherwise venue duplex / PreStocks — labelled not arbitrage. Never invent a Pyth number.
6. **Live path (if flags on).** Connect wallet → prepare live order (tiny size) → sign → Solscan. Otherwise state paper-only for this deployment.
7. **File + return.** File paper record → reload → record still there.
8. **Refuse.** “buy DOGE on Solana” → clarify/refuse; catalog boundary holds.
9. **Close.** Architecture one-liner + exact scope: Solana desk with honest duplex; live settle only when dual-flagged.

If the mic fails on camera, tap the same hearable phrases — identical controller path.

## Submission checklist

- [ ] Deployed URL with `?desk=jesse` verified in a fresh browser profile
- [ ] Video recorded from the script above
- [ ] GitHub link to this repo
- [ ] Prior-work disclosure included in description
- [ ] Team members invited on the form
- [ ] Venue duplex and/or PreStocks shown in the video
- [ ] Live settle: either demoed with both flags on (tiny size) **or** explicitly disclosed as off
- [ ] No fabricated Pyth numbers; no claim that paper is a live fill

## House book copy (what judges should read)

| Desk | Offering mandate | Rail / venue | Access |
|---|---|---|---|
| Jesse Livermore | Backed xStocks | Solana / Jupiter | Solana paper (+ gated live) |
| Hetty Green | Coinbase Tokenized Stocks | Base / Aerodrome | Base paper (+ gated live) |
