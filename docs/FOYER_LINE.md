# The Foyer Is the Line

**Date:** 2026-09-24 · **Status:** Phases 0–2 and 4 shipped on `main` for the Stocklana submission (copy truth, turret, board, desks/answers/footer/handset). Phase 3 waits on an accepted real recording; Phase 5 waits on a real event source · **Owner:** product lead
**Decided 2026-09-24:** Space is the house line in the foyer; `H` stays the desk line inside a room. There is no house-level voice agent; dictation plus lamps routes. The example call waits for an accepted real recording (Phase 3).
**TL;DR:** `/` stops being a page *about* voice trading. It becomes a working **dealer turret**: one push-to-talk line into the house, the verified offerings that match what you said light up, the desk writes a slip, and nothing moves until you sign. Everything else on the page (the board, an example call, the slip anatomy, the desks, straight answers) explains that one action. The page is strongest when NYSE is closed, which is most hours of the week.

This document owns **foyer anatomy and its build sequence**. [Product Direction](PRODUCT_DIRECTION.md) still owns principles and the information hierarchy, and wins any conflict. [ROADMAP.md](../ROADMAP.md) §1a owns sequencing against other work.

---

## 1. The one sentence

> **Pick up the line, say what you want, and the desk writes it up onchain. Nothing moves until you sign.**

Every section below must make that sentence more true or easier to believe. If a section does neither, cut it.

## 2. Why a turret

A trading-floor **dealer turret** is a console of lit direct lines. You press a line to talk, the broker reads the order back, and the order is written on a ticket. It is the original voice-first trading interface, and it matches the house's existing grammar (line, slip, stamp, ledger). It is also a working control, not a mascot, which keeps it within the exclusions in Product Direction ("not a spectacular phone as the product").

## 3. Differentiation, stated honestly

| Everyone else | Claflin |
|---|---|
| Hero art, feature cards, "Launch app" | The first screen is the working line |
| Voice as a feature bullet | Voice is the primary gesture; typing is always one key away |
| A static page | The page follows the NYSE session: its headline and floor state change at the bell |
| Tokenized-stock price only | Token price **next to** its stock reference, with the gap shown, where the desk observes one |
| "Trade responsibly" small print | Safety as ritual: read-back, expiring quote, your signature, the stamp |

## 4. Anatomy (top to bottom)

Sections are ordered by attention layer (Product Direction → Information hierarchy). The work comes first; myth comes last.

### 4.1 The turret (the work; first viewport)

```
CLAFLIN                                     NYSE ● CLOSED · opens in 9h 12m
The floor is dark.
The line is open.
Trade tokenized US stocks by voice, onchain, any hour.        ← plain subhead (FOYER_LEDE)

┌──────────────────────────────────────────────────────────┐
│ ▁▂▃▅▂▁▃▆▃▂   [ HOLD SPACE TO TALK ]      or type ↵        │
│ "Buy Apple for a hundred dollars."                         │
└──────────────────────────────────────────────────────────┘
Paper by default · Only you can sign                          ← FOYER_BOUNDARY, once

◉ LINE 1  HETTY · Base · AI broker     ◉ LINE 2  JESSE · Solana · AI broker
○ LINE 3  ISABEL · coming soon          ○ LINE 4  JAY · coming soon
```

- **One primary action: the house line.** Hold Space (desktop, when focus is not in a field or button) or press and hold (touch). Release to send. This uses the existing dictation path (`/api/dictation` → `dictation-parser`). The words fill the same foyer instruction the input already drives, and there is no second parser.
- **Type is the equal fallback.** The instruction input stays; ↵ submits. The whole journey works without a microphone (Product Direction: immersion optional).
- **The mic is used only on the gesture.** No permission prompt on load. The first hold explains the prompt in one line. A denied permission falls back to typing, with an honest note.
- **Lines are lamps, not a chain picker.** Before any instruction, open lines glow evenly. After an instruction, `offeringGroupsForInstruction` decides which lines light:
  - one matching offering → that line lights, and "Ring Jesse with this" appears on it;
  - several (e.g. AAPLc on Base and AAPLx on Solana) → both light and the house **names both offerings**. The caller picks. The house never picks a rail silently (Product Direction, decision 1; ROADMAP: similar exposures stay separate);
  - none → no line lights, and the house says so plainly with the supported names.
- **Ringing** still hands off to the desk's own ConvAI session via `requestRingOnArrival`. A single house-level voice agent is **out of scope** until per-desk calls are accepted, so we are not adding a third agent with its own honesty surface.
- **Planned desks** stay unlit lamps with "coming soon". That is a restrained directory detail, not a grid and not a clickable room.
- **"AI broker"** appears on every lit line. Human names plus "Ring" must never read as a human on the phone.

### 4.2 The market-aware headline (weather that carries the argument)

`lib/market-clock.ts` already knows open/closed. Extend it (pure, tested) with **time to next open / close** and state-specific copy:

| Exchange | Kicker | Headline |
|---|---|---|
| Closed (overnight, weekend, holiday) | `NYSE ● CLOSED · opens in 9h 12m` | The floor is dark. / The line is open. |
| Open | `NYSE ● OPEN · closes in 2h 39m` | The floor's loud. / We're still here at 4:01. |
| Unknown calendar year | weekday/hours rule, no countdown | the closed or open copy, without a countdown |

SSR paints a neutral fallback (current behavior); the client swaps after hydration. The page should also change with the session: at the close the floor behind the office dims. That change is driven by the clock, never by an animation loop, and is honoured by reduced motion.

### 4.3 An example call (proof before the ask)

A short call plays **muted with captions** beside the slip it writes. It needs one tap to hear.

- **It is labelled as an example**: `EXAMPLE CALL · recorded <date> · prices on the slip are from that call`. It is never presented as live, and its prices are never styled like tape marks (Product Direction: fixtures never presented as live).
- **Source:** a real recorded paper session from Hetty or Jesse, with its transcript and the slip it produced. It is not a script written for marketing. If no accepted recording exists, ship the transcript and slip as static text with the same label, or omit the section.
- **What it must show:** the caller speaks naturally; the broker names **both** offerings when two exist and the caller picks; the broker **reads back** the order; the quote has a visible expiry; the caller says "paper it"; the stamp lands.
- It ends with the turret pulsing once: "Your line. Hold Space."

### 4.4 The slip, annotated (replaces "How the line works" 01/02/03)

One oversized slip. Each field has a plain-English note (tap or hover, and always available to assistive technology):

| Field | Note |
|---|---|
| `via NVDAc · Base` | A Coinbase-issued token that tracks NVDA. It is not the share itself. → rights and restrictions |
| gap vs stock reference | What the token is trading at relative to its stock reference, where the desk observes one |
| quote expiry | Venue quotes expire. When the time runs out, you get a fresh quote. A stale price is never filed. |
| Sign & settle | Your wallet signs. Claflin never holds keys or funds. (Shown only when the desk's live gate is on.) |
| File as paper | A simulated record at the real estimate. It is kept in this browser, and no money moves. |

Copy constraints: "estimate", not "a real price" (fixes the old step-02 contradiction). "Paper record", not "file paper". Use the terms in `SLIP_ACTIONS` and `MODE_HINTS`; do not add new wording for the same facts.

### 4.5 The board (replaces the House Book cards)

One dense, scannable table. It replaces seven repeated cards.

`NAME · TOKEN · ISSUER · RAIL · VENUE · TOKEN MARK · STOCK REF · GAP · LINE`

- Shared facts (quote asset USDC, "paper estimate") move to the table caption and are not repeated per row.
- Rows expand to show the contract or mint (explorer link), what the token legally is (one sentence per product family), who is eligible, and the source and freshness of each number. That is where "verified" earns its name.
- **Gap honesty:** Jesse has `stockReference.differenceBps` today. Hetty's Chainlink marks do not carry a stock reference, so her gap cell reads `—` with "no stock reference on this rail yet". Never compute a gap from mismatched sources.
- Every number carries its source and time (`as of 11:21:04 ET`) or `STALE` / `unavailable`, exactly as the wire does today.
- The scrolling wire moves to a thin tape strip at the foot of the turret and keeps its `aria-hidden` duplicate copy.

### 4.6 After-hours pulse (optional; real counters only)

"Since the 4:00 PM bell: N calls · N paper records · last slip 2 min ago" ships **only** when those counters come from a real, server-side, per-event source with a documented retention. Until then the section does not exist. There is no placeholder, estimate or seed number (Product Direction: no fake market activity; no invented subscribers).

### 4.7 Meet the desks (character after comprehension)

Hetty and Jesse get one card each: AI broker; covers X on Y; how they look at the tape (Hetty: downside first; Jesse: price action and timing); a fact-checked, attributed line; a short **real** voice sample, or none (Product Direction: previews must be real). This is the only place history leads.

### 4.8 Straight answers

Written in the house voice as "Questions callers ask": Is this a real share? Can I use this from the US? What does it cost? What if the token drifts from the stock? Can the desk trade without me? ("No. No signature, no trade.") Where does my record live? Answers link to the owning docs and to the eligibility copy per product family.

### 4.9 Footer

"Every slip on the record." (retires "The house keeps the record". In trading, "the house" is the side that always wins.) Legal and risk links, who built this, and "Coming soon: Isabel (Robinhood Chain) · Jay (Arbitrum)" (retires "Later —").

## 5. Design language (foyer-specific additions)

Material and type follow Product Direction → Art direction (deep green/ink, brass, ivory paper; Fraunces / IBM Plex Sans / JetBrains Mono). The foyer adds:

- **Turret lamps** are the only glowing elements above the fold. Glow carries state (open line / match / planned), which is dual-coded with text per decision 11.
- **Sound:** off by default, one visible toggle. Only three sounds: line pickup, an opt-in floor murmur while NYSE is open, and the stamp. No sound during speech.
- **Motion:** slow and physical. Slips slide, stamps land, lamps warm. Nothing floats. Reduced motion shows the end states.
- **Mobile:** the phone *is* the handset. A full-width hold-to-talk bar sits in thumb reach, and the slip rises from the bottom like a receipt. Type stays one tap away.

## 6. Non-negotiables carried from Product Direction

- Voice cannot sign, submit or reconcile. A spoken "yes" never settles live.
- A rail or offering is never chosen silently; similar exposures stay separate.
- Every price shows its source and freshness; examples and fixtures are labelled and never styled as live.
- No microphone, account or wallet is required to see or use the foyer.
- Paper/live is stated once in the foyer (`FOYER_BOUNDARY`) and once at the consequential action.
- No counters, stats or activity that are not backed by real events.

## 7. Build sequence

| Phase | Scope | Touches | Gate |
|---|---|---|---|
| **0: Copy truth** | Market-aware kicker + countdown; plain subhead (`FOYER_LEDE`, already defined but unused); "AI broker" on lines; gap label "vs stock ref"; step-02 "estimate" wording; footer "Every slip on the record." + "Coming soon" | `lib/market-clock.ts`, `lib/desk/ui-copy.ts`, `HouseFoyer.tsx`, `tests/house-foyer.test.ts`, market-clock tests | Unit + typecheck. Safe before Stocklana; does not touch `/?desk=jesse` |
| **1: The turret** | Push-to-talk house line over existing dictation; line lamps lit by offering match; the named choice when several offerings match; mic-denied fallback | `HouseFoyer.tsx` (extract `HouseTurret.tsx`), `useDictation` reuse, CSS module | Keyboard/touch/reduced-motion QA; mic-denied path; no mic on load (existing test) |
| **2: The board** | Table + expandable rows; per-number provenance; honest gap column | `HouseOfferings.tsx` → board, offering metadata for rights/eligibility | Offering tests; no gap from mismatched sources |
| **3: The slip, annotated + example call** | Annotated slip; labelled example call from an accepted real recording | New foyer section; reuse `WrittenSlip` | Recording accepted and labelled; captions |
| **4: Desks, answers, footer, mobile handset** | §4.7–4.9, §5 mobile | Foyer + CSS | Mobile viewport QA |
| **5: Pulse + metrics** | §4.6 only with real counters; §8 instrumentation | `lib/analytics.ts` / events store | Documented retention |

**Timing:** Stocklana submits 2026-09-25 16:00 ET. Phases 0–2 are what ships for judging, since the page is frozen while it is judged. The board's product facts (§4.5) come from the issuers' own documents: Coinbase via the Base guide (reviewed 2026-09-05), and Backed via docs.xstocks.fi's product legal overview (fetched 2026-09-24). Re-check both before any later release.

## 8. How we know it works

Establish baselines first; do not invent targets (Product Direction → evaluation).

- Time to first instruction (spoken or typed) on a first visit
- Share of instructions spoken versus typed, and the mic-denied rate
- Instruction → matching offering resolved → desk entered → estimate → paper record
- Share of first sessions that file a paper record
- **After-hours share of instructions.** This tests the core bet. If it is low, the "book doesn't close" argument isn't landing.
- Comprehension check (beta interviews): can the visitor say what the token is, which rail, whether money moved, and where the record lives?

Paid minutes, raw call counts and trading frequency are not success measures.

## 9. Open decisions

- The source for a Base stock reference (so Hetty's gap cell can be filled honestly).
- Which recorded call becomes the example, and who accepts it.
