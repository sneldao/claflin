# Claflin — Product

**Merged 2026-11-17** from PRODUCT_DIRECTION, DESK_CANON, ELIGIBILITY, AUTH_AND_ACCESS, DESK_SLIPS and HOUSE_ARTEFACTS (single-source consolidation; full prior text in git history).

This document is the canonical product reference. It owns product direction, desk identity, eligibility policy, the auth/access model, desk slips, and the foyer artefacts. Sibling documents own their own layers and win conflicts there: [ARCHITECTURE](ARCHITECTURE.md) for technical contracts, [DESKS](DESKS.md) for per-desk venue work, [VOICE](VOICE.md) for voice, [UX](UX.md) for surface craft, [OPERATIONS](OPERATIONS.md) for operations, [RELEASE_VALIDATION](RELEASE_VALIDATION.md) for sequencing and release gates, [HISTORY](HISTORY.md) for the retired approach, [README](README.md) for orientation and setup. When a decision changes, update its owning document and link to it rather than copy competing versions across the repository.

---

## Product direction

<a id="product-direction"></a>

### Status

The canonical product cutover was approved 2026-09-05 and the old onboarding/directory experience is retired (see [HISTORY](HISTORY.md)). `/` is Claflin's front door: a fresh visit opens the foyer and house book; an instruction resolves to concrete offerings; only eligible desks can open the selected offering. Hetty covers Coinbase Tokenized Stocks on Base; Jesse covers Backed xStocks on Solana. Live settlement exists only where the selected desk supports it and remains env-gated. Visiting a planned desk is a closed room, not a second trading surface. An optional Sign in control may appear when Privy is configured — it does not gate the desk and is not live access. Stocklana judges should open `/?desk=jesse&view=room`.

### Amendments

- **2026-09-09** — seated working desk first pass; desk isolation and outcome evidence.
- **2026-09-17** — Room/Compact desk views approved; Night Desk and direct desk available from the first visit; nomenclature locked 2026-09-20.
- **2026-09-23** — house presence grammar (voice-first Room, blank slip until intent, shared line foot); lean desk, one boundary per decision point (91ce5d6); "bringing the house to life" approved — the foundation stays, its tone does not.
- **2026-09-24** — the foyer is the line: the first screen is a working dealer turret, not a description of voice trading.
- **2026-10** — desk canon ratified as the source of desk product identity; surface-consistency rules ratified 2026-10-12.

### Governing decision and central idea

**Governing decision:** there are no existing users or collaborators requiring preservation of the old experience. Be intentional about replacement: preserve useful technical capabilities selectively, not legacy flows, identities or product assumptions. Git history and [HISTORY](HISTORY.md) are the reference for the retired approach.

**This document owns jobs, principles, and information hierarchy. It does not own page anatomy.** Do not implement a section because it is named here. In the house, the instruction and concrete offerings come first; inside a desk, the ticket or the line is first; everything else is the room.

**Governing idea:** you are not looking at a trading application with antique styling. You are giving an instruction to a house that keeps a record.

**The central idea:** Claflin is a voice-first trading product expressed as a Deco-futurist brokerage house. Specialist AI brokers help clients turn trading intent into clearly understood, explicitly authorized, verifiable execution. Historic manners and materials coexist with contemporary information and explicit modern safeguards. The world should make trading more understandable and direct, not add a ceremonial layer in front of it. Use a coherent period-inspired world; do not claim a strict reconstruction across eras.

Claflin is the institution. The durable identity order is **Claflin → selected offering, mandate and rail → active desk and broker → current instruction**. The primary loop is **express intent → resolve the concrete offering and access → choose an eligible desk → obtain a quote → review and authorize → execute → verify the outcome and position**. A client who knows what they want can go directly to that path; reading a letter or discussing a thesis is an optional entry/support path, never a required first step.

This is not an AI-service marketplace with a retro skin, not a historical reconstruction, not a claim to be a regulated brokerage. The brokerage is the experience metaphor; AI identity, capabilities, data provenance, and payment boundaries remain explicit. **The user is the client, not the switchboard operator.**

### Audience and job

The initial audience is clients who want a simpler way to discover, understand, and execute supported trades, including expressing an order aloud. Eligibility and access remain mandate-specific, never inferred from the underlying equity or chain. Clients should not need to understand voice vendors or agent registries, but must be able to identify the product, issuer, rail/venue, account, costs, and authorization they are using. Validate audience assumptions in beta rather than assuming a broader market is already proven.

The core job: **help me make the trade I intend, on the right offering, desk, venue and account, under terms I understand and approve, and show me what actually happened.** Research helps clarify intent; it is not a substitute for an execution-capable product.

Paper simulation and testnet transactions are development/validation stages, not the long-term end product. Code presence or a paper/testnet result does not establish release acceptance. A user's decision not to proceed must always be respected.

### Bringing the house to life

**Approved 2026-09-23; supersedes any earlier reading as a ban on energy.** The foundation (honest speech, paper/live separation, explicit authorization, readable HTML) was right and stays. Its tone was not: Claflin is a voice-first 1920s brokerage for one of the most exciting new instruments in markets. It should feel like the tape is running and the broker has a view.

1. **The market is the protagonist.** Tokenized stocks trade onchain around the clock while the exchange sleeps. Say so, with real data: live reference marks on the first screen, a market clock, the onchain-versus-reference gap as a headline where a desk has it. Motion driven by real observations is encouraged. Motion that implies data we do not have is still forbidden.
2. **Voice is the front door, not a sidebar.** The broker's line is the hero of the foyer and of each desk. The ticket is the slip the broker writes while you talk; it remains fully usable by hand.
3. **Brokers have character and a point of view.** Each broker may have a signature line, a period voice, and a stated way of looking at the tape (Hetty: downside first; Jesse: price action and timing). A view is framed as how *they* would examine a question — education, never a recommendation to trade. Quotes stay fact-checked and attributed.
4. **Say the boundary once, clearly, where it matters.** Paper/live mode is stated once — `MODE_HINTS` behind the ModeStamp ⓘ and `LINE_FOOT` at the line foot — plus at the consequential action. Do not repeat defensive disclaimers in every tooltip, caption or aria-label. One clear line beats sixteen defensive ones.
5. **Energy, not incentive.** Still no XP, streaks, turnover rewards or balance thresholds. Excitement comes from the market and the brokers, never from nudging the client to trade more.

Unchanged and non-negotiable: voice cannot sign, submit or reconcile; paper records are never fills; fixtures are never presented as live data; every spoken line is true of what the desk observed; the full journey works without audio, motion or a pointer.

### The foyer is the line

**Approved 2026-09-24.** The foyer's first screen is a working **dealer turret**: one push-to-talk house line (with typing as an equal fallback), lamps for each desk that light when an offering matches what was said, and a headline that follows the NYSE session. The page does not *describe* voice trading — the visitor does it. This is the "work first" rule applied to voice, not a marketing hero: the turret *is* the instruction input. Lines light from offering coverage, never from a chain preference; when several offerings match, the house names them and the caller chooses. Anatomy, copy and build phases live in [UX](UX.md). This document still wins any conflict.

### Desk views (Room / Compact)

Room and Compact (`?view=`) are two views of the same broker and work: **Room** (spatial/conversational) and **Compact** (blotter/low-graphics/keyboard-friendly). Neither is beginner/expert, premium/earned, dark/light theme, or an authorization tier. Both are available from the first visit. Switching view preserves the active desk, selected offering, chain, account, instruction, quote identity/expiry, saved work and existing authorization boundaries.

**Offering selection** chooses the concrete product/rail/venue; **desk selection** chooses the broker relationship; **Room / Compact** are layouts of the same controller. Canonical Room view is `/?desk=jesse&view=room` (`/night-desk` redirects there). Fixture study remains at `/night-desk?study=1` and `/desk-study` in development; fixture prices are never real market data.

Progression means continuity and contextual depth, never unlock:

- First visit: a clear instruction path, not empty history panels or a compulsory tour.
- First explicit paper save: a retrievable paper record, not a fill, rank, ownership certificate or room unlock.
- Return: offer to revisit actual retained work; no invented familiarity or assumed holdings.
- Explicit watch: give that instrument a place in the tray; respect unwatch/delete and actual storage scope.
- A request for more detail: reveal relevant evidence. Material terms remain available at the action regardless of experience.
- A consequential live action: explain the actual product, units, reference-versus-quote distinction, fees and authority; separately enforce access policy and explicit wallet authorization.

No entrance exam, XP, streak, balance threshold, minimum trades, paid-call consumption, or financial success metric unlocks the experience. A contextual comprehension check may support a risky action; passing it never proves eligibility or grants spending authority. Declining to trade is a valid outcome. No account or microphone is required to enter either presentation. The room participates in shared attention, but scene focus never authorizes an action; keep readable HTML, clear labels and keyboard/manual equivalents.

### Decisions that govern the product

1. **Claflin is the institution; the offering and broker are explicit choices.** Personality explains how a broker thinks; a real mandate and concrete offering explain what they can do. The house leads with instruction and product terms, not a chain preference; desks are eligible only for offerings they cover. Expand specialist coverage by verified offerings, not by adding interchangeable AI inventory.
2. **Behavior establishes the world.** A receiver connecting, a quotation slip arriving, or an instruction becoming a filed paper record carries meaning. Glows, arbitrary number animations, fake quotations, and tutorial-advancing gestures do not substitute for it.
3. **Trade facilitation is primary.** Instrument access, quote quality, order review, execution, and outcome tracking take priority over editorial content and call telemetry. Publications or prolonged conversation are never a prerequisite for a trade.
4. **Clarity wins over theater.** No artificial connection waits, surprise microphone activation, fictional market data presented as real, or aesthetics that conceal a financial boundary. A certificate-inspired dossier must not pretend to be a legal ownership certificate. Desk slips may create belonging; they must never be framed as the tokenized stock, a parcel of equity, or a second ownership claim — see [Desk slips](#desk-slips).
5. **Continuity, not consumption.** Help clients resume notes and unresolved questions. Do not reward paid minutes, daily calling streaks, or trading frequency. Limited historical "seat / participation" keepsakes are provenance, not gamification.
6. **Progressive disclosure, not hidden terms.** Expose AI identity, the active paper/live mode, trial terms, paid rate, actual cap, and required approval before the relevant action.
7. **Immersion is optional; usability is not.** The complete journey must work without ambient audio, spatial motion, a pointer gesture, or a desktop-sized viewport. The client must never play "find the trading controls."
8. **A house and desk, not a page.** At the house, the instruction and concrete offerings are the first useful action; inside a desk, the ticket or the line takes over. No hero tour, no marketing homepage before the task. Navigation describes the client's work; scene movement must not compete with review.
9. **Paper is the house language.** The blotter is the draft; a returned estimate is a quotation slip; saved work is a ledger; watched marks are pigeonholes; the ticker is labelled reference, never a fabricated screen. A commemorative desk slip is furniture beside the ledger, not a trading surface. Both desks write the instruction as a sentence and each value carries where it came from; when a price is corrected or set aside the superseded line stays struck through on the same slip.
10. **Every word the desk speaks must be true of what it observed.** Confirmations restate only what the current input contributed. A voice-attributed line originates from that voice. Certainty is computed from evidence or omitted. Missing values stay missing until the client supplies them. See [VOICE](VOICE.md).
11. **Signals carry state; sentences carry decisions.** Light, sound, and motion report *state*; explicit words decide *consequences* (amounts, paper-vs-live, refusals, expiry). Tiers: irreversible or money-moving stays fully explicit, always; reversible-but-time-costly goes ambient-primary with exact words one tap away; zero-cost stays ambient-only. New signals ship dual-coded — glow *plus* caption — and the caption retires after first exposure; the text equivalent stays available permanently. Checklist for every future signal: (1) what does misreading it cost; (2) is the action reversible; (3) do sound-off, motion-off, and screen-reader still get it; (4) is it learnable in one captioned exposure — if not, it is decoration and gets cut.

### Information hierarchy

`/` is the house front door. It is not a landing page with a form attached, and it is not a chain picker. Its first screen is the house line, which is the instruction itself spoken or typed. Identity and attention are different layers; when a proposal adds a surface, say which it belongs to.

**Identity** — durable, so later desks can change the nameplate without replacing the house:

| Order | Layer | Now | Later |
|---|---|---|---|
| 1 | **Claflin** | The house. Wordmark, blotter, document conventions, the record. | Unchanged. |
| 2 | **Selected offering and mandate** | The concrete product, issuer, rail, venue and quote terms chosen in the house book. | More verified offerings across additional mandates and rails. |
| 3 | **Active desk and broker** | Hetty for Base; Jesse for Solana; Tennie for Robinhood Stock Tokens; Halley for the launch desk on Solana. | A future Arbitrum broker, or additional desks eligible for an offering. Manner and working material change; the house does not. |
| 4 | **Current instruction** | The ticket or slip under review. | The same quotation/ticket contract. |

**Attention** — what may own the first viewport:

| Order | Layer | What the client can do | Not this |
|---|---|---|---|
| 1 | **The work** | Give an instruction and compare concrete offerings at the house; draft, review, or record on the ticket inside a desk. | A hero headline, chain picker, sculpture, or character card the work must compete with. |
| 2 | **The line** | Ring the selected broker once. The broker drives the same desk draft. The desk never rings itself. | Four introductions of the broker; the broker as the principal display heading. |
| 3 | **Continuity** | Resume a draft, a watched mark, or the last paper record — when one exists. | An empty ledger or empty board as a first-class chapter. |
| 4 | **Weather** | Notice paper mode, indicative tape, the room, opt-in floor tone. | Chapters titled for atmosphere; paper mode said in four places. |
| 5 | **Myth** | Feel a house that keeps paper, a ticker, and a record. | A house explainer, a planned-desks grid, carnival as page content. |

Art direction may specify material, light, and tone. It must not specify this outline.

### Prices as working information

Resolve the exact instrument before showing an actionable price: a company ticker alone cannot identify a tokenized issuer/product, contract or mint, network, venue, rights, restrictions, or unit of ownership.

| Layer | Physical analogue | Role | Required distinction |
|---|---|---|---|
| Weather: tape | Ticker machine | Indicative reference marks where the selected desk has a marks adapter. Click loads the ticket. Not an offer. Not a hero. | Source, as-of / stale / unavailable labels. Never mix with the venue estimate. Never fabricate prices for atmosphere. |
| Continuity: working tray | Pigeonholes | Explicitly watched instruments only. | Not a pin count of drafts or filed records. An empty tray is not a section that must be filled. |
| Work: product dossier | Correspondence / file | The selected instrument: issuer, network, rights, restrictions, optional price history. | Underlying-stock reference versus the tokenized product. Not a legal ownership certificate. Label delayed, stale, closed-session, and unavailable data. |
| Work: quotation slip | Incoming telegram | A returned estimate, with source and timestamp. | Not a fill. Not executable until review. |
| Work: quote-bound ticket | Blotter / handwritten instruction | The editable draft, then the reviewed terms. | Executable/indicative/simulated status, spend or quantity, fees, slippage as applicable, validity, network, authorizing account. Call charges remain separate. |
| Continuity: ledger | Leather ledger | Durable, retrievable paper records after a successful save. | Not invented history. Not a wallet position or call receipt. |

Use structured, appropriately licensed market data for prices and a venue adapter for actionable quotes; a web-search summary or language-model answer is not an execution quote. A market's last close is not a current offer. Units must say shares, token units, or underlying-equivalent units accurately. A changed instrument, side, size, account, network, or material quote term requires a new review. Expired quotes cannot execute; refresh and present the applicable terms before renewed approval. Simulated fills need explicit pricing, fees, and fill assumptions and must never appear as real executions. Adapter contracts live in [ARCHITECTURE](ARCHITECTURE.md).

### Document grammar

A document may change state or move between places. It keeps one identity; several views of one record must not feel like several records.

| Primitive | Meaning throughout Claflin |
|---|---|
| Ticket | Work that can still be changed. |
| Quotation slip | Time-bound terms awaiting a decision. |
| Receipt | Evidence of a completed paper-recording action. It stays until the client leaves it. |
| Ledger | Durable, retrievable history. An entry appears only after save succeeds. |
| Working tray | Explicitly saved watches. Not inferred drafts. Not filed records. |
| Direct line | Another way to operate the same instruction. Switching channels must not restart the task. |

Finished means `stage === 'saved'` after a verified write. After a successful save: the receipt remains; the ledger gains that entry and marks it just filed; the acknowledgement is "Filed to your paper ledger." Opening the entry shows the same record on the ticket. Watch, share, and re-quote are not the definition of success. The archive is behind that ledger, not a second chapter.

The ticket, the voice tools, and the receiver share one **foreground document**. Implicit references ("watch this", "record this") resolve from that document's instrument, not from a parked draft underneath. Browsing a filed record is read-only. An in-flight estimate is transient; leaving the desk parks the draft, not a resumable network request. On return, review a fresh estimate. A failed save leaves the quotation visible and clearly unfiled. Unfinished drafts persist across reload only as instrument, side, and amount — never as an expired slip presented as live.

Paper records are kept in this browser. Optional sign-in copies them to the account; deleting on the desk does not remove the account copy. Do not promise another device or a signed-out session will see local-only work.

**Outcome evidence is not a shared success banner.** A paper file is `{ kind: 'paper-record', status: 'filed' }` — not a submission, a fill, or a position. Live execution, where it exists, uses its own statuses — submitted, pending, filled, failed, unknown — and its own evidence. Receipt and ledger copy stay "filed" / "paper." Do not say filled, submitted, or opened a position for a local simulation.

### The publishing house

**Publications support trade discovery, understanding, and broker trust; trading remains the product.** Build the first executable trading flow before making editorial cadence a release dependency. The first supporting format is **Hetty's Market Letter** — a concise, reviewed edition; do not promise daily publishing until the process is reliable.

A publication is an accountable artifact: AI broker byline, publication/revision time, data cutoff, scope, actual review status (generation alone does not publish — public publishing requires accountable human editorial review), sourced evidence with observation/estimate/scenario/opinion distinguished, counterarguments and what would change the view, exact referenced instruments, and a durable edition identifier with a preserved correction trail. The public edition is a shared editorial record; personalization must not silently rewrite it per reader.

A letter opens as a readable document in the same desk environment; "Discuss this thesis" carries the edition and passage into the conversation. Reading, saving a letter, or following a theme never starts a paid call, prefills an approved order, or grants execution permissions. Moving from a theme to a proposed instruction requires an explicit client action and fresh instrument/quote checks; one-click thematic/basket execution is not in initial scope.

Authority is earned through a visible record — useful reasoning, reproducible sources, honest revisions, a retrievable archive — never synthetic press quotations, invented subscribers, or a historical person's track record. Keep backtests, paper results, and verified live outcomes separate.

### Adaptive and adaptable desk

**Adaptive** means the system surfaces relevant work. **Adaptable** means the client controls that workspace. Neither means rearranging essential controls or inventing personal knowledge. Current task and client pins take precedence; then explicitly followed work and unresolved discussions; then eligible house commentary with a stated reason. Filter for access, freshness, availability, and corrections before ranking. Clients can pin, dismiss, mute, follow/unfollow, view "why shown", disable history-based personalization, and reset to the house default; deleted inputs must stop influencing suggestions. Do not infer risk tolerance, wealth, or wallet permission from browsing behavior. Layout may adapt; critical terms never disappear. A quiet desk and a decision not to act are valid outcomes.

### The complete client journey

| Stage | Client experience | Required evidence or control |
|---|---|---|
| Arrival | Give an instruction or find a supported offering in the house book. | Actual product/rail/venue coverage and paper/testnet/live mode are clear without a hero tour. |
| Connection | Establish the voice session and the account/network needed for the intended trade. | Separate microphone/call terms, account permissions, funding, and transaction authority; no silent bridging or approval. |
| Conversation / preparation | Resolve product, side, size, access, and quote. | Prices are sourced and identified as reference, indicative, or executable; a letter is not a quote. |
| Confirmation and execution | Review exact terms, explicitly authorize, submit through the approved adapter. | Bound quote/account/product/size/fees/expiry; mode-aware validation. No live execution until release gates pass ([RELEASE_VALIDATION](RELEASE_VALIDATION.md)). |
| Outcome | See order/transaction status, fill or failure, costs, verified position effect. | Distinguish submitted, venue-accepted/filled, finality, and rejected/reverted/expired/unknown. Separate the trade record from the call receipt. |
| Return | Review verified orders/positions, resume a pending intent, or place the next intended trade. | Fresh account data; no manufactured current holdings. |

A transcript is supporting evidence, not a substitute for a structured paper instruction. Payment for a conversation is never evidence that a paper trade was recorded, and neither is evidence of a real-market order. A shared `?intent=` link prefills a draft on the recipient's desk; it does not copy a record, a position, or an approval.

### The broker: presence before persona inventory

- Cast and evaluate the voice as a character in this establishment, not as a vendor preset. Provider names and IDs remain implementation details ([VOICE](VOICE.md)).
- Identify the broker as an AI character inspired by history, not the actual person or an authentic reproduction. Do not imply a professional license or affiliation that has not been established. Fact-check biographical material before publication; historical inspiration is not evidence of present competence.
- Confidence must track the evidence. Acknowledge missing or stale information, cite sources, and refuse to invent a quote or claim an unperformed action.
- The note of the day is spoken exactly as written on the desk, with its attribution, once per call — never advice, never tied to a current price, never during an active review.
- A voice-preview control must play an actual, representative sample; a descriptive toast is not a preview.
- Returning to a prior topic must be grounded in available records, not fabricated recollection.

### Art direction, exclusions, and trust

**Reference stance:** Art Deco supplies the architecture; retro-futurism supplies the instruments; Sylva supplies the standard of spatial integration; the house supplies the room; the active broker supplies the relationship. References are principle-level only — no transplanted assets, no cassette-futurist malfunction aesthetics, no compulsory entry ceremony. The receiver is a working control in the room's grammar, not the brand and not a competing hero; handset pickup is reserved for an actual voice connection. Motion establishes continuity and responds to meaningful events; the signature interaction is one document (quotation slip → filed paper record) whose changing state you understand. Three.js is justified for the bounded Room scene only: one renderer, bounded pixel ratio, render-on-demand, full cleanup; no second motion library or scroll engine. Sound is opt-in, controllable, and quiet during speech.

**Explicit exclusions:** directory-first onboarding and provider-name chips; a phone mascot as core brand; making the first broker the house identity; streak pressure or trading gamification; fake market activity as atmosphere; mandatory rotary gestures, autoplay ambience, cinematic loading delays; a landing-page outline (hero → signature object → character plate → ticket); a house-strategy grid as first-page content; repeating the broker as plate, status, call section, and open-door card; a certificate-shaped object presented as legal ownership; a fully simulated office or props that hide the trading controls.

**Trust and accessibility are part of the experience:**

- Paper trading must be visibly distinct from real-money execution throughout the journey.
- Actual market information needs provenance and freshness; distinguish historical, illustrative, stale, unavailable, and current data.
- Show the actual rate and enforced cap before a paid call; a chosen cap is a contract. Show call-payment approval separately from research and paper-instruction status.
- Use semantic, keyboard-operable controls, visible focus, readable contrast, accessible dialogs, reduced-motion behavior. Voice-first must not conceal information from clients who cannot hear or speak in the moment.
- Explain microphone use and the storage/sharing implications of notes, recordings, and transcripts. No background capture or inferred permission.
- Failure states preserve useful work, explain what did and did not happen, and offer a safe next action. Do not automatically retry calls, payments, or instructions because a data fetch can be retried.

### Product boundaries and expansion

The active expansion is a chain-neutral house over explicit mandates and offerings. Each release requires distinct coverage, verified venue/execution adapters and an account/eligibility model, plus context-preserving handoffs. This is a curated brokerage house, not a mandate for open marketplace growth.

A handoff preserves the question, selected publication edition, and permitted research context. Explain what is shared, destination coverage/account requirements, and changed call terms. Ask before transferring private context. Do not silently move transaction authority, bridge funds, switch accounts, or reuse an approval for the new desk. A planned desk remains a closed room. A quotation, offering context or approval from one desk must not appear, save, or record at another desk unless the catalog explicitly covers the combination. Returning restores parked work from the original desk; it does not transplant it.

Rail-neutral offering-led entry is the target. The client-facing house model lives in `lib/house.ts`, `lib/house-entry.ts`, and `lib/desk/*`. Optional Sign in (Privy) is an account-tier scaffold — paper backup and transcript write, not a front door. Retained Arbitrum billing/identity infrastructure is separate: do not globally replace chain constants or infer market access from a broker name. Permissionless network access (e.g. Robinhood Chain) does not establish unrestricted eligibility for its Stock Tokens; see [Eligibility & venue compliance](#eligibility).

Live execution is a core product milestone, released only after appropriate integrations, eligibility/compliance review, security verification, and transaction authorization are proven. The current gated implementations are previews of that path. Publishing letters does not authorize transactions; editorial readiness is not a prerequisite for the direct trading path.

### How we evaluate the experience

The primary outcome is **successful facilitation of the client's intended, eligible, explicitly authorized trade**, with accurate terms and a verifiable outcome. Measure the trading funnel before editorial engagement: intent resolution, eligible quote availability, time to a valid quote, review/authorization completion, submitted-to-filled/finalized outcomes, and accurate position/receipt reconciliation — separating client declines, unsupported/ineligible requests, and technical failures. Track quote expiry, price/fee surprises, duplicate-prevention, rejected/reverted/unknown transactions, recovery, and repeat successful use. Distinguish simulation, testnet, and live metrics. Higher completion must come from removing confusion and failures, not bypassing consent or inducing turnover; paid call duration and raw activity are not success proxies. During beta, verify clients can reach the direct trade path without reading a letter, understand what they are authorizing, and verify the result independently of the call receipt. A client can decline safely without being treated as a product error.

---

## Desk canon

<a id="desk-canon"></a>

**Status:** source of truth for desk product identity (name, role, market, kind). Implementation reads from [`lib/desktop.canon.ts`](../lib/desktop.canon.ts). `lib/house.ts` holds `HOUSE_DESKS` and `DESK_CAPABILITIES` for the routing layer.

### Identity order (who owns what)

```
Claflin → selected offering, mandate and rail → active desk and broker → current instruction
```

The desk is layer 3. Its identity is the broker (the relationship), not the rail (the settlement network).

### Naming rules

- **Desk = broker.** Hetty, Jesse, Tennie, Halley, Jay are brokers. They are not "the Solana desk" or "the Base desk". The market is a property of the desk, not its identity.
- **Venue ≠ desk.** When a desk settles on a specific venue family (Jupiter, Aerodrome, Lighter, Meteora DBC), the venue is a property, not the identity. **Halley is not "the Meteora desk"** — he is the launch desk whose venue on Solana is Meteora DBC.
- **Role distinguishes tape from launch.** Tape desks (Hetty, Jesse, Tennie) price, size, and file instruments that already trade. Launch desks (Halley) create the instrument. The distinction is structural: `kind: 'tape' | 'launch'` in `lib/desktop.canon.ts` drives the foyer split, the turret routing, and the board grouping.

### The desks

**Hetty Green — Base tape desk.** Market: Base · Venue: Aerodrome. Quotes and files Coinbase tokenized stocks via Aerodrome. Approach: independent judgment, capital preservation, deliberate decisions. Capability: name a buy — or ask her. Get a Base estimate. File the record. Status: paper desk open; live execution env-gated behind `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED`.

**Jesse Livermore — Solana tape desk.** Market: Solana · Venue: Jupiter. Quotes and files Backed xStocks via Jupiter. Approach: price action, timing, disciplined speculation. Capability: call a buy — or say it. Get a Jupiter estimate. Paper or settle live. Status: paper desk open; live settlement env-gated behind `NEXT_PUBLIC_JESSE_LIVE_ENABLED` + `JESSE_LIVE_ENABLED`.

**Tennie Claflin — Robinhood Chain tape desk.** Market: Robinhood Chain · Venue: Lighter. Quotes and files Robinhood Stock Tokens via Lighter, sized in USDG, with issuer, onchain, and venue marks side by side. Approach: access first — the accounts the Street refused, read tape by tape. Status: paper desk open by design. No live flag exists.

**Edmond Halley — Solana launch desk.** Market: Solana · Venue: Meteora DBC. Drafts and files paper launches for new tracker tokens. Approach: prices what has never traded — anchors a new name to a known one, then lets the tape decide. Capability: say a launch. See the curve, the anchor mark, the graduation line. File a paper launch. Status: paper desk open by design; live launch designed but unimplemented, behind dual env flags. Halley renders on his own launch plate beneath the brokers grid, with a separate launch-line block in the turret and launch verbs (`launch`, `mint`, `issue`, `tracker token`) routed to his line. A caller skimming for who to *trade* with should never confuse origination with execution.

**Jay Cooke — Arbitrum tape desk.** Market: Arbitrum · Venue: —. Planned, not yet open. Approach: building the rails that let everyone else move money. Visiting Jay is a closed room — no quote, no paper file, no transplanted approval.

Venue work and desk design details live in [DESKS](DESKS.md); voice in [VOICE](VOICE.md).

### Surface consistency — progressive disclosure (all desks)

**Ratified 2026-10-12 after the Halley verbosity review.** Halley was the outlier; Jesse/Hetty/Tennie are the reference. Every desk follows the same six rules so a caller learns the house once:

1. **One thing per screen.** Draft work is a stepped accordion driven by the desk's own step function. The folds are native and exclusive (`<details name="<desk>-slip">`) — the browser owns exclusivity, focus, and a11y; the desk only nudges. Only the current step is open; completed steps collapse to a one-line summary chip. Stage headings stay verbatim, moved inside the step `<details><summary>`. Each section has three depths: **Glance** (closed summary), **Working** (the one real choice), **Fine-tune** (raw fields and help, remembered for the session).
2. **Voice-first blank.** A blank slip shows a ghost sentence + 3 try-saying chips (`RING_EXAMPLES.<desk>`) + one quiet `Fill by hand` path — never the full form.
3. **Hints on demand.** Field help lives in `aria-describedby` targets (ids stable for tests/AT), visually behind an info disclosure revealed on focus/error — not always-visible paragraphs. Live status renders as a one-line pill (`GapStrip` pattern: `● Pyth live NVDA $xxx`), full text on tap.
4. **Gate the ceremony behind review.** The wallet/live ceremony mounts only when there is reviewed, unexpired intent to sign. Draft shows a single link (`Set up wallet first →`), not the readiness checklist.
5. **One legal stamp.** `TRACKER TOKENS ARE NOT STOCK OWNERSHIP` (footer) + `Paper only: no token is minted` (mode stamp) are the only always-visible compliance lines. All other repetitions collapse into the existing "What a launch is, and what it is not" `<details>` and the sign-time eligibility checkbox.
6. **Bounded by default.** A surface's height follows the panel, not the session. Anything that grows with use (call captions, slip sections, histories) shows a fixed working set and folds the rest; the whole call sits behind one fold owned by `LineCaptions`. Because the folds are native, the desk's `desiredSection` is a request, not a pin. **The desk proposes, you dispose:** anything with a defensible value is pencilled in — quote-aware, never over the caller's own numbers, and a declined choice is never silently restored — so a decision becomes a confirmation. Pencil reads in graphite; ink is the caller's own. The slip follows the conversation: whatever is being discussed opens itself. The test for every visible element: it is the question now due, evidence of an answered one, or furniture that asks nothing — and exactly one primary action is lit. Say each fact once.

Shared primitives (use these, don't invent new ones): `ModeStamp` ⓘ disclosure with the density toggle (`useDetailDensity`: `brief` / `full`), native exclusive `<details name="<desk>-slip">`, assumptions/product/evidence/fine-tune folds, `blankSlip` ghost + `slipCaret`, `quietEvidence`, `GapStrip` pill, hearable chips that fill the draft, pencil/ink provenance, the docked mobile call pill, and the draft→review view transition. Interaction details: hearables apply real draft values with a one-line confirmation — never a dead click; `RingExample` is tappable on every line; `LastFilingLine` welcomes returners on all four desks; review actions are sticky house-wide; status pills breathe when live and dim when quiet; every filing lands the house stamp thud. Cross-desk nudges are one quiet `.crossDesk` line at the moment of relevance — never banners.

### What this section is not

- Not a brochure — no marketing copy, no desk-slips hook.
- Not a release document — status fields mirror the routing truth; live capability lives in `lib/house.ts`.

---

## Eligibility & venue compliance

<a id="eligibility"></a>

**Status:** living policy, written 2026-10-01 after the Robinhood Chain venue spike showed that every desk's product class is a restricted tokenized security — and that restriction is enforced nowhere onchain. This section owns the house's posture; per-desk docs own mechanics. **Numbering note:** the numbered rules below are preserved unchanged from the source document; code comments citing "docs/ELIGIBILITY.md §5" refer to this rules list (the no-live-flag-without-eligibility-surface and venue-order-placement rules). Do not renumber.

### The structural fact

Every product the house covers is a security-like instrument whose legal restrictions live **entirely off-chain**. The tokens themselves are unrestricted (Robinhood stock tokens are plain ERC-20s; anyone can hold, transfer, or deposit them). So whoever provides *access* owns the restriction — there is no chain-level safety net. Each venue in the ecosystem has already made its own product-layer decision:

| Venue/provider | Product-layer decision |
|---|---|
| 0x (aggregator) | Refuses all stock tokens outright — `NOT_AUTHORIZED_FOR_TRADE` both directions, "legal restrictions." Verified live on 4663 with our own key, 2026-10-01. A well-resourced provider decided the class isn't worth it for a permissionless surface. |
| Lighter (RH domain) | Runs a curated instance — venue owns the eligibility posture for its books. Reads (books, marks) are public; order placement is a Lighter account relationship. |
| Robinhood (issuer) | KYB for mint/burn participants; its own regulated app for retail. |
| Coinbase | Onchain EAS attestations (Verified Account + Verified Country) — the only issuer that publishes a verifiable eligibility signal we can read. |
| Backed | Issuer terms only; no onchain attestation exists to read. |

**House rule:** eligibility is our product's policy surface, never the chain's. We decide who the desk serves; we never lean on "the venue allowed it" as a compliance answer, and we never describe a check as stronger than it is.

### Per-desk posture

| Desk / mandate | Instrument class | Issuer restriction | What exists today |
|---|---|---|---|
| Hetty — Coinbase Tokenized Stocks, Base | B20 tokenized stock | Coinbase terms; non-US verification | `lib/eligibility.ts` + `/api/eligibility` — onchain EAS check (Verified Account + non-US Verified Country). When `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED` arms live settle, the ticket gates on it **fail-closed**: missing, unreadable or restricted attestations all refuse execution. A Coinbase-scoped self-declaration (`claflin.eligibility.v1.coinbase-tokenized-stocks`) is also required — it affirms the terms; it never substitutes for the onchain signal. The gate is enforced again inside the execution hook, not just on the buttons. |
| Jesse — Backed xStocks, Solana | Token-2022 tracker certificate | Not offered to US persons; not available to UK retail; sanctioned jurisdictions excluded | `lib/desk/eligibility.ts` — client self-attestation, browser-stored, honestly labelled a self-declaration. No onchain signal exists. |
| Tennie — Robinhood Stock Tokens, 4663 | ERC-20 debt security (Robinhood Assets, Jersey) | US-person restrictions apply | Paper/marks only. No eligibility surface — none is needed until a live flag exists. |
| Jay Cooke — Arbitrum | Unverified | Unverified | Nothing; mandate pending. |
| Halley — Meteora DBC launches, Solana | New SPL base mint created at launch — a tracker/exposure token, *not* stock ownership; quote-side xStocks stay Token-2022 tracker certificates (Backed issuer terms) | Quote-side xStock restrictions apply to whoever a live launch would serve; the tracker token's own distribution is the issuance-adjacent surface | `lib/desk/eligibility.ts` — a Meteora-scoped self-attestation (`claflin.eligibility.v1.meteora-launch`, Jesse's model): browser-stored, explicitly labelled a self-declaration, required before the live ticket arms. The live path is built and dual-flagged off (`HALLEY_LIVE_ENABLED` + `NEXT_PUBLIC_HALLEY_LIVE_ENABLED`); the launcher's wallet is payer/creator/fee-claimer — the house is venue/infra, not issuer. Which jurisdictions a tracker-token launch may serve remains a counsel question before flags open to the public. |

### Rules that follow

1. **Paper surfaces carry no eligibility chrome.** Marks, estimates, and paper records are market-data and simulation surfaces — displaying them creates no dealing exposure. Adding gate chrome to a demo surface is worse than useless: it implies a control that isn't real.
2. **No live flag without an eligibility surface.** Before any desk accepts a live order in these instruments, that desk must gate on something honest — onchain attestation where the issuer publishes one (Base/Coinbase), explicit per-instrument self-attestation elsewhere (Jesse's model), or a venue-owned eligibility relationship (Lighter). "The venue allowed it" is not an eligibility check.
3. **Attestations stay honest.** A self-declaration is labelled a self-declaration; an onchain attestation is labelled with its issuer and revocation posture; neither is presented as a legal determination. Attestation records are scoped per issuer — `claflin.eligibility.v1.<scope>` — so confirming Coinbase's terms never satisfies Backed's or vice versa.
4. **Aggregator refusals inform, not decide.** 0x refuses the whole class because it cannot gate users; we can gate users per-desk. Their refusal is evidence about the risk class — a live Tennie flag is a business/legal commitment requiring real review, not a deploy flag. The product/access/compliance and security review for the selected products, users, venues and limits ([RELEASE_VALIDATION](RELEASE_VALIDATION.md)) is the gate; it must answer the broker-status question with counsel before any securities order routing.
5. **Venue order placement is a relationship, not a read.** Public reads (books, marks, feeds) are fine for estimates and tape. Order placement (Lighter account, Rialto integrator onboarding, direct mint/burn KYB) is a per-venue eligibility decision the user owns — the house may prepare and route, but account eligibility is never assumed from a successful quote read.
6. **Market-data dependency is noted, not hidden.** Robinhood's `rhj/` endpoints are undocumented public APIs. Fine for the demo window; a shipping product should hold a developer relationship or a documented fallback before treating them as load-bearing.

---

## Auth & access model

<a id="auth-and-access"></a>

**Status:** design direction matching the scaffold in source. The paper desk is anonymous by default — deliberately.

### Presentation is not an access tier

Room view and Compact view must be available from the first visit. No quiz, paper trade, real trade, balance, account, paid call or tenure unlocks either presentation. Presentation choice never grants/revokes capability, changes account/network, or substitutes for transaction authorization. A saved slip/watch enables truthful continuity, not a higher authority tier.

Brief contextual education or a comprehension check at a consequential action may help the user understand the specific product and terms. It never proves eligibility, suitability, identity, or spending consent. Optional invitations may orient, but must not lock entry.

### Principle 1 — Capability tiers, not a front door

Authentication is not a prerequisite for the product; it unlocks capability in tiers.

| Tier | Unlocks | Mechanism today |
|------|---------|-----------------|
| **Anonymous** (current default) | Paper desk, live estimates, tape, Hetty voice session, browser-local records and watched marks | Signed URL from `/api/hetty/session`, instance-rate-limited. Nothing to protect — the desk is a view. |
| **Account** (env-gated scaffold) | Best-effort paper backup to Redis; write-only transcript POST; optional Sign in in the header | Privy email/social. Client sends a Privy bearer token on paper and transcript routes. Not an httpOnly session cookie. |
| **Authority** (Base env-gated; others per desk) | Live transaction preparation and execution only where the desk's independent release/access gates are satisfied | Base wallet-signing code exists; the read-only eligibility check is separate and not shown on the paper desk. Presentation preference never grants authority. |

The paper desk stays anonymous permanently. Requiring login before someone can read a tape, get an estimate, or ring Hetty is onboarding theater — exactly what this product removed. Sign-in, a linked wallet, or a passing eligibility check is not live access.

### Principle 2 — Voice is a channel, not an auth boundary

Channels produce instructions; the desk owns authorization. Voice, tap, typed text and a future API all emit the same `TradeIntent` object into `useTradingDesk` — nothing about the input modality changes what happens downstream. Where channels differ is *ceremony*, not authority:

- Voice can draft, quote, pin a mark and record paper.
- Anything requiring cryptographic or eligibility authority requires an authenticated channel — the broker says "I can't sign for you — confirm on the ticket," which is honest product, not a limitation.

**Not yet wired:** when accounts exist, identity was intended to bind at `/api/hetty/session` so transcripts and records attach regardless of spoken vs clicked input. Today the call rings with a bare `POST` and no bearer token; a signed-in caller is still minted anonymously and counted against the instance budget. Transcript flush and paper sync *do* send the token when the client has one.

### Principle 3 — Authority is separate from presentation and voice

Do not rely on presentation or presumed absence of code as a security boundary. Grant authority only through explicit, verified action boundaries:

1. **Voice is presentation, never authentication.** A voiceprint is not identity; everything the desk hears is untrusted input, including ambient audio and prompt-injection attempts. Mitigations: the tool surface is narrow by construction, `record_paper` requires explicit spoken confirmation, and no secrets or escalation hints live in the system prompt.
2. **Session-bound calls (intended).** With accounts: the session route should require auth when a token is presented, apply per-user limits, and bind conversation IDs to the account. The route already *accepts* a valid bearer token and applies a per-user limit when one arrives; the desk does not send it.
3. **Strict tool parameters.** `set_amount` accepts only a decimal string; `choose_instrument` and `watch_mark` resolve only canonical aliases; nothing free-form reaches a contract or a URL.
4. **Implemented Base execution.** The ticket requires a connected, authenticated wallet and explicit approval/execution actions, signed through Privy's client wallet integration. The read-only Coinbase eligibility endpoint is separate: the current execution hook does not call it. Verified eligibility enforcement and bounded delegation remain staged policy work, not guarantees of the existing flow.
5. **Transport hardening.** CSP (`connect-src` limited to self + ElevenLabs + Privy), `frame-ancestors 'none'`, `Permissions-Policy: microphone=(self)`, and the pre-commit secret scanner stay on. Session cookies (`SameSite=Lax` + `Secure` + `httpOnly`) are specified for later privileged routes; they are not what the scaffold uses.

### Identity mechanism — decided for the scaffold

**Privy** is what is in the tree (env-gated). Dynamic and a lean Auth.js + wallet-link stack were considered and are not implemented. The audience is people outside the US who want US-equity exposure without wallet fluency — forcing a signature first inverts the funnel. Privy can issue embedded wallets for users who arrive without one, which matters for the eligibility + execution path; wallet linking is supported when a user brings their own. Revisit if custody requirements or pricing change.

When `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID` are set, `DeskAuthProvider` mounts Privy. Otherwise the desk is unchanged and the SDK never enters the bundle.

| Claim | Reality |
|---|---|
| Sign in appears in the header | Yes, only when configured. Does not gate the desk. |
| Paper records sync to the account | `POST/GET /api/paper` with a bearer token. Pull *adds* missing local keys; it never deletes. Local is authoritative for this browser. |
| Transcripts save to the account | `POST /api/hetty/transcript` (30-day TTL, schema-validated) when a token is present. No GET. No desk UI. Anonymous calls store nothing. |
| Session binds to the account | Route can verify a token. The ring button does not send one. |
| Desk state / watchlist across devices | No. Watched marks are `localStorage` only (`claflin.watched.v1`). |
| Eligibility / live access | `/api/eligibility` implements the read-only Coinbase Verifications check. Not mounted on the paper desk. |

Remaining if this tier is kept as a real account: provision the Privy app per environment; bind the session mint; honor deletes; give transcripts a read surface; decide cookie vs bearer for privileged routes.

### Authority tier — decided, staged, not shown

The staged Base authority model concerns explicit verified permissions, not earned visual access. Per-action review and consent remain the default; saved work, test completion and presentation preference never advance an authority tier.

- **L1 — verified + own-custody + per-trade signature (default).** Eligibility checked onchain via **Coinbase Verifications** (issuer-aligned EAS attestations): a live "Verified Account" attestation AND a "Verified Country" attestation outside US/territories (Reg-S posture). Every trade is a fresh signature on the user's own wallet. `lib/eligibility.ts` implements the read-only check.
- **L2 — bounded delegation (opt-in, later).** Only after L1 verification: the user signs a scoped delegation policy (instruments, size caps, expiry, revocable) once, then trades flow within bounds. L2 never relaxes eligibility — it requires it plus a stricter bar.
- **Custody.** Own-wallet default; a Privy embedded wallet remains user-controlled (exportable keys).
- **Fallback.** Self Protocol (passport-ZK) for non-Coinbase users; it asserts passport facts, not residence — sufficient signal, weaker than issuer attestation.

Voice may narrate and draft at any tier; the signature ceremony happens on-screen. Do not preview L1 as "live access" on a paper-only release.

### What is explicitly out

- No voiceprint or biometric authentication.
- No auth required for paper trading, the tape, or ringing a broker.
- No eligibility, wallet-link, or "live access" banner on the paper desk.
- No client-visible transcript history until a read path exists.
- No credential or session material in ElevenLabs dynamic variables or the system prompt.
- The dormant webhook pipeline stays dormant.

---

## Desk slips — provenance, not parcels

<a id="desk-slips"></a>

**Status:** Stage 1 is **implemented (2026)** — browser-local desk slips ship in `lib/trading/desk-slips.ts`, wired into the paper and live surfaces (`components/desk/PaperLedger.tsx`, `HettyDeskSurface.tsx`, `JesseTicket.tsx`, `JesseLedger.tsx`, `lib/trading/useDeskDocuments.ts`, `useLiveJournal.ts`, `useDeskExecution.ts`). Stages 2–4 (onchain slip, audible dedication enrichment, limited participation seats) are future work; the onchain mint is a follow-on once live fills are routine.

### Problem this solves

Reliability earns respect. It does not create *want*. Callers who like the desk still lack a reason to feel they **own a place in the house's history**. The hook must be desire to belong to a lineage — without lying about what is owned.

### Hard boundary (non-negotiable)

| Is | Is not |
|---|---|
| A commemorative **desk slip** — blotter / certificate *frame* for how you arrived | A second token that pretends to be the share |
| Provenance of an instruction or Base fill | Fractional ownership of NVIDIA/Apple (B20 already is that) |
| Optional audible dedication from the voice line | An "audio share" or yield collectible |
| Historically: people kept certificates and blotter pages | Bucket-shop wager dressed as ownership |

**Never mint "audible NFT parcels of tokenised stocks."** Coinbase tokenized stocks on Base are already the fractional claim. A parallel collectible that sounds like equity recreates parlor energy and fights the certificate-vs-bucket-shop education.

### Historical authenticity

Wall Street's romance was the **certificate, the seat, the blotter line, the tape heard in the room** — not the order form alone. Claflin's language already sits there. Use that vocabulary for **provenance**, not for synthetic equity:

- **Slip** — filed instruction evidence (paper) or Base fill evidence (live).
- **Dedication** — optional short spoken line from that session (caller or broker).
- **Seat / participation** (later, limited) — house admission metaphors, not trading-game badges.

### Delivery stages

> Naming note: this sequence uses **Stages 1–4**. The lettered **Phases A–C** in [LIVE_DESK_AVATAR_PLAN](LIVE_DESK_AVATAR_PLAN.md) are the separate Stocks Maxxing broadcast sprint and are unrelated to desk slips.

**Stage 1 — Local desk slips (implemented, 2026).** Browser-local keepsakes, same honesty model as paper records:

1. **First paper instruction** on a desk → mint one `first-paper` slip (idempotent).
2. **First confirmed live Base fill** → mint one `first-live` slip (idempotent), binding reviewed terms + tx hash.
3. Optional **dedication**: last spoken caption (caller or broker) clipped to a short line; never invent speech.
4. Surface under **Your record** — labelled keepsake, explicitly *not a position, not the tokenized stock*.
5. Exportable metadata shape ready for a later onchain token URI.

The `DeskSlip` data shape (versioned, zod-validated, storage prefix `claflin.slip.v1.`) lives in [`lib/trading/desk-slips.ts`](../lib/trading/desk-slips.ts) — the code is the source of truth; do not restate the type here.

**Stage 2 — Onchain slip (future).** Mint a commemorative NFT or soulbound attestation on **Base** whose metadata points at the slip: instrument, paper|live, timestamp, Base tx if live, dedication text, house copy. Wallet-signed mint; Claflin never implies the NFT is the equity. Prefer soulbound for "first instruction / first fill"; transferable optional for later limited editions.

**Stage 3 — Audible dedication (future, optional enrichment).** Attach a short audio clip only when the caller opts in and a real session fragment exists. The clip is dedication on the slip, not a tradeable "audio share." Longer term: reduce ElevenLabs lock-in for house voice; slips stay vendor-agnostic metadata.

**Stage 4 — Limited participation seats (future).** Small series tied to house history (e.g. first live cohort, education completion) — named after seats and admission. Scarcity + story; no marketplace rankings, streaks, or loot mechanics.

### Product copy rules

- Always say **desk slip** or **keepsake**, never "parcel," "share NFT," or "owns NVIDIA."
- Lead with: *speak and you can hold a slice of Apple/NVIDIA on Base* (B20). The slip is how you got there.
- Education topics (`the-certificate`, `the-bucket-shop`) remain the truth layer if anyone confuses the slip with ownership.

### Exit evidence

- A caller who files their first paper trade sees a slip and can explain it is **not** the stock.
- A caller who completes a first live fill sees a live slip bound to the Base hash.
- No UI path mints equity-sounding collectibles or a slip marketplace.

---

## House artefacts

<a id="house-artefacts"></a>

**Status:** implemented. All six artefacts (A1–A6) are built and covered by the foyer test suite. They extend the world rule — "historic manners and materials coexist with contemporary information" — from the desk rooms onto the foyer's page furniture.

**The register rule (policy, not decoration):**

- Furniture speaks the house's tongue; the honesty layer stays plain English. Disclosures, eligibility, AI labels, and risk text are never archaized — they must be unmistakable, not charming.
- Every artefact carries real data or is plainly ornamental. Nothing that looks like information may be invented: no fake quotations, no fake issue dates, no fake telegrams. Texture is allowed to be texture.
- Ornaments are decorative and non-semantic, `pointer-events:none`, and below the lamp pool; rendered elements carry `aria-hidden`. Anything duplicating wire data is decorative duplication — the accessible source already exists in the wire section.
- Restraint is the product. The black is the room's quiet. Furniture, not noise; if a field still breathes, leave it.

The artefacts are responsive furniture: the ghost ground and quotation column exist only at ≥1100px; the house sheet drops to a slim strip beneath the criteria on mobile; the stamp hides below 760px; the posted notice and colophon stay in flow at every width.

**A1 · Ghost ledger ground** — `public/media/ledger-ground.svg` (~1.6 KB), an abstract ornamental texture of ruled ledger lines and ink flourishes; no readable figures. A per-section `::before` behind the dark rooms at ≥1100px only, opacity 0.06, negative z-index, `pointer-events:none`, static.

**A2 · The quotation column** — `components/foyer/QuoteColumn.tsx`, a slim ruled table of the same marks the wire carries (symbol, mono price, rail tag). Sticky aside in the house-answers section's right field at ≥1100px. Source: the same `wireMarksOf` list evaluated once in `HouseFoyer` and shared with `LiveWire` — zero new fetches; up to seven real priced rows, stale rows keeping the wire's `STALE` label. Honesty: per-row UTC stamps from `reference.updatedAt`, falling back to `Snapshot` (a fetch snapshot, never called an observation), else `Time unavailable` — no fabricated freshness; `aria-hidden`; if no valid priced marks exist, it prints nothing.

**A3 · The house sheet** — `components/foyer/HouseSheet.tsx`, the day's desk note set as a printed periodical excerpt: `THE HOUSE SHEET` masthead, real UTC date, the note verbatim, a byline. Placed in the example call's pending/rejected empty state; the `accepted` state omits it (the slip owns the field). Source: `deskNoteOfTheDay`, rotating the printing desk via `houseSheetDesk`; SSR paints the masthead alone and the sheet fills in on mount, re-rolling at UTC midnight. Attribution prints verbatim when the note carries a speaker's words, otherwise names the desk and says *a desk note, not a quotation*. No issue number is ever printed. The foot's lineage line is a lineage note, never a claim to be the historical paper.

**A4 · Marginalia on the example call** — the criteria list reads as a clerk's working sheet (manicule `☞` markers); the empty state carries the red-ink `Awaiting the wire` stamp. `aria-hidden`, hidden below 760px, no handwriting font. It says *waiting*, which is true.

**A5 · The colophon** — the footer's fleuron divider, running line ("THE TAPE RUNS ALL NIGHT. EVERY SLIP ON THE RECORD."), set-in line, the planned-desk line generated from the planned-desks list, nav, and the risk paragraph — wording unchanged, contrast brightened after visual QA.

**A6 · The posted notice** — a pinned `POSTED` plate in the METHOD section's right field carrying the house's actual rules in plain type: *Only you can sign. Voice never moves funds. Paper by default. Estimates expire. Records are paper.* The plate takes its period-ness from the letterpress frame, the pin head, and the kicker — never from fabricated notices.

Tests: `tests/house-foyer.test.ts`, `tests/example-call.test.ts`, `tests/desk-notes.test.ts`. Deferred ideas (listed so they stay available, not promised): telegram-form receipts for filed records, a pneumatic-tube send-off animation, a chalk board of the day's marks inside METHOD. Halley's reel has landed (`DESK_FILMS.halley` + `FilmOverlay`).
