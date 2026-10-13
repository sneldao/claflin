# Claflin — Pitch Deck Brief (7 slides, build-ready)

**Frame:** This is a hackathon deck, not an investor deck. Judged on: what is new, does
it work, can I *feel* it. The demo is the thesis. Business model gets one line,
not a slide. Total pitch ≈ 3 minutes, of which ~90 seconds is the live walk.

---

## Aesthetic — "The house above the pit"

Early-20th-century brokerage house, built from the product's own visual language.

**Palette**
- Parchment paper `#f4ecd8` (ground), aged cream for raised surfaces
- Ink black `#141210` (type)
- Brass `#6b5a35` (rules, active, the "write" voice)
- Oxidized brick `#8a4a2d` (refusals, warnings — the "softer no")
- Faint graphite for hairline rules

Two voices, used everywhere and never mixed: **brass = the house acts, brick = the
house declines.** The deck teaches the product's honesty system before a word is
spoken.

**Type**
- Display serif for headlines (the house's `--font-display`, period weight, high
  contrast) — one big thing per slide
- Monospace, letter-spaced, small caps for labels, figures, and the "wire" voice
  (ticket lines, stamps, URLs)
- Body serif, short, sparse. Never a paragraph longer than three lines.

**Materials & motifs**
- Paper grain on every slide; hairline brass rules top and bottom
- Wire-tape / ticker strips along edges — one may crawl slowly (static under
  reduced motion)
- Desk-lamp glow in one corner of dark slides (cover, demo)
- Ink stamps — `LIVE`, `PAPER`, `SIMULATION` — that settle onto tickets
  (slight rotation, opacity snap; no bounce — paper doesn't bounce)
- Perforated ticket edges for evidence blocks
- The pit: a faint floor grid visible *below* the house line on the cover and
  close only — the house stands above it

**Motion:** ink draw-in for rules and figures, stamp settle, one ticker crawl.
Everything instant under `prefers-reduced-motion`.

---

## Slides

### 1 — Cover · "Claflin — the house above the pit"
- Subline: *A voice-first brokerage house for tokenized stocks. One house. No
  silent rail choice.*
- Visual: dark room, one lamp lit, the house facade in ink line; ticker strip
  along the bottom edge. The pit grid faintly below the foundation line.
- Say in ~20s: one sentence on what the house is; don't explain tokens yet.

### 2 — Problem · "The market has rails. It has no neutral house."
- Tokenized stocks: one real share, tradeable across several chains and venues.
- What exists: single-issuer storefronts, or DEX frontends with no securities
  posture. Nobody *neutrally* resolves an instruction to the rail that serves it.
- Visual: three small storefront facades, each walled off; the house silhouette
  absent from the middle — a gap.
- Say in ~30s. This is where the 10 seconds of "what is a tokenized stock" lives.

### 3 — What we built · "Say 'buy Apple.' The house resolves it."
- One spoken or typed instruction → distinct rail-specific offerings. Never a
  silent choice; the choice is on the ticket.
- Four specialist desks — **Hetty, Jesse, Tennie, Halley** — each with its own
  rail, instruments, and capability boundary.
- One record of the house: every action lands as a labelled ticket.
- Visual: a row of four brass nameplates (the roster *is* the proof of scope);
  one instruction line types out in the mono voice, then branches to three
  tickets.
- Say in ~40s.

### 4 — Posture · "Truth is the interface."
- Paper by default. Live only where a rail is verifiably open.
- Voice can never move money — only the client signs.
- Every answer is labelled: what's live, what's paper, what we can't do yet.
- Visual: a ticket with three ink stamps settling in sequence — `PAPER`,
  `LIVE`, `SIMULATION` — and one brick-stamp `DECLINED` smaller, to the side.
- Say in ~30s. This is the moat slide; slow down here.

### 5 — Evidence · "What is real, right now."
- An honesty table, ticket style, no metrics:
  - Four working desks, voice to record — *live in this build*
  - Live execution paths on Base and Solana — *open*
  - Halley's launch ceremony — *devnet, end to end*
  - Broker-dealer status — *not ours; labelled, not hidden*
- Visual: the table as a paper docket; each row stamped. No commit counts, no
  vanity numbers.
- Say in ~30s. This is the brand in action — including the uncomfortable row.

### 6 — Demo · "Walk the house. Ninety seconds."
- One big thing: the live URL, set as a brass address plate; repo beneath in mono.
- The walk: foyer → say "buy Apple" → Jesse's room answers → Halley's curve
  draws itself as she speaks it.
- Visual: minimal — the address plate, a single still of the launch card mid-ink
  (pulse visible), the lamp glow.
- Do it live. If the live moment fails, this slide's still is the fallback.

### 7 — Close · "The house is open by construction."
- A fifth rail is a catalog entry, not a rewrite — desk contracts, catalog +
  adapter model, evidence assembly, all open source.
- Revenue rides on settled flow when flow arrives — one line, acknowledged,
  not pitched.
- The doors: live paths on every rail, positions and cost basis, more desks.
- Close on the promise: *Close the gate. Then open the doors.*
- Visual: the house facade from the cover, now with doors open and lamps in
  every window; the pit grid gone from below.
- Say in ~30s.

---

**Build notes (credit-sparing):**
- 7 slides, one HTML file, shared tokens — no new art direction per slide.
- Reuse the house's existing CSS variables (`--desk-paper-*`, brass/brick,
  display + mono faces); the deck should look like the product's paper, not
  a theme applied to it.
- Motion budget: ink draw-in, stamp settle, one ticker crawl. Nothing else.
