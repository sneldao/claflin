# Stocklana submission pack

**Deadline:** Friday 25 September 2026, 16:00 ET.  
**Primary track:** Stocklana main. Secondary: PreStocks bounty (evidence duplex). Pyth bounty only if Pro entitlement lands.

## Deep link judges must open

```
https://claflin.trustfall.xyz/?desk=jesse
```

(Replace host with the deployed production URL if different.)

- First visit with no preference → Claflin foyer (house, then desk doors).
- `/?desk=jesse` → Jesse Solana desk immediately.
- `/?desk=hetty` → Hetty Base desk.
- Last open desk is remembered in `claflin.desk.v1.last`.

Do **not** submit bare `/` without `?desk=jesse` for Stocklana — judges may land on the foyer or a remembered Hetty session. Prefer the Jesse deep link.

Optional Room demo: `/?desk=jesse&view=room` (same controller; `/night-desk` redirects there). Do **not** demo `/night-desk?study=1` fixtures as live markets.

## Architecture one-liner

**House → desk → view.** Voice or typed intent → desk controller → market estimate → explicit paper ledger. Desk chooses market (Jesse/Solana or Hetty/Base). Room and Compact are two layouts of the same work. Vendors supply audio and market data; the application owns instruments, quotes, refusal, and filing.

## Prior-work disclosure (paste into submission)

Claflin is an existing Deco-futurist brokerage house product. Before Stocklana, the live working desk was **Hetty Green on Base** (Coinbase Tokenized Stocks paper flow, ElevenLabs ConvAI, optional gated Base execution).

**New for Stocklana (Jesse Livermore / Solana):**

- Seated Solana paper desk with verified Backed xStock catalog (Token-2022, live scaled-UI multiplier at quote time)
- Jupiter Swap v2 Metis paper estimates and v2 local paper records
- Jesse ElevenLabs ConvAI line + deterministic speech grammar (same path as typed commands)
- Room/Compact live views of the same controller (`NightDeskScene` overlays for Room; seated grid for Compact)
- PreStocks issuer-mark vs token-price duplex (evidence only; honest unavailable degradation)
- House foyer so Claflin is the institution and open desks (Base vs Solana) are explicit market doors

**Not claimed:** live Solana execution, Pyth Pro numerical comparison (stays honest-unavailable without entitlement), or that `/night-desk?study=1` fixtures are live markets.

## Demo script (~2–3 minutes)

1. **Problem (10s).** Equity reference and token venue are different markets — hours, units, executable terms.
2. **Open Jesse.** Load `/?desk=jesse` (or `/?desk=jesse&view=room` for Room view). State: Claflin house, Jesse’s Solana desk, Backed xStocks. Room and Compact are the same work.
3. **Voice-first.** Ring the line (or tap) “buy 100 USDC of AAPLx”. Show the slip: Jupiter · Token-2022 · mint · scaled multiplier.
4. **Correct.** Tap or speak “make that 50 USDC of AAPLx”. New slip supersedes; old authority gone.
5. **Evidence.** Show PreStocks duplex (issuer mark vs token) — labelled not arbitrage. If Pyth compare is unavailable, say so honestly.
6. **File + return.** File paper record → reload → record still there.
7. **Refuse.** “buy DOGE on Solana” → clarify/refuse; catalog boundary holds.
8. **Close.** Architecture one-liner + exact scope: paper Solana desk, no live wallet path in this release.

If the mic fails on camera, tap the same hearable phrases — identical controller path.

## Submission checklist

- [ ] Deployed URL with `?desk=jesse` verified in a fresh browser profile
- [ ] Video recorded from the script above
- [ ] GitHub link to this repo
- [ ] Prior-work disclosure included in description
- [ ] Team members invited on the form
- [ ] PreStocks track checked only if the duplex is shown in the video
- [ ] No claim of live Solana trading or fabricated Pyth numbers

## Foyer door copy (what judges should read)

| Desk | Market | Access |
|---|---|---|
| Jesse Livermore | Solana | Backed xStocks · Jupiter · Solana paper |
| Hetty Green | Base | Coinbase Tokenized Stocks · Base paper |
