# Claflin Product Direction

**Status:** Canonical product cutover approved, 2026-09-05; seated working desk first pass, 2026-09-09; desk isolation and outcome evidence, 2026-09-09; rail-neutral offering-led house entry implemented. The old onboarding/directory approach is retired. `/` is Claflin's front door: a fresh visit opens the foyer and house book; an instruction resolves to concrete offerings; only eligible desks can open the selected offering. Hetty covers Coinbase Tokenized Stocks on Base; Jesse covers Backed xStocks on Solana. Live settlement exists only where the selected desk supports it and remains env-gated. Visiting a planned desk is a closed room, not a second trading surface. An optional Sign in control may appear when Privy is configured — it does not gate the desk and is not live access. Browser and responsive QA of the seated pass were skipped; the visual result is unverified.

**Governing decision:** there are no existing users or collaborators requiring preservation of the old experience. Be intentional about replacement: preserve useful technical capabilities selectively, not legacy flows, identities or product assumptions. Git history is the reference for the retired approach.

**This document owns jobs, principles, and information hierarchy. It does not own page anatomy.** Do not implement a section because it is named here. In the house, the instruction and concrete offerings come first; inside a desk, the ticket or the line is first; everything else is the room.

**Governing idea:** you are not looking at a trading application with antique styling. You are giving an instruction to a house that keeps a record.

## Desk views (Room / Compact)

**Approved 2026-09-17; nomenclature locked 2026-09-20.** The room does not unlock; it becomes yours through the work you choose to keep. This decision supersedes older language that treats every spatial object as decorative weather or limits Jesse to a new nameplate and comparison card. It does not weaken trading safeguards.

Today `/` opens a Claflin foyer on a fresh visit (no saved desk preference). The visitor gives an instruction or chooses from the house book; each offering carries product, issuer, mandate, rail, venue and quote terms. Only open desks with actual coverage are eligible. Deep links remain supported: `/?desk=jesse` for Stocklana and `/?desk=hetty` for Base; `?offering=<id>` may carry a catalog offering only when it covers the selected desk. Last open desk is remembered. **Offering selection** chooses the concrete product/rail/venue; **desk selection** chooses the broker relationship; **Room / Compact** (`?view=`) are layouts of the same controller. Canonical Room view is `/?desk=jesse&view=room` (`/night-desk` redirects there; legacy `night|direct` accepted). Fixture study remains at `/night-desk?study=1` and `/desk-study` in development. [Jesse desk](JESSE_DESK.md) describes the Solana product; [Stocklana Build Plan](STOCKLANA_BUILD_PLAN.md) owns remaining integration gates and the September 25 deadline; [Stocklana submission pack](STOCKLANA_SUBMISSION.md) owns the demo script and disclosure.

The integrated target has two views of the same broker and work: **Room** (spatial/conversational) and **Compact** (blotter/low-graphics/keyboard-friendly). Neither is beginner/expert, premium/earned, dark/light theme, or an authorization tier. Make both available from the first visit. Switching view preserves the active desk, selected offering, chain, account, instruction, quote identity/expiry, saved work and existing authorization boundaries. Changing offering, desk or network is separate.

Progression means continuity and contextual depth:

- First visit: a clear question or instruction path, not empty history panels or a compulsory tour.
- First explicit paper save: a retrievable paper record, not a fill, rank, ownership certificate or room unlock.
- Return: offer to revisit actual retained work; no invented familiarity, assumed holdings, or automatic transcript retention.
- Explicit watch: give that instrument a place in the tray; respect unwatch/delete and the actual browser/account storage scope.
- A request for more detail: reveal relevant evidence and explanation. Material terms remain available at the action regardless of experience.
- A consequential live action: explain the actual product, units, reference-versus-quote distinction, fees and authority; separately enforce access policy and explicit wallet authorization.

No entrance exam, XP, streak, balance threshold, minimum trades, paid-call consumption, or financial success metric unlocks the experience. A contextual comprehension check may support a risky action where appropriate; passing it never proves eligibility or grants spending authority. A standalone quiz/grading system is not in the Stocklana sprint. An optional invitation after a first saved paper instruction is allowed only if Room view access was already available.

Declining to trade is a valid outcome. Explicit watches provide non-trading continuity; saving a research/comparison artifact can be added later without making it a prerequisite for trading. Never increase turnover to make the room feel more personal. No account or microphone is required to enter either presentation.

The room participates in shared attention: comparison brings the duplex instrument and its evidence forward; a correction visibly supersedes the old quotation; successful filing gives the record a stable place in the ledger. Scene focus never authorizes an action. Keep readable HTML, clear labels and keyboard/manual equivalents; no free roaming, hidden controls or mandatory camera travel.

## The central idea

**Claflin is a voice-first trading product expressed as a Deco-futurist brokerage house. Specialist AI brokers help clients turn trading intent into clearly understood, explicitly authorized, verifiable execution.**

This is a brokerage from a future imagined through Art Deco: architectural, tactile, technologically sophisticated, and personal. Historic manners and materials coexist with contemporary information and explicit modern safeguards. The world should make trading more understandable and direct, not add a ceremonial layer in front of it. Use a coherent period-inspired world; do not claim a strict reconstruction across eras.

Claflin is the institution. The durable identity order is **Claflin → selected offering, mandate and rail → active desk and broker → current instruction.** Hetty Green covers Coinbase Tokenized Stocks on Base; Jesse Livermore covers Backed xStocks on Solana; Isabel Benham on Robinhood Chain and Jay Cooke on Arbitrum remain planned. Each desk combines a recognizable approach with actual market access. Changing desks later should change the nameplate, working material, and manner — not replace the house or silently move the instruction to another rail.

The primary loop is **express intent → resolve the concrete offering and access → choose an eligible desk → obtain a quote → review and authorize → execute → verify the outcome and position**. A client who knows what they want can go directly to that path. Reading a letter or discussing a thesis is an optional entry/support path, never a required first step.

The publishing-house idea remains valuable as decision support and broker identity, not a coequal content business or a prerequisite for launching trading. A client can decline a trade or stop after research; respecting that choice does not change the product's execution-first purpose.

This is not an AI-service marketplace with a retro skin. It is not a historical reconstruction, a claim to be a regulated brokerage, or an invitation to pretend contemporary securities existed in an earlier period. The brokerage is the experience metaphor; AI identity, capabilities, data provenance, and payment boundaries remain explicit.

**The user is the client, not the switchboard operator.** The switchboard is supporting context, not the user's job.

## Audience and job

The initial audience is clients who want a simpler way to discover, understand, and execute supported trades, including expressing an order aloud. The current product spans Coinbase Tokenized Stocks on Base and Backed xStocks on Solana; eligibility and access remain mandate-specific rather than inferred from the underlying equity or chain. Clients should not need to understand voice vendors or agent registries, but must be able to identify the product, issuer, rail/venue, account, costs, and authorization they are using. Validate audience assumptions in beta rather than assuming a broader market is already proven.

The core job is: **help me make the trade I intend, on the right offering, desk, venue and account, under terms I understand and approve, and show me what actually happened.** Research helps clarify intent; it is not a substitute for an execution-capable product.

Paper simulation and testnet transactions are development/validation stages, not the long-term end product. Base has an env-gated execution implementation; Jesse live settle exists behind dual env flags (`NEXT_PUBLIC_JESSE_LIVE_ENABLED` + `JESSE_LIVE_ENABLED`) and remains separately accepted from paper. Code presence or a paper/testnet result does not establish release acceptance. A user's decision not to proceed must always be respected.

Return visits should make it easy to review actual orders/positions, resume a pending decision, or place another intended trade without restarting a discovery or content-consumption sequence.

## Decisions that govern the product

1. **Claflin is the institution; the offering and broker are explicit choices.** Personality explains how a broker thinks; a real mandate and concrete offering explain what they can do. The house leads with instruction and product terms, not a chain preference; desks are eligible only for offerings they cover. Do not make the first broker or first rail the brand. A modest brass nameplate beside the line is enough. Expand specialist coverage by verified offerings, not by adding interchangeable AI inventory.
2. **Behavior establishes the world.** A receiver connecting, a quotation slip arriving, or an instruction becoming a filed paper record carries meaning. Glows, arbitrary number animations, fake quotations, and mechanical gestures that only advance tutorials do not substitute for it.
3. **Trade facilitation is primary.** Instrument access, quote quality, order review, execution, and outcome tracking take priority over editorial content and call telemetry. Keep call controls/terms available, but do not make publications or prolonged conversation a prerequisite for a trade.
4. **Clarity wins over theater.** No artificial connection waits, obscure controls, surprise microphone activation, fictional market data presented as real, or aesthetic treatment that conceals a financial boundary. A certificate-inspired dossier must not pretend to be a legal ownership certificate. **Desk slips** (commemorative provenance of an instruction or Base fill) may create belonging; they must never be framed as the tokenized stock, a parcel of equity, or a second ownership claim — see [Desk slips](DESK_SLIPS.md).
5. **Continuity, not consumption.** Help clients resume notes and unresolved questions. Do not reward paid minutes, daily calling streaks, or trading frequency. Limited historical “seat / participation” keepsakes are provenance, not gamification.
6. **Progressive disclosure, not hidden terms.** Keep provider/protocol detail secondary; expose AI identity, the active paper/live mode, trial terms, paid rate, actual cap, and required approval before the relevant action.
7. **Immersion is optional; usability is not.** The complete journey must work without ambient audio, spatial motion, a pointer gesture, or a desktop-sized viewport. Most objects establish the room; the client must never play "find the trading controls."
8. **A house and desk, not a page.** At the house, the instruction and concrete offerings are the first useful action; inside a desk, the ticket or the line takes over. In Room view, relevant instruments and papers may become the semantic work through shared focus, not merely background scenery. Do not require a hero tour or create a marketing homepage before the task. Do not introduce the broker four times. Navigation describes the client's work; scene movement must not compete with review.
9. **Paper is the house language.** The blotter is the draft; a returned estimate is a quotation slip; saved work is a ledger; watched marks are pigeonholes; the ticker is labelled reference, never a fabricated screen. One document whose state you understand — not separate decorative animations. A commemorative desk slip is furniture beside the ledger — a kept blotter line — not a trading surface.
10. **Every word the desk speaks must be true of what it observed.** Confirmations restate only what the current input contributed; carried-over state is dropped or labelled as carried-over. A voice-attributed line originates from that voice. Certainty is computed from evidence or omitted — never a reassuring constant. Missing values stay missing until the client supplies them. See [Honest speech](AGENTIC_ARCHITECTURE.md#honest-speech-restating-only-what-was-observed).

## Information hierarchy

`/` is the house front door. It is not a landing page with a form attached, and it is not a chain picker. Identity and attention are different layers. When a proposal adds a surface, say which it belongs to.

**Identity** — durable, so later desks can change the nameplate without replacing the house:

| Order | Layer | Now | Later |
|---|---|---|---|
| 1 | **Claflin** | The house. Wordmark, blotter, document conventions, the record. | Unchanged. |
| 2 | **Selected offering and mandate** | The concrete product, issuer, rail, venue and quote terms chosen in the house book. | More verified offerings across additional mandates and rails. |
| 3 | **Active desk and broker** | Hetty for Coinbase Tokenized Stocks on Base; Jesse for Backed xStocks on Solana. | Benham, a future Arbitrum broker, or additional desks eligible for an offering. Manner and working material change; the house does not. |
| 4 | **Current instruction** | The ticket or slip under review. | The same quotation/ticket contract. |

**Attention** — what may own the first viewport:

| Order | Layer | What the client can do | Not this |
|---|---|---|---|
| 1 | **The work** | Give an instruction and compare concrete offerings at the house; draft, review, or record on the ticket inside a desk. A slip under review comes forward and quiets the rest. | A hero headline, chain picker, sculpture, or character card that the work must compete with. |
| 2 | **The line** | Ring the selected broker once. The broker drives the same desk draft. The desk never rings itself. | Plate + status + call section + open-door card as four introductions. The broker as the principal display heading. |
| 3 | **Continuity** | Resume a draft, a watched mark, or the last paper record — when one exists. | An empty ledger or empty board as a first-class chapter. |
| 4 | **Weather** | Notice paper mode, indicative tape, the room, opt-in floor tone. | Chapters titled for atmosphere. Paper mode said in four places. |
| 5 | **Myth** | Feel a house that keeps paper, a ticker, and a record. Objects cropped, overlapping, used; one attributed note of the day. | A house explainer, a planned-desks grid, carnival as page content, or a fully simulated office the client must hunt through. |

Art direction may still specify material, light, and tone. It must not specify this outline. Implementation that follows a composition recipe over this table is wrong even if it matches an older paragraph in this file.

The seated first pass (`WorkingDesk.tsx`) consolidated the ticket and the line onto one writing surface and rebuilt the physical context around it: blotter, cropped ledger and correspondence, partitions, ticker, receiver to one side. The receiver paints a still from the model immediately and swaps after the matching WebGL frame. Claflin is the display identity; Hetty is a nameplate beside the line. A first-run lead (`The desk hears you.`) may state the work promise only while the ticket is untouched — with hearable example lines the caller can tap so the desk hears them — then retires on the first instrument; it is not a returning hero and never competes with the ticket. The footer carries one quiet return to the ticket (`Back to your ticket`, smooth scroll with reduced-motion respect) so the colophon is not a dead end. Line copy stays promise-explicit: Hetty fills the ticket and reads it back, the mic stays off until the caller talks, nothing is filed without review, and header Sign in reads as the optional record-keeping promise. Remaining craft is completion and recovery — returning, missing records, voice referring to the visible document, and a bounded ledger — not more rooms. [ROADMAP.md](../ROADMAP.md) §1 owns sequencing.

## The specialist brokerage house

| Desk | Character and editorial lens | Intended initial access | Status |
|---|---|---|---|
| Hetty Green | Capital preservation, independent judgment, downside and concentration before conviction. | **Coinbase Tokenized Stocks on Base**: B20 tokens issued by Coinbase, 1:1 claims on shares in regulated custody, eligible non-US users only. Catalog and contract addresses documented in the [integration baseline](AGENTIC_ARCHITECTURE.md#coinbase-tokenized-stocks-on-base-integration-baseline). | Established Base desk and mandate coverage; paper estimate/review/local-record flow and env-gated execution code exist. Same Room/Compact view axis as Jesse (`?view=`). Live release acceptance remains separate from code presence. Eligibility gating is Claflin's responsibility—secondary trading is permissionless onchain. |
| Jesse Livermore | Price action, timing, market structure, disciplined speculation. | **Backed xStocks on Solana**, quoted through Jupiter. | Open Solana desk and mandate coverage (Jupiter quotes, v2 local records, ConvAI line, Room/Compact views). Free venue duplex (Backed/Jupiter stock reference vs Jupiter venue USD) plus PreStocks secondary duplex. Pyth comparison stays honest-unavailable without Pro entitlement. Live Jupiter settle implemented behind dual env flags. See [Jesse desk](JESSE_DESK.md). |
| Isabel Benham | Fundamental and sector analysis supporting trade decisions. | Robinhood Chain mandate, not Robinhood's brokerage-account API. | Planned desk coverage. Official docs describe a live EVM L2 and Stock Token integrations; Claflin's specific products, venue, eligibility, and adapter remain to be verified. |
| Jay Cooke | Distribution and access: the financier who built the machinery that put Civil War government bonds into ordinary hands — rails before trades. | Arbitrum mandate; likely the deepest existing Claflin infrastructure overlap. | Planned desk coverage, fourth in the current sequence. The desk's products, venue, eligibility, execution adapter and access model remain to be defined when commissioned. Do not accelerate it because call billing already uses Arbitrum; billing infrastructure is not an execution mandate. |

Use clear introductions such as "Hetty — your Base broker" only when the selected offering's access is actually supported; otherwise mark it planned or omit the desk. History is optional context, not a prerequisite for using a desk. Characters are AI, inspired by historical figures, not the actual people or inheritors of their credentials, affiliations, or trading records. Fact-check biographical material before publication; historical inspiration is not evidence of present competence.

The chain does not determine the strategy. Base is not inherently conservative, nor Solana inherently speculative. Each desk needs supported offerings, a mandate, venue/access policy, permissions, risk boundaries, and evidence of operational readiness. Personality cannot override shared safeguards. Primary-network assignments are mandates and coverage, not hardcoded identity: broker identity, execution network, client account, call-payment network, and identity-registry network remain distinct.

Keep one house identity, quotation/ticket conventions, and consent model. Vary voice, editorial perspective, specialist working material, and restrained desk accents rather than create separate themed applications. This table is house strategy, not first-page information architecture. Do not render it as a product grid on `/`. A restrained house-directory detail may acknowledge planned desks; a four-desk explainer must not return. Sequence and gates live in [ROADMAP.md](../ROADMAP.md). "Other desks" becomes a small curated directory only as those desks become ready.

A handoff preserves the question, selected publication edition, and permitted research context. Explain what is shared, destination coverage/account requirements, and changed call terms. Ask before transferring private context. Do not silently move transaction authority, bridge funds, switch accounts, or reuse an approval for the new desk. A planned desk remains a closed room. A quotation, offering context or approval from one desk must not appear, save, or record at another desk unless the catalog explicitly covers the combination. Returning restores parked work from the original desk. It does not transplant it.

## Prices as working information

Prices belong to the client's work, not to decorative atmosphere. Resolve the exact instrument before showing an actionable price: a company ticker alone cannot identify a tokenized issuer/product, contract or mint, network, venue, rights, restrictions, or unit of ownership.

| Layer | Physical analogue | Role | Required distinction |
|---|---|---|---|
| Weather: tape | Ticker machine | Indicative reference marks for supported instruments where the selected desk has a marks adapter. Click loads the ticket. Not an offer. Not a hero. | Source, as-of / stale / unavailable labels. Never mix with the venue estimate. Never fabricate prices for atmosphere. |
| Continuity: working tray | Pigeonholes | Explicitly watched instruments only. | Not a pin count of drafts or filed records. An empty tray is not a section that must be filled. |
| Work: product dossier | Correspondence / file | Focus on the selected instrument: issuer, network, rights, restrictions, optional price history and research. | Underlying-stock reference versus the tokenized product. A dossier is not a legal ownership certificate. Label delayed, stale, closed-session, and unavailable data. |
| Work: quotation slip | Incoming telegram | A returned estimate, with source and timestamp. Arrives beside the instruction. | Not a fill. Not executable until review. |
| Work: quote-bound ticket | Blotter / handwritten instruction | The editable draft, then the reviewed terms. First semantic thing when a review is active. | Executable/indicative/simulated status, spend or quantity, fees, slippage/price impact as applicable, validity, network, and authorizing account. Call charges remain separate. |
| Continuity: ledger | Leather ledger | Durable, retrievable paper records after a successful save. Lives in the working composition. Opening an entry shows that same record on the ticket. | Not invented history. Not a wallet position or call receipt. Not a third copy of the receipt. |

Use structured, appropriately licensed market data for prices and a venue adapter for actionable quotes; a web-search summary or language-model answer is not an execution quote. A market's last close is not a current offer, and an underlying stock price does not prove the cost or rights of a tokenized representation. Units must say shares, token units, or underlying-equivalent units accurately.

A changed instrument, side, size, account, network, or material quote term requires a new review. Expired quotes cannot execute; refresh and present the applicable terms before renewed approval. Simulated fills need explicit pricing, fees, and fill assumptions and must never appear as real executions. Detailed adapter contracts live in [Architecture](AGENTIC_ARCHITECTURE.md#target-domain-contracts).

## Document grammar

A document may change state or move between these places. It keeps one identity. Several views of one record must not feel like several records.

| Primitive | Meaning throughout Claflin |
|---|---|
| Ticket | Work that can still be changed. |
| Quotation slip | Time-bound terms awaiting a decision. |
| Receipt | Evidence of a completed paper-recording action. It stays until the client leaves it. |
| Ledger | Durable, retrievable history. An entry appears only after save succeeds. |
| Working tray | Explicitly saved watches. Not inferred drafts. Not filed records. |
| Direct line | Another way to operate the same instruction. Switching channels must not restart the task. |

Finished means `stage === 'saved'` after a verified write. A ticket that still shows the same instrument and amount is not “in progress.” Do not count a retained draft or latest record as pinned.

After a successful save: the receipt remains; the ledger beside it gains that entry and marks it just filed; the acknowledgement is “Filed to your paper ledger.” Opening the entry shows the same record on the ticket, with a way back to the instruction. Starting another instruction stays available from a receipt and is not offered while browsing a different record. Watch, share, and re-quote are not the definition of success. The archive is behind that ledger, not a second chapter.

The ticket, the voice tools, and the receiver share one **foreground document**. Implicit references (“watch this”, “record this”) resolve from that document’s instrument, not from a parked draft underneath. Browsing a filed record is read-only. A quotation still sitting in background state cannot be filed, described, or recorded as if it were on the ticket. If the opened record has disappeared, show an unavailable recovery with a way back to the instruction — not a success heading. Returning to an actionable instruction is explicit.

An in-flight estimate is transient. Leaving the desk parks the draft and its inputs, not a resumable network request. On return, review a fresh estimate.

The compact ledger is a bounded recent preview. Complete dated history lives in the archive. After filing, the new line is marked just filed; on a short viewport it sits above the receipt so the result is in the first view.

A failed save leaves the quotation visible and clearly unfiled. Cancel is a decision not to file, not an abandoned conversion. Unfinished drafts persist across reload only as instrument, side, and amount — never as an expired slip presented as live. Ledger lines use Today / Yesterday / date, then the time. Quote time stays secondary.

Paper records are kept in this browser. Optional sign-in copies them to the account; deleting on the desk does not remove the account copy. Do not promise another device or a signed-out session will see local-only work.

**Outcome evidence is not a shared success banner.** A paper file is `{ kind: 'paper-record', status: 'filed' }`. It is not a submission, a fill, or a position. Live execution, when it exists, uses its own statuses — submitted, pending, filled, failed, unknown — and its own evidence. Receipt and ledger copy stay “filed” / “paper.” Do not say filled, submitted, or opened a position for a local simulation. Types for live outcomes may exist before any signing or submission does.

**Paper journey to validate:** review → save succeeds → record appears nearby → client leaves → client returns → retrieves that record. Then the failure branch. For each frame: what are they trying to establish, what owns attention, what changed, where does the work live, and can they stop here?

## The publishing house

**Publications support trade discovery, understanding, and broker trust; trading remains the product.** A publication gives the client a thesis to discuss or an idea to investigate, but must not displace the direct instrument/quote/order path. Build the first executable trading flow before making editorial cadence or a publication platform a release dependency.

The broker can have a considered view before the client asks a question. "I've published my morning market letter" is appropriate only when a real, retrievable, dated edition exists; it is not a simulated activity message.

The first supporting format is **Hetty's Market Letter**: a concise, reviewed edition, positioned for a morning cadence when sourcing and editorial capacity support it. Do not promise daily publishing until the process is reliable. Later formats can include company research reports, thematic/sector outlooks, earnings notes, periodic investment letters, and longer investing-method essays. Books and press/journal recognition are historical analogues, not launch requirements or implied endorsements.

### A publication is an accountable artifact

Each edition should establish:

- The AI broker byline, publication/revision time, data cutoff, scope, and actual review status. The initial public publishing workflow requires an accountable human editorial review; generation alone does not publish.
- A clear thesis; sourced evidence; what is observation, estimate, scenario, or opinion; uncertainty and material conflicts/sponsorship if any.
- Counterarguments, downside, what would change the broker's view, and the horizon or conditions over which the thesis should be revisited.
- The exact referenced instruments or unresolved product mappings. A thematic view does not establish that all constituents are available to this client or tradable on this desk.
- A durable edition identifier and citation trail. Preserve prior editions, visible corrections, and superseded/withdrawn status instead of silently rewriting a past thesis.

The public edition is a shared editorial record. Personalization can change discovery order or produce an explicitly labeled private companion note, but it must not silently rewrite that edition into a different thesis for each reader. Private conversations/holdings are not inputs to public copy without explicit permission and appropriate review. Publication content, personal notes, quote snapshots, paper instructions, and call receipts are separate artifacts.

### Read, then speak to the authoring broker

A letter opens as a readable document in the same desk environment, not a detached marketing blog. "Discuss this thesis" carries the selected edition and passage into the broker conversation. The broker distinguishes what the edition said at publication from what has changed since, cites its sources, and can disagree with or revise the thesis openly.

Offer useful prompts such as "What would change your mind?", "What is the strongest counterargument?", and "What has changed since this letter?" Reading, saving a letter, or following a theme never starts a paid call, prefills an approved order, or grants execution permissions. A call action still reviews the actual terms and requests microphone permission in context.

A news event can motivate a sourced commentary note. A thematic trade can be explored as a research scenario with thesis, instruments, exposure/overlap, costs, risks, and invalidation conditions. Neither "trending" nor reading history establishes suitability. Moving from a theme to a proposed instruction requires an explicit client action and fresh instrument/quote checks. One-click thematic/basket execution is not part of the initial scope.

### Authority is earned through a visible record

Build credibility through useful reasoning, reproducible sources, honest revisions, and a retrievable archive, not synthetic press quotations, invented subscribers, persona fame, or selected winning calls. If performance evaluation is introduced, retain timestamped point-in-time thesis versions, predefined horizons/benchmarks, entry/exit and cost assumptions, and the complete eligible set including losses, revisions, and unresolved outcomes. Keep backtests, paper results, and verified live outcomes separate. Do not transfer a historical person's reputation into claims about this AI broker's track record.

## Adaptive and adaptable desk

**Explicit-save/return continuity is in the current Jesse integration scope; inferred personalization and ranking remain later work.** Do not build an engagement score or empty “why shown” sections as first-page architecture.

**Adaptive** means the system surfaces relevant work. **Adaptable** means the client controls that workspace. Neither means rearranging essential controls unpredictably or inventing personal knowledge.

| Context | Useful desk emphasis | Boundary |
|---|---|---|
| First visit or no history | The foyer instruction and house book, with coverage visible in the offering details and optional supporting research. | The trading entry is primary; no required letter, house explainer, broker-as-heading, chain preference, invented familiarity, or compulsory questionnaire. |
| Returning client | The ledger and explicit watches in the first working view; an unfinished instruction only if it was persisted. | Do not promise resume that disappears on reload. A past discussion is not a current position. |
| Arrival from a publication | Keep that exact edition/passage in view with "Discuss this thesis". | Do not substitute a newer edition silently; flag corrections and offer the newer version. |
| Relevant news or theme | A concise, sourced "Why this is on your desk" note, linked to the relevant letter or watchlist. | Explain relevance and freshness; popularity is not a recommendation or an instruction. |
| Active conversation or confirmation | Foreground the current subject or ticket and its pending questions. | Background ranking, headlines, and prices must not move focused controls or replace the instruction under review. |

Begin with transparent rules, not an opaque engagement model: current task and client pins take precedence; then explicitly followed work and unresolved discussions; then eligible house commentary with a stated reason for relevance. Filter for access, freshness, instrument availability, and corrections before ranking. Start with explicit preferences and saves; history-based suggestions require appropriate consent and a documented retention model.

Let clients pin, dismiss, mute a topic, follow/unfollow a broker or theme, choose reading/conversation emphasis or information density, view "why shown", disable history-based personalization, and reset to the house default. Provide controls to inspect/correct/delete retained personal context; deleted or disabled inputs must stop influencing suggestions and derived memory. Do not infer risk tolerance, wealth, or permission to access a wallet from browsing behavior.

Preserve the Claflin environment, predictable navigation, broker/network identity, call terms, accessibility preferences, and confirmation controls across adaptations. Layout may adapt to screen size and preferred density; critical terms never disappear. Keep the workspace bounded, without an infinite news feed, outrage/FOMO ranking, paid-minute incentives, or optimization for trading frequency. A quiet desk and a decision not to act are valid outcomes.

## The complete client journey

These are target behaviors. See [ROADMAP.md](../ROADMAP.md) for implementation gaps and release gates.

| Stage | Client experience | Required evidence or control |
|---|---|---|
| Arrival | Give an instruction or find a supported offering in the house book; inside the selected desk, the ticket or the line is first and the room is around it. | Actual product/rail/venue coverage and paper/testnet/live mode are clear without a hero tour. Direct trading entry remains available without reading research, a house explainer, a chain picker, or the broker as a heading. |
| Connection | Establish the voice session and the account/network needed for the intended trade. | Separate microphone/call terms, account permissions, funding, and transaction authority; no silent bridging or approval. |
| Conversation / preparation | Resolve product, side, size, access, and quote; ask only the questions needed to clarify intent or explain material terms. | Research is available on demand. Prices are sourced and identified as reference, indicative, or executable; a letter is not a quote. |
| Confirmation and execution | Review exact terms, explicitly authorize, and submit through the approved adapter. | Bound quote/account/product/size/fees/expiry; mode-aware validation. No live execution until release gates pass, and no success claim from an acknowledgement alone. |
| Outcome | See the order/transaction status, fill or failure, costs, and verified position/balance effect. | Distinguish submitted, venue-accepted/filled, chain inclusion/finality where applicable, and rejected/reverted/expired/unknown outcomes. Separate the trade record from the call receipt. |
| Return | Review verified orders/positions, resume a pending intent, or initiate the next intended trade. | Fresh account data and relevant supporting notes; preserve publication editions and explain suggestions without manufacturing current holdings. |

A transcript is supporting evidence, not a substitute for a structured paper instruction. Payment for a conversation is never evidence that a paper trade was recorded, and neither is evidence of a real-market order. A shared `?intent=` link prefills a draft on the recipient's desk; it does not copy a record, a position, or an approval.

## The broker: presence before persona inventory

Hetty is the broker for the Coinbase Tokenized Stocks/Base mandate; Jesse is the broker for the Backed xStocks/Solana mandate. Neither is Claflin's display identity. Desks keep the same house and change the nameplate.

- Cast and evaluate the voice as a character in this establishment, not as a vendor preset. Provider names and IDs remain implementation details.
- Establish a recognizable greeting, cadence, vocabulary, interruption behavior, and conservative reasoning. Warmth comes from attentive service, not a cartoon mascot.
- Identify the broker as an AI character inspired by history, not the actual historical person or an authentic reproduction. Do not imply a professional license or affiliation that has not been established. Historical detail (Hetty working from a bank rather than a private office; trunks and papers) may inform the room; it must not become a biographical exhibit.
- Confidence must track the evidence. Acknowledge missing or stale information, cite sources, and refuse to invent a quote or claim an unperformed action.
- The desk may share a short note of the day — a period-informed observation from the house's own record (how its financiers worked, principles that held). On the line it is spoken exactly as written on the desk, with its attribution, once per call; the broker never improvises, embellishes, or substitutes a quote from memory. It is furniture, not document state: speakable on any foreground, including while a filed record is open, but never advice, never tied to a current price, and never during an active review.
- A voice-preview control must play an actual, representative sample. Omit it when no usable sample exists; a descriptive toast is not a preview.
- Returning to a prior topic must be grounded in available records, not fabricated recollection.

## Art direction and sound

### Reference decisions

The September 5 review used repository documentation and source, not a live visual/motion evaluation. These references have distinct responsibilities; do not merge them into an indiscriminate retro theme.

| Reference | Adopt | Do not carry over |
|---|---|---|
| [Art Deco study](https://github.com/thaovyvle/artDeco) | Architectural geometry, distinctive lettering, dark/light contrast, restrained ornament, a sense of establishment. | Its fixed-dimension educational page or literal historical reconstruction. Deco shapes the structure; it is not a gold motif on every card. |
| [Retro-futuristic UI](https://github.com/Imetomi/retro-futuristic-ui-design) | Tactile hardware, recessed illuminated displays, directional highlights, raised/pressed feedback. | Its 1970s–80s cassette-futurist spacecraft/surveillance identity, recurring glitches, boot delays, or distorted text. Capable machinery, not simulated malfunction. |
| [Sylva](https://github.com/MengTo/sylva) | Scene and interface sharing depth, a memorable central subject, responsive materials, a composed static first frame. | Moss/pollen, signature composition, source code/artwork, or shader controls everywhere. Its own code/design/artwork have no reuse license; use as a principle-level reference only. |
| [MengTo Skills](https://github.com/MengTo/Skills) | Small, coherent workflows for art direction, tactile surfaces, motion, and lifecycle/performance verification. | A wholesale skill import, mandatory smooth scrolling, or marketing-page conventions applied to a working product. |
| [John and Patricia's comfort website](https://github.com/andrewwoan/john-and-patricias-romantic-comfort-website) | Objects as meaningful destinations, bounded camera focus and spatial continuity. | Its artwork/music, compulsory entry ceremony, or exploratory navigation as a prerequisite for a financial action. |

**Art Deco supplies the architecture. Retro-futurism supplies the instruments. Sylva supplies the standard of spatial integration. The house supplies the room. The active broker supplies the relationship.**

The physical brokerage is the chosen immersiveness path: warm wood, cool glass, brass instruments, blotters and a ledger. Reuse the shipped Room scene rather than adding rooms or copying reference assets. Its duplex instrument and paper/ledger sequence carry the client's work; they are not another layer of decoration around a form. Keep completion, return and recovery coherent in both views.

### A seated desk, not a layout contract

Hetty remains an established working desk, but not the default broker after a fresh foyer visit. Jesse's integrated Night Desk adds a connected scene, duplex evidence focus, a moving slip and an opening ledger. The continuing job is completion and recovery across the shared house/offering model—not constructing additional rooms or preserving a fixed two-column form layout.

The receiver is a working control in the room's grammar: a sculptural enamel/brass object with a recessed display that lifts or hangs up the same line as the call button and the `H` key (`lib/trading/line-signal.ts`). It is not an off-the-shelf rotary phone, not the brand, and not a competing hero. Handset pickup is reserved for an actual voice connection — not a pending quote. Do not squeeze the application into the object's display; session lifecycle stays owned by the call panel.

Working notes and paper instructions are the semantic interface. They share the scene's material and lighting. Confirmation brings the instruction forward and quiets the setting. Do not specify background / middle ground / foreground as information architecture.

### Receiver: a complete desk immediately

The receiver serves an optimised still from the actual model as the first paint, then replaces it only after the matching WebGL frame. Reduced motion and unsupported devices keep that still. Do not return to a visibly different SVG placeholder.

### Material, type, and motion

The first study explores deep green/ink, dark enamel, brushed brass, warm illuminated glass, and ivory working paper. It retains Fraunces / IBM Plex Sans / JetBrains Mono while testing a more architectural wordmark and a clearer distinction between display, readable prose, and numeric/instrument labels. Final visual tuning is not yet accepted. Viewport layout of the seated desk has been checked; user-comprehension of filing, return, and recovery still needs a focused pass.

Use Deco geometry in silhouettes, proportions, framing, and identity rather than repetitive fan ornaments. Material depth must share a light direction. Stronger physical feedback belongs to interactive states, not every surface. Critical terms, controls, and content remain readable and usable independently of the scene.

Motion should establish continuity and respond to meaningful events. A quotation slip arriving beside the instruction, then becoming a filed paper record after explicit approval, is the signature interaction — one document whose changing state you understand. Restrained pointer-responsive reflections or depth may establish material; they must be additive for touch/keyboard users. No artificial waits, simulated malfunctions, or success indicators without evidence.

Three.js is justified for the bounded Night Desk scene, focus transitions, instruments and paper continuity—not a free-roaming office. Keep one renderer, bounded pixel ratio, render-on-demand and full cleanup. Financial text and actions remain semantic HTML, with direct/low-graphics and reduced-motion paths using the same work controller. The prototype has no second motion library or scroll engine; do not add one without a demonstrated need.

Sound may include a restrained receiver click, paper movement, or distant office activity. It must be opt-in, controllable, and quiet or absent during speech. Preserve voice intelligibility; no aggressive period filtering or automatic background soundtrack. The live desk offers an opt-in floor tone (`Hear the floor`); it stays off by default, dies while the line is live, and is not a soundtrack. Voice casting remains separate work.

### Review artifact and open decisions

The live product is `/`: `lib/house-entry.ts` resolves foyer versus desk entry, and `useTradingDesk` plus the selected broker session drive desk work. Stages are house/offering/desk states (instruction, selected offering, draft, review, saved, on the line), not landing-page sections. The seated desk and physical room are the organisation to keep. Remaining acceptance is completion, recovery, and whether a person can say what happened, where the record lives, and that no funds moved.

The current fixture study is `/night-desk?study=1` (`components/night-desk/`, `lib/night-desk-scene.ts`, `lib/night-desk-state.ts`, `lib/night-desk-fixtures.ts`). Canonical Room view is `/?desk=jesse&view=room` (`/night-desk` redirects there). `/desk-study` points to the fixture study only in development and stays not-found in production. Do not treat fixture prices as real market data.

Geometry, wordmark, and CSS fallback are original; no reference assets or code were transplanted. Three.js and its bundled environment helper are the rendering dependency, not Sylva's implementation.

The Night Desk prototype passed cloud Chromium desktop checks and a production build; the user approved its direction. This does not certify final materials, actual provider voice, real financial integrations, mobile acceptance, or user comprehension. Integrated first/return-visit, device and failure validation remain required.

Open decisions: how far paper analogues go before they become decoration, exact historical vocabulary, identity/portrait treatment, the current broker's sonic character beyond the live voice session, and measured device budgets. Preserve reference attribution and update this section rather than creating a competing design brief.

### Explicit exclusions

- Directory-first onboarding, provider-name chips, decorative count-up codes, and star ratings as the primary basis for choosing a broker.
- A bouncing/celebrating telephone mascot as the core brand presence, or a spectacular phone as the product.
- Making the first broker the house identity or the principal display heading.
- Streak pressure, paid-call consumption incentives, or trading gamification.
- Fake market activity or unsourced quotations used as credible-looking atmosphere.
- Mandatory rotary gestures, autoplay ambience, cinematic loading delays, or a WebGL rebuild without a demonstrated experience need and performance budget.
- A landing-page outline: hero stance, signature object, character plate, then the ticket.
- A house-strategy grid (Jesse / Isabel / Arbitrum) as first-page content.
- Repeating the broker as plate, status, call section, and open-door card.
- A visibly different SVG or enamel fallback that "loads in" to the real receiver.
- A fully simulated office, or props that hide the trading controls.
- A certificate-shaped object presented as legal ownership or custody.

## Trust and accessibility are part of the experience

- Paper trading must be visibly distinct from real-money execution throughout the journey. Live settlement is implemented only behind desk-specific gates and remains a preview/release-acceptance concern, not a blanket supported product promise.
- Actual market information needs provenance and freshness. Clearly distinguish historical, illustrative, stale, unavailable, and current data; do not mix fictional quotes with live operational activity.
- Show the actual rate and enforced cap before a paid call. Preserve them on mobile. A chosen cap is a contract, not a suggested decoration.
- Show exact call-payment approval and settlement status separately from research and paper-instruction status. Never turn a requested payment into a success claim without evidence.
- Use semantic, keyboard-operable controls, visible focus, readable contrast and type, accessible dialogs, and reduced-motion behavior. Preserve essential terms and actions at narrow widths before decorative content.
- Provide transcript/text support where implemented and communicate delays honestly. Voice-first must not mean concealing information from clients who cannot hear or speak in the moment.
- Explain microphone use and the storage/sharing implications of notes, recordings, and transcripts. No background capture or inferred permission from onboarding completion.
- Failure states preserve useful work, explain what did and did not happen, and offer a safe next action. Do not automatically retry calls, payments, or instructions because a read-only data fetch can be retried.

## Product boundaries and expansion

The old client experience is retired, not maintained alongside the desk. Registration, directory, onboarding and rating flows have no place in the current product. Voice, identity and settlement code may be reused where it meets the new contracts, but its historical UI, provider names and assumptions do not dictate the experience. No migration plan for nonexistent users is required; real funds and database operations still require explicit, scoped authorization.

The active expansion is a chain-neutral house over explicit mandates and offerings: Hetty covers Coinbase Tokenized Stocks on Base, Jesse covers Backed xStocks on Solana, and Isabel/Robinhood Chain plus Jay/Arbitrum remain planned. Each release requires distinct coverage, verified venue/execution adapters and an account/eligibility model, plus context-preserving handoffs. Editorial identity supports those capabilities rather than substitutes for them. This is a curated brokerage house, not a mandate for open marketplace growth.

Robinhood's official documentation describes a live permissionless EVM L2, but permissionless network access does not establish unrestricted eligibility for its Stock Tokens. Their underlying-equity exposure, multiplier-adjusted units/prices, and venue-specific execution need an explicit adapter. See [Robinhood Chain integration baseline](AGENTIC_ARCHITECTURE.md#robinhood-chain-integration-baseline) for dated source findings; no Robinhood API or chain configuration is changed by this document.

Rail-neutral offering-led entry is the target. The client-facing house model lives in `lib/house.ts`, `lib/house-entry.ts`, and `lib/desk/*`; historical provider configuration is not the source of client identity. Base offerings use the canonical catalog and Aerodrome estimate/live path (`docs/LIVE_BASE_SPRINT.md`); Solana offerings use the xStock catalog and Jupiter estimate/live path. Optional Sign in (Privy) is an account-tier scaffold — paper backup and transcript write, not a front door. A read-only Coinbase Verifications check exists in source for a later authority tier and is not shown on the paper desk. Retained Arbitrum billing/identity infrastructure is separate: do not globally replace chain constants or infer market access from a broker name.

Live execution is a core product milestone, released only after appropriate integrations, eligibility/compliance review, security verification, and transaction authorization are proven. The current gated implementations are previews of that path — paper/testnet validation precedes them but does not replace a full release review as the product goal. Publishing letters does not authorize transactions, and editorial readiness is not a prerequisite for the direct trading path. Telephony, alternative payment protocols, and general agent delegation remain optional, needs-driven work.

## How we evaluate the experience

The primary outcome is **successful facilitation of the client's intended, eligible, explicitly authorized trade**, with accurate terms and a verifiable outcome. Measure the trading funnel before editorial engagement: intent resolution, eligible quote availability, time to a valid quote, review/authorization completion, submitted-to-filled/finalized outcomes, and accurate position/receipt reconciliation. Define each denominator and separate client declines, unsupported/ineligible requests, and technical failures.

Track quote expiry, price/fee surprises, duplicate-prevention, rejected/reverted/unknown transactions, recovery, and repeat successful use. Distinguish simulation, testnet, and live metrics. Higher completion should come from removing confusion and failures, not bypassing consent or inducing unnecessary turnover; paid call duration and raw activity are not success proxies.

During beta, verify that clients can reach the direct trade path without reading a letter; understand AI identity, mode, product rights/units, account/network, quote terms, and fees; authorize only the intended action; and verify the result independently of the call receipt. A client can decline safely without being treated as a product error.

Evaluate publications and adaptation by their contribution to discovery, comprehension, decision confidence, and fewer trading errors. Preserve correction visibility, reasons for relevance, and client overrides. Reading-only outcomes remain useful supporting outcomes but cannot be counted as proof of execution readiness. Establish baselines before numerical targets; do not invent validation or performance results.

## Documentation ownership

- **This document** owns enduring product principles, the client journey, information hierarchy (house identity and attention), exclusions, and reference-dependent decisions. It does not own a component list or a visual stack.
- **[ROADMAP.md](../ROADMAP.md)** owns sequencing, remaining completion-and-recovery work, house-desk order, and release evidence. Jesse live trading is implemented behind dual env gates; release acceptance and user authorization remain separate.
- **[AUTH_AND_ACCESS.md](AUTH_AND_ACCESS.md)** owns capability tiers and what the account scaffold actually does.
- **[README.md](../README.md)** owns orientation, setup, and the documentation map.
- **Technical documents** own implementation details and dated observations, not independent product strategies. Distinguish historical behavior, current code, and proposed behavior explicitly.

When a decision changes, update its owning document and link to it rather than copy competing versions across the repository. A design or implementation proposal should state which stage of the client journey it improves, what truthful evidence drives it, and how it will be verified.
