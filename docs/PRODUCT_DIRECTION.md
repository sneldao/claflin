# Claflin Product Direction

**Status:** Canonical product cutover approved, 2026-09-05; implementation notes refreshed 2026-09-08. The old onboarding/directory approach is retired. `/` is Hetty's desk: live estimates, explicit review, local paper records, a tape of indicative marks, and a live ElevenLabs voice session whose client tools drive the same paper draft. `/desk` redirects there; `/desk-study` is a development-only fixture, not the product. Live execution remains unimplemented. Signing and submission are not voice-reachable. An optional Sign in control may appear when Privy is configured — it does not gate the desk and is not live access.

**Governing decision:** there are no existing users or collaborators requiring preservation of the old experience. Be intentional about replacement: preserve useful technical capabilities selectively, not legacy flows, identities or product assumptions. Git history is the reference for the retired approach.

First arrival is the product, not a prerequisite tour. The client is in a room: house stance, paper mode, an empty ticket, Hetty’s plate, and a door that does not ring itself. No default trade, mandatory personality questionnaire, dial exercise, free-call funnel or marketplace should intervene. Permissions and detailed terms belong at the relevant action. Navigation should describe the client's work—not directories, design studies or implementation milestones.

## The central idea

**Claflin is a voice-first trading product expressed as a Deco-futurist brokerage house. Specialist AI brokers help clients turn trading intent into clearly understood, explicitly authorized, verifiable execution.**

This is a brokerage from a future imagined through Art Deco: architectural, tactile, technologically sophisticated, and personal. Historic manners and materials coexist with contemporary information and explicit modern safeguards. The world should make trading more understandable and direct, not add a ceremonial layer in front of it.

Hetty is the first relationship and Base the first intended execution network, followed by Jesse Livermore on Solana and Isabel Benham on Robinhood Chain. Each desk combines a recognizable approach with actual market access. One broker first does not mean one broker forever.

The primary loop is **express intent → resolve the instrument and access → obtain a quote → review and authorize → execute → verify the outcome and position**. A client who knows what they want can go directly to that path. Reading a letter or discussing a thesis is an optional entry/support path, never a required first step.

The publishing-house idea remains valuable as decision support and broker identity, not a coequal content business or a prerequisite for launching trading. A client can decline a trade or stop after research; respecting that choice does not change the product's execution-first purpose.

This is not an AI-service marketplace with a retro skin. It is not a historical reconstruction, a claim to be a regulated brokerage, or an invitation to pretend contemporary securities existed in an earlier period. The brokerage is the experience metaphor; AI identity, capabilities, data provenance, and payment boundaries remain explicit.

**The user is the client, not the switchboard operator.** The switchboard is supporting context, not the user's job.

## Audience and job

The initial audience is clients who want a simpler way to discover, understand, and execute supported trades, including expressing an order aloud. Because the first product is Coinbase Tokenized Stocks—restricted to eligible non-US users—the natural early market is people outside the US who want approachable access to US-equity exposure onchain. They should not need to understand voice vendors or agent registries, but must be able to identify the product, network/account, costs, and authorization they are using. Validate audience assumptions in beta rather than assuming a broader market is already proven.

The core job is: **help me make the trade I intend, on the right market and account, under terms I understand and approve, and show me what actually happened.** Research helps clarify intent; it is not a substitute for an execution-capable product.

Paper simulation and testnet transactions are development/validation stages, not the long-term end product. Live execution is a core planned milestone with explicit integration, eligibility, and security gates; it is not currently implemented. A user's decision not to proceed must always be respected.

Return visits should make it easy to review actual orders/positions, resume a pending decision, or place another intended trade without restarting a discovery or content-consumption sequence.

## Decisions that govern the product

1. **One convincing Hetty first; a curated house over time.** Personality explains how a broker thinks; a real desk mandate explains what they can do. Expand specialist coverage after proving the first relationship, not by adding interchangeable AI inventory.
2. **Behavior establishes the world.** A receiver connecting, research returning, or an instruction becoming a paper ticket carries meaning. Glows, arbitrary number animations, fake quotations, and mechanical gestures that only advance tutorials do not substitute for it.
3. **Trade facilitation is primary.** Instrument access, quote quality, order review, execution, and outcome tracking take priority over editorial content and call telemetry. Keep call controls/terms available, but do not make publications or prolonged conversation a prerequisite for a trade.
4. **Clarity wins over theater.** No artificial connection waits, obscure controls, surprise microphone activation, fictional market data presented as real, or aesthetic treatment that conceals a financial boundary.
5. **Continuity, not consumption.** Help clients resume notes and unresolved questions. Do not reward paid minutes, daily calling streaks, or trading frequency.
6. **Progressive disclosure, not hidden terms.** Keep provider/protocol detail secondary; expose AI identity, paper-only status, trial terms, paid rate, actual cap, and required approval before the relevant action.
7. **Immersion is optional; usability is not.** The complete journey must work without ambient audio, spatial motion, a pointer gesture, or a desktop-sized viewport.

## The specialist brokerage house

| Desk | Character and editorial lens | Intended initial access | Status |
|---|---|---|---|
| Hetty | Capital preservation, independent judgment, downside and concentration before conviction. | **Coinbase Tokenized Stocks on Base**: B20 tokens issued by Coinbase, 1:1 claims on shares in regulated custody, eligible non-US users only. Catalog and contract addresses documented in the [integration baseline](AGENTIC_ARCHITECTURE.md#coinbase-tokenized-stocks-on-base-integration-baseline); Aerodrome read-only quote adapter implemented for the initial paper subset. | First delivery priority; paper estimate/review/local-record flow exists, execution adapter not implemented. Eligibility gating is Claflin's responsibility—secondary trading is permissionless onchain. |
| Jesse Livermore | Price action, timing, market structure, disciplined speculation. | Solana; asset catalog and execution adapter to be selected. | Later specialist desk, after Hetty's flow is proven. |
| Isabel Benham | Fundamental and sector analysis supporting trade decisions. | Robinhood Chain, not Robinhood's brokerage-account API. | Network choice resolved by the user. Official docs describe a live EVM L2 and Stock Token integrations; Claflin's specific products, venue, eligibility, and adapter remain to be verified. |
| Arbitrum desk (broker TBD) | To be defined when commissioned. | Arbitrum; likely the deepest existing Claflin infrastructure overlap. | Fourth and last in the current sequence—after Base, Solana, and Robinhood Chain. Do not accelerate it because call billing already uses Arbitrum; billing infrastructure is not an execution mandate. |

Use clear introductions such as "Hetty — your Base broker" only when the access is actually supported; otherwise mark it planned. History is optional context, not a prerequisite for using a desk. Characters are AI, inspired by historical figures, not the actual people or inheritors of their credentials, affiliations, or trading records. Fact-check biographical material before publication; historical inspiration is not evidence of present competence.

The chain does not determine the strategy. Base is not inherently conservative, nor Solana inherently speculative. Each desk needs a supported-instrument catalog, venue/access policy, permissions, risk boundaries, and evidence of operational readiness. Personality cannot override shared safeguards. Primary-network assignments are mandates, not hardcoded identity: broker identity, execution network, client account, call-payment network, and identity-registry network remain distinct.

Keep one house identity, quotation/ticket conventions, and consent model. Vary voice, editorial perspective, specialist working material, and restrained desk accents rather than create separate themed applications. "Other desks" becomes a small curated directory only as those desks become ready.

A handoff preserves the question, selected publication edition, and permitted research context. Explain what is shared, destination coverage/account requirements, and changed call terms. Ask before transferring private context. Do not silently move transaction authority, bridge funds, switch accounts, or reuse an approval for the new desk.

## Prices as working information

Prices belong to the client's work, not to decorative atmosphere. Resolve the exact instrument before showing an actionable price: a company ticker alone cannot identify a tokenized issuer/product, contract or mint, network, venue, rights, restrictions, or unit of ownership.

| Surface | Role | Required distinction |
|---|---|---|
| Arrival: tape | Indicative Chainlink reference marks for the quote-supported instruments. Click loads the ticket. Not an offer. | Source, as-of / stale / unavailable labels. Never mix with the venue estimate. |
| Arrival: "On your desk" | A compact board for watched instruments, an in-progress draft, or the last paper record. A new client can have an empty board. | Working context, not a feed. Holdings are not invented. |
| Conversation: quotation slip | Focus on the selected instrument, with optional price history/fundamentals and supporting research. | Underlying-stock reference price versus the particular tokenized product's indicative price. Label delayed, stale, closed-session, and unavailable data. |
| Confirmation: quote-bound ticket | Review terms for the exact side and size at the chosen venue, or the explicit simulation model. | Executable/indicative/simulated status, spend or quantity, fees, slippage/price impact as applicable, validity, network, and authorizing account. Call charges remain separate. |

Use structured, appropriately licensed market data for prices and a venue adapter for actionable quotes; a web-search summary or language-model answer is not an execution quote. A market's last close is not a current offer, and an underlying stock price does not prove the cost or rights of a tokenized representation. Units must say shares, token units, or underlying-equivalent units accurately.

A changed instrument, side, size, account, network, or material quote term requires a new review. Expired quotes cannot execute; refresh and present the applicable terms before renewed approval. Simulated fills need explicit pricing, fees, and fill assumptions and must never appear as real executions. Detailed adapter contracts live in [Architecture](AGENTIC_ARCHITECTURE.md#target-domain-contracts).

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

**Adaptive** means the system surfaces relevant work. **Adaptable** means the client controls that workspace. Neither means rearranging essential controls unpredictably or inventing personal knowledge.

| Context | Useful desk emphasis | Boundary |
|---|---|---|
| First visit or no history | Hetty's actual coverage, instrument search or voice trading-intent entry, and optional supporting research. | The trading entry is primary; no required letter, invented familiarity, or compulsory questionnaire. |
| Returning client | Verified orders/positions where connected, a pending intent, or watched instruments; relevant notes/letters support the next decision. | Use permitted, fresh records; a past discussion is not proof of a current position. |
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
| Arrival | Find a supported instrument or express a trading intent to the broker. | Actual coverage and paper/testnet/live mode are clear. Direct trading entry remains available without reading research or completing a content tour. |
| Connection | Establish the voice session and the account/network needed for the intended trade. | Separate microphone/call terms, account permissions, funding, and transaction authority; no silent bridging or approval. |
| Conversation / preparation | Resolve product, side, size, access, and quote; ask only the questions needed to clarify intent or explain material terms. | Research is available on demand. Prices are sourced and identified as reference, indicative, or executable; a letter is not a quote. |
| Confirmation and execution | Review exact terms, explicitly authorize, and submit through the approved adapter. | Bound quote/account/product/size/fees/expiry; mode-aware validation. No live execution until release gates pass, and no success claim from an acknowledgement alone. |
| Outcome | See the order/transaction status, fill or failure, costs, and verified position/balance effect. | Distinguish submitted, venue-accepted/filled, chain inclusion/finality where applicable, and rejected/reverted/expired/unknown outcomes. Separate the trade record from the call receipt. |
| Return | Review verified orders/positions, resume a pending intent, or initiate the next intended trade. | Fresh account data and relevant supporting notes; preserve publication editions and explain suggestions without manufacturing current holdings. |

A transcript is supporting evidence, not a substitute for a structured paper instruction. Payment for a conversation is never evidence that a paper trade was recorded, and neither is evidence of a real-market order. A shared `?intent=` link prefills a draft on the recipient's desk; it does not copy a record, a position, or an approval.

## Hetty: presence before persona inventory

- Cast and evaluate her voice as a character in this establishment, not as a vendor preset. Provider names and IDs remain implementation details.
- Establish a recognizable greeting, cadence, vocabulary, interruption behavior, and conservative reasoning. Warmth comes from attentive service, not a cartoon mascot.
- Identify her as an AI broker inspired by history, not the actual historical person or an authentic reproduction. Do not imply a professional license or affiliation that has not been established.
- Her confidence must track the evidence. Acknowledge missing or stale information, cite sources, and refuse to invent a quote or claim an unperformed action.
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

**Art Deco supplies the architecture. Retro-futurism supplies the instruments. Sylva supplies the standard of spatial integration. Hetty supplies the relationship.**

### The signature object and composition

The Claflin desk instrument is an original precision object: a sculptural receiver, stepped enamel/brass enclosure, recessed information display, and deliberate physical controls. It is not an off-the-shelf rotary phone or beige CRT. Do not squeeze the application into the object's display.

- **Background:** architectural depth and controlled light that imply an establishment, without a cluttered historical set.
- **Middle ground:** the instrument and Hetty's identity establish presence and the primary invitation.
- **Foreground:** readable working notes and paper instructions are real semantic interface elements, sharing the scene's material and lighting logic.

The same environment persists through arrival, conversation, and confirmation. Confirmation brings the instruction forward and quiets the setting; departure and return should continue that visual logic when implemented. The desk is where the product happens, not an image above a separate dashboard.

### Material, type, and motion

The first study explores deep green/ink, dark enamel, brushed brass, warm illuminated glass, and ivory working paper. It retains Fraunces / IBM Plex Sans / JetBrains Mono while testing a more architectural wordmark and a clearer distinction between display, readable prose, and numeric/instrument labels. Final visual tuning is not yet accepted.

Use Deco geometry in silhouettes, proportions, framing, and identity rather than repetitive fan ornaments. Material depth must share a light direction. Stronger physical feedback belongs to interactive states, not every surface. Critical terms, controls, and content remain readable and usable independently of the scene.

Motion should establish continuity and respond to meaningful events. Restrained pointer-responsive reflections or depth may establish material; they must be additive for touch/keyboard users. No artificial waits, simulated malfunctions, or success indicators without evidence. A labeled design study may illustrate states, but must never represent them as a real connection or persisted instruction.

Three.js is justified for the original object, not as a reason to rebuild the app or add effects everywhere. Use a complete static fallback, bounded pixel ratio, visibility-aware scheduling, no continuous idle render loop, and full resource cleanup. The first study uses existing CSS/React for interaction; it does not add a second motion library or a scroll engine.

Sound may include a restrained receiver click, paper movement, or distant office activity. It must be opt-in, controllable, and quiet or absent during speech. Preserve voice intelligibility; no aggressive period filtering or automatic background soundtrack. The live desk offers an opt-in floor tone (`Hear the floor`); it stays off by default, dies while Hetty is speaking, and is not a soundtrack. Voice casting remains separate work.

### Review artifact and open decisions

The live product composition is `/` (`components/desk/WorkingDesk.tsx` and the desk instrument). It owns arrival, conversation, and confirmation as real desk stages driven by `useTradingDesk` and the Hetty session — not scripted study states.

`/desk-study` (`app/desk-study/page.tsx`, `components/desk/DeskStudy.tsx`, `lib/desk-study.ts`) remains a development-only fixture: three manually selectable states, in-memory acknowledgement, no records, no market-data or microphone access, noindex, absent from client navigation and production. Do not treat it as the product or as visual acceptance of `/`.

Geometry, wordmark, and CSS fallback are original; no reference assets or code were transplanted. Three.js and its bundled environment helper are the rendering dependency, not Sylva's implementation.

Browser visual and device validation remain required; source, type, and build checks do not certify the composition's appearance or frame rate.

Open decisions: final instrument/material tuning, exact historical vocabulary, identity/portrait treatment, Hetty's sonic character beyond the live voice session, and measured device budgets. Preserve reference attribution and update this section rather than creating a competing design brief.

### Explicit exclusions

- Directory-first onboarding, provider-name chips, decorative count-up codes, and star ratings as the primary basis for choosing Hetty.
- A bouncing/celebrating telephone mascot as the core brand presence.
- Streak pressure, paid-call consumption incentives, or trading gamification.
- Fake market activity or unsourced quotations used as credible-looking atmosphere.
- Mandatory rotary gestures, autoplay ambience, cinematic loading delays, or a WebGL rebuild without a demonstrated experience need and performance budget.

## Trust and accessibility are part of the experience

- Paper trading must be visibly distinct from real-money execution throughout the journey. The latter is not currently a supported product promise.
- Actual market information needs provenance and freshness. Clearly distinguish historical, illustrative, stale, unavailable, and current data; do not mix fictional quotes with live operational activity.
- Show the actual rate and enforced cap before a paid call. Preserve them on mobile. A chosen cap is a contract, not a suggested decoration.
- Show exact call-payment approval and settlement status separately from research and paper-instruction status. Never turn a requested payment into a success claim without evidence.
- Use semantic, keyboard-operable controls, visible focus, readable contrast and type, accessible dialogs, and reduced-motion behavior. Preserve essential terms and actions at narrow widths before decorative content.
- Provide transcript/text support where implemented and communicate delays honestly. Voice-first must not mean concealing information from clients who cannot hear or speak in the moment.
- Explain microphone use and the storage/sharing implications of notes, recordings, and transcripts. No background capture or inferred permission from onboarding completion.
- Failure states preserve useful work, explain what did and did not happen, and offer a safe next action. Do not automatically retry calls, payments, or instructions because a read-only data fetch can be retried.

## Product boundaries and expansion

The old client experience is retired, not maintained alongside the desk. Registration, directory, onboarding and rating flows have no place in the current product. Voice, identity and settlement code may be reused where it meets the new contracts, but its historical UI, provider names and assumptions do not dictate the experience. No migration plan for nonexistent users is required; real funds and database operations still require explicit, scoped authorization.

The intended expansion is Hetty/Base first, Jesse/Solana after that trading flow works well, then Isabel/Robinhood Chain, with an Arbitrum desk last. Each release requires distinct coverage, a verified execution adapter and account/eligibility model, and context-preserving handoffs. Editorial identity supports those capabilities rather than substitutes for them. This is a curated brokerage house, not a mandate for open marketplace growth.

Robinhood's official documentation describes a live permissionless EVM L2, but permissionless network access does not establish unrestricted eligibility for its Stock Tokens. Their underlying-equity exposure, multiplier-adjusted units/prices, and venue-specific execution need an explicit adapter. See [Robinhood Chain integration baseline](AGENTIC_ARCHITECTURE.md#robinhood-chain-integration-baseline) for dated source findings; no Robinhood API or chain configuration is changed by this document.

Base-first execution is the target. The client-facing house model lives in `lib/house.ts`; historical provider configuration is not the source of client identity. A canonical Base catalog and read-only Aerodrome estimate adapter support the current paper flow. Optional Sign in (Privy) is an account-tier scaffold — paper backup and transcript write, not a front door. A read-only Coinbase Verifications check exists in source for a later authority tier and is not shown on the paper desk. Signing and live execution remain unimplemented. Retained Arbitrum billing/identity infrastructure is separate: do not globally replace chain constants or infer market access from a broker name.

Live execution is a core planned milestone, released only after appropriate integrations, eligibility/compliance review, security verification, and transaction authorization are proven. Paper/testnet validation precedes it but does not replace it as the product goal. Publishing letters does not authorize transactions, and editorial readiness is not a prerequisite for the direct trading path. Telephony, alternative payment protocols, and general agent delegation remain optional, needs-driven work.

## How we evaluate the experience

The primary outcome is **successful facilitation of the client's intended, eligible, explicitly authorized trade**, with accurate terms and a verifiable outcome. Measure the trading funnel before editorial engagement: intent resolution, eligible quote availability, time to a valid quote, review/authorization completion, submitted-to-filled/finalized outcomes, and accurate position/receipt reconciliation. Define each denominator and separate client declines, unsupported/ineligible requests, and technical failures.

Track quote expiry, price/fee surprises, duplicate-prevention, rejected/reverted/unknown transactions, recovery, and repeat successful use. Distinguish simulation, testnet, and live metrics. Higher completion should come from removing confusion and failures, not bypassing consent or inducing unnecessary turnover; paid call duration and raw activity are not success proxies.

During beta, verify that clients can reach the direct trade path without reading a letter; understand AI identity, mode, product rights/units, account/network, quote terms, and fees; authorize only the intended action; and verify the result independently of the call receipt. A client can decline safely without being treated as a product error.

Evaluate publications and adaptation by their contribution to discovery, comprehension, decision confidence, and fewer trading errors. Preserve correction visibility, reasons for relevance, and client overrides. Reading-only outcomes remain useful supporting outcomes but cannot be counted as proof of execution readiness. Establish baselines before numerical targets; do not invent validation or performance results.

## Documentation ownership

- **This document** owns enduring product principles, the client journey, exclusions, and reference-dependent decisions.
- **[ROADMAP.md](../ROADMAP.md)** owns sequencing, known implementation gaps, and release evidence.
- **[AUTH_AND_ACCESS.md](AUTH_AND_ACCESS.md)** owns capability tiers and what the account scaffold actually does.
- **[README.md](../README.md)** owns orientation, setup, and the documentation map.
- **Technical documents** own implementation details and dated observations, not independent product strategies. Distinguish historical behavior, current code, and proposed behavior explicitly.

When a decision changes, update its owning document and link to it rather than copy competing versions across the repository. A design or implementation proposal should state which stage of the client journey it improves, what truthful evidence drives it, and how it will be verified.
