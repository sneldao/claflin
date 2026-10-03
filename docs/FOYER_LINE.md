# The Foyer Is the Line

**Date:** 2026-09-24 · **Status:** Phases 0–2 and 4 shipped on `main` for the Stocklana submission (copy truth, turret, board, desks/answers/footer/handset). Phase 3 waits on an accepted real recording; Phase 5 funnel source is in (docs/FUNNEL_METRICS.md); the pulse still waits on real counters · **Owner:** product lead
**Decided 2026-09-24:** Space is the house line in the foyer; `H` stays the desk line inside a room. There is no house-level voice agent; dictation plus lamps routes. The example call waits for an accepted real recording (Phase 3). **Amended 2026-09-28:** Space opens the line only when held past 250 ms while the talk bar is on screen; a tap still scrolls the page, and once the bar has scrolled away Space is the browser's again. **Amended 2026-10-02:** Isabel is seated — LINE 3 is a live lamp that lights on her coverage (Robinhood Stock Tokens), with "Talk with Isabel" opening her own ConvAI session. Jay alone remains "coming soon". **Amended 2026-10-03:** Halley is seated — LINE 4 is the Meteora launch desk on Solana (paper-only: estimates and filed launch records, no live launch path) with his own ConvAI session. Jay is LINE 5, still coming soon. **Amended 2026-10-03 (b):** desk `kind` distinguishes rooms — Halley renders as the launch-desk plate below the brokers grid, launch verbs light his lamp by name in the turret, and the directory calls him "Launch desk".
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

◉ LINE 1  HETTY · Base · AI broker      ◉ LINE 2  JESSE · Solana · AI broker
◉ LINE 3  ISABEL · RH Chain · AI broker ◉ LINE 4  HALLEY · Solana · AI broker
○ LINE 5  JAY · coming soon
```

- **One primary action: the house line.** Hold Space (desktop, when focus is not in a field or button) or press and hold (touch). Release to send. This uses the existing dictation path (`/api/dictation` → `dictation-parser`). The words fill the same foyer instruction the input already drives, and there is no second parser.
- **Type is the equal fallback.** The instruction input stays; ↵ submits. The whole journey works without a microphone (Product Direction: immersion optional).
- **The mic is used only on the gesture.** No permission prompt on load. The first hold explains the prompt in one line. A denied permission falls back to typing, with an honest note.
- **Lines are lamps, not a chain picker.** Before any instruction, open lines glow evenly. After an instruction, `offeringGroupsForInstruction` decides which lines light:
  - one matching offering → that line lights, and "Talk with {broker}" appears on it;
  - several (e.g. AAPLc on Base, AAPLx on Solana, AAPL on Robinhood Chain) → all matching lines light and the house **names each offering**. The caller picks. The house never picks a rail silently (Product Direction, decision 1; ROADMAP: similar exposures stay separate);
  - explicit launch verbs (`launch`, `mint`, `issue`, "new token", "tracker token", "bonding curve") → the launch desk's line lights and the reply names the split — a launch is not a tape ask, the tape lines trade what already exists. Checked before the offering book so "launch an NVDA tracker" does not light Jesse's NVDA line. Vaguer wording fails quiet to the book;
  - none → no line lights, and the house says so plainly with the supported names.
- **A resolved tape ask folds the launch slip.** When the book matches, trade intent is declared and origination leaves the room — Halley's slip hides until the line returns home. The clear key (× in the field, or Escape) is always the way back: lamps idle, the book shut, the slip restored.
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

Hetty, Jesse and Isabel get one card each in the brokers grid: AI broker; covers X on Y; how they look at the tape (Hetty: downside first; Jesse: price action and timing; Isabel: reading the rails — fundamental and sector analysis); a fact-checked, attributed line where one exists (Isabel has none — no verified quotes, so no attribution is invented); a short **real** voice sample, or none (Product Direction: previews must be real). This is the only place history leads.

**Halley stands apart.** He is the launch desk — the room that makes the instrument, not a fourth line on the same book — so he leaves the grid for his own plate beneath it: **ink-dipped, not paper** (the tape desks are printed cards; this is the plate they print from), right-aligned against the left-aligned grid, `THE LAUNCH DESK` kicker, and "Bring Halley a launch" where the broker cards say "Visit". The first reach for the plate does not open the door — it stands a paper explainer to the plate's left (what the room makes, what the token is not, and the way back to the tape desks), with "Enter the launch desk" inside. Entry marks the gate seen (`claflin.launchdesk.v1.seen`); return callers get the door directly and a quiet "What is this desk?" can always reopen the panel. A caller skimming for who to trade with should never mistake origination for another tape line (desk `kind: 'launch'` in `lib/house.ts` drives the split everywhere).

### 4.8 Straight answers

Written in the house voice as "Questions callers ask": Is this a real share? Can I use this from the US? What does it cost? What if the token drifts from the stock? Can the desk trade without me? ("No. No signature, no trade.") Where does my record live? Answers link to the owning docs and to the eligibility copy per product family.

### 4.9 Footer

"Every slip on the record." (retires "The house keeps the record". In trading, "the house" is the side that always wins.) Legal and risk links, who built this, and "Coming soon: Jay (Arbitrum)" (retires "Later —"). Isabel left this line when she was seated; the copy is generated from the planned-desks list, so it stays correct as desks open.

## 5. Design language (foyer-specific additions)

Material and type follow Product Direction → Art direction (deep green/ink, brass, ivory paper; Fraunces / IBM Plex Sans / JetBrains Mono). The foyer adds:

- **Turret lamps** are the only glowing elements above the fold. Glow carries state (open line / match / planned), which is dual-coded with text per decision 11.
- **Sound:** off by default, one visible toggle. Only three sounds: line pickup, an opt-in floor murmur while NYSE is open, and the stamp. No sound during speech.
- **Motion:** slow and physical. Slips slide, stamps land, lamps warm. Nothing floats. Reduced motion shows the end states.
- **The journey layer:** the foyer is walked, not stacked. On desktop with motion allowed, the hero **pins** — the house holds its frame while the tape, the book, and the desks slide past, and the hero's copy lifts and fades (`--hero-exit`) until it steps out of the reading order entirely (`data-away`). Descending the page rides the scene camera along a curve through the room's poses (desk → evidence → review → ledger) and the room itself stages each stop: the lamp's light follows the walk from blotter to evidence board to the open book, the house warms the deeper you go, a slip lands on the desk once you're inside and files itself beside the ledger at the end. Scroll glides with inertia and settles at room boundaries (proximity snap only — it never claims a gesture mid-room); the room under the reading plane gets a pool of warm lamplight while the rest stay untouched; a brass **register** rides the right edge — one labelled stop per room, the current one lit, each a jump anchor; and the broker cards are dealt, not rendered — each settles onto the table in turn and warms under the lamp as it passes the reading plane. The wire reads the room's pace too: scroll velocity feeds the tape's drift and skew, and a scroll up can pull it backwards a touch. Because the pinned hero's talk bar never leaves the viewport, the line docks as a pill at the foot of the page once the hero yields (the same handset phones already use). Every piece degrades the same way: reduced motion and the lightweight graphics path show composed end states — no pinning, instant poses, no glow, native scroll, a still tape — and the register stays, since it's a marker, not motion.
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
| **5: Pulse + metrics** | §4.6 only with real counters; §8 instrumentation | `lib/funnel/*`, `POST /api/funnel`, `scripts/funnel-report.mts` (see FUNNEL_METRICS.md) | Documented retention (90-day TTL) |

**Timing:** Stocklana submits 2026-09-25 16:00 ET. Phases 0–2 are what ships for judging, since the page is frozen while it is judged. The board's product facts (§4.5) come from the issuers' own documents: Coinbase via the Base guide (reviewed 2026-09-05), and Backed via docs.xstocks.fi's product legal overview (fetched 2026-09-24). Re-check both before any later release.

## 8. How we know it works

Establish baselines first; do not invent targets (Product Direction → evaluation). Event source, fields and retention: docs/FUNNEL_METRICS.md.

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
