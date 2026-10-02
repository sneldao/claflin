# Crypto World's Fair submission pack

**Deadline:** Sunday 12 October 2026, 11:59pm PT (individual registrations must be complete by then too — the form is disabled after).
**Tracks:** Solana + Base + Robinhood Chain (one submission, up to three tracks).
**Judging window:** 14 Sept – 12 Oct 2026. Only work inside the window is judged; all prior development must be disclosed on the form — nondisclosure is disqualifying.

**Repo access (do this before submitting):** the repo is private. Rules allow it only if judges are granted access — invite **hackathon@colosseum.com** to the repo and verify the invite landed. This is the most common disqualifying mistake; have someone outside the team open every submitted link in a fresh browser profile.

## Links judges should open

```
https://claflin.trustfall.xyz/
```

The foyer is the entry — it is the three-track story in one screen. One typed or spoken instruction lights every line that can carry it.

- `/` → the house turret: hold Space to dictate or type; "buy Apple" lights all three desks as separate offerings
- `/?desk=isabel` → Isabel's Robinhood Chain desk (paper-only, voice line live)
- `/?desk=jesse&view=room` → Jesse's Solana desk, Room view (prefer for judging Jesse)
- `/?desk=hetty` → Hetty's Base desk
- `?offering=<id>` may be added to a desk link only when that catalog offering covers the desk
- Last open desk is remembered in `claflin.desk.v1.last` — judges on a fresh profile get the foyer

## Architecture one-liner

**House → instruction → offering → eligible desk → line or ticket.** Voice or typed intent resolves to concrete offerings (product, issuer, rail, venue, quote asset); only desks with verified coverage open. Each desk keeps its own catalog, estimate adapter, evidence, and browser-local paper records; voice client-tools draft and file paper but can never sign or submit. Live settlement is env-gated per rail and fail-closed behind issuer eligibility checks where it exists.

## Prior-work disclosure (paste into submission)

Claflin is an existing Deco-futurist brokerage house product. Before the window opened (14 Sept), the product consisted of the house platform and **Hetty Green's Base desk** — Coinbase Tokenized Stocks paper flow, ElevenLabs ConvAI voice transport, dictation, account scaffolding, and a gated Aerodrome execution path (Hetty's voice layer first committed 2026-09-09).

**Built inside the window (14 Sept – 12 Oct):**

- **Jesse Livermore / Solana desk** — entire `lib/solana/` module first committed 2026-09-17: verified Backed xStock catalog (Token-2022, live scaled-UI multiplier), Jupiter Metis estimates, v2 paper records, Jesse's ConvAI line, Room/Compact views, free venue duplex (issuer vs venue USD) and PreStocks secondary duplex, honest-unavailable Pyth comparison, dual-env-gated live Jupiter settle
- **Rail-neutral house seams** — mandate/offering/coverage contracts (`lib/desk/*`), desk-aware quote/marks routes, foyer turret with instruction→offering lamps, house book
- **Isabel Benham / Robinhood Chain desk (all of it)** — 24-symbol verified catalog (rhj `ASSET_STATUS_ACTIVE` ∩ onchain Chainlink feed ∩ Lighter book), marks adapter (rhj issuer reference + multiplier-adjusted onchain feed), Lighter orderbook USDG estimates with depth/partial-fill labels and share-equivalent multiplier display, three-way evidence tape filed into every paper record, desk surface, turret LINE 3, and her ElevenLabs ConvAI line (`/api/desk/isabel/session`)
- **Eligibility gate** — Hetty's live path now refuses fail-closed unless the wallet carries Coinbase Verifications (Verified Account + non-restricted Verified Country) and a Coinbase-scoped self-declaration; enforced in the ticket and re-checked inside the execution hook

**Not claimed:** that live settle is enabled in production (flags default off); that paper records are fills; that any fixture (`/night-desk?study=1`) is a live market; that Isabel's desk can execute — she is paper-only by design with no live flag.

## Submission form fields

- **Product name:** Claflin
- **Brief description:** A voice-first brokerage house for tokenized US equities. A client speaks or types an instruction at the foyer turret; the house resolves it to a concrete offering — issuer, rail, venue — and lights the desk lines that can carry it. Three live desks today: Coinbase Tokenized Stocks on Base (Hetty), Backed xStocks on Solana (Jesse), Robinhood Stock Tokens on Robinhood Chain (Isabel). Every desk quotes a real venue, labels its evidence honestly, files paper records by default, and never lets voice touch a signature.
- **Blockchains/tools:** Solana (Jupiter Metis, Backed xStocks, Pyth), Base (Aerodrome, Chainlink, Coinbase Verifications/EAS), Robinhood Chain — chain ID 4663 (Lighter orderbook venue, Chainlink stock feeds, rhj issuer REST), ElevenLabs ConvAI, AssemblyAI, Privy, Next.js.
- **Repo:** https://github.com/sneldao/claflin — **grant hackathon@colosseum.com access**.
- **Videos:** two required — a 2–3 min presentation video (the why: market, thesis, who it's for, business plan) and a separate ≤3 min technical demo video (the how; do not pitch in it).
- **GTM/demand:** [founder to fill — target users, distribution, why now]. Keep it honest; judges weight working product over projection.
- **Logo/team/location:** [fill on the form; every member must individually register before the deadline].

## Demo script (~3 minutes, technical demo video)

1. **Open the house (15s).** Fresh profile on `/`. NYSE clock shows closed; "The floor is dark. The line is open." Three lit lines — Hetty (Base), Jesse (Solana), Isabel (Robinhood Chain) — and the wire below carrying live marks from all three rails.
2. **One instruction, three rails (30s).** Type or hold Space and say "buy Apple". All three lamps light; the house names each offering — `AAPLc` on Base, `AAPLx` on Solana, `AAPL` on Robinhood Chain — and does not pick a rail for you. This is the multi-track moment: one house, three ecosystems, no silent substitution.
3. **Isabel's desk (60s).** Open LINE 3 — "Talk with Isabel" rings her ConvAI line. Ask for 100 USDG of Apple: she resolves the instrument, sets the side and amount, and walks the Lighter book for a real estimate. Show the three-way tape filed with it: issuer rhj reference, onchain Chainlink mark, Lighter venue book — labelled, never blended. File the paper record; it lands in her browser-local ledger (`claflin.paper.v2.isabel.*`). State plainly: paper-only, no live flag exists.
4. **Jesse's desk (45s).** `/?desk=jesse&view=room`. Ring Jesse or tap; correct an instruction mid-slip — superseded values stay struck through. Show the venue duplex (issuer reference vs Jupiter venue USD, honest labels). Mention the dual-flagged live path exists; demo only if both flags are on at recording time.
5. **Hetty + eligibility (30s).** `/?desk=hetty`. If live flags are on, show the readiness checklist: the wallet must carry Coinbase Verifications and confirm issuer terms before Approve/Execute unlock — fail-closed, re-checked inside the execution hook.
6. **Close (15s).** The boundary sentence: paper by default, only you can sign, voice cannot move money. One house, one record per desk, no silent rail choice.

If the mic fails on camera, every spoken step has a typed path — same controller, same slip.

## Checklist

- [ ] `hackathon@colosseum.com` granted repo access; verified by a non-team member
- [ ] Every team member individually registered before Oct 12 11:59pm PT
- [ ] `/` verified in a fresh profile: three lines lit, RH marks on the wire, "buy Apple" lights all three
- [ ] Isabel ring tested live: session opens, tool calls drive the ticket, paper filing lands
- [ ] Prior-work disclosure pasted into the form — Hetty + platform disclosed; in-window list matches this doc
- [ ] Presentation video (≤3 min) + technical demo video (≤3 min) recorded and uploaded
- [ ] All content in English (rules §12)
- [ ] Live settle shown only if actually enabled at record time; otherwise stated as off
- [ ] Logo, GTM, team details filled on the form
- [ ] Meteora sidetrack (if taken): separate Superteam Earn submission, due 13 Oct 06:59 UTC — see §5 of the plan

## House book copy (what judges should read)

| Desk | Offering mandate | Rail / venue | Access |
|---|---|---|---|
| Hetty Green | Coinbase Tokenized Stocks | Base / Aerodrome | Base paper (+ gated live behind Coinbase Verifications) |
| Jesse Livermore | Backed xStocks | Solana / Jupiter | Solana paper (+ dual-flagged live) |
| Isabel Benham | Robinhood Stock Tokens | Robinhood Chain / Lighter | Paper-only — estimates, evidence, filing; no live flag |
| Jay Cooke | — | Arbitrum | Planned; a closed room |
