# Claflin Roadmap

**Updated: 2026-09-23 — lean desk (91ce5d6): duplicate `title=` removed so each boundary is said once; `BLANK_SLIP_NOTE` trimmed so foyer owns the ring pitch.** The old directory/onboarding product is retired. Claflin is a curated, trade-first brokerage house with one coherent client desk. There are no existing-user or collaborator requirements to preserve the former experience. Desk-slip provenance (belonging without fake equity) is sequenced in §6 and [docs/DESK_SLIPS.md](docs/DESK_SLIPS.md).

[Product Direction](docs/PRODUCT_DIRECTION.md) owns jobs, principles, and information hierarchy. [Architecture](docs/AGENTIC_ARCHITECTURE.md) owns contracts and integration evidence. [Auth and access](docs/AUTH_AND_ACCESS.md) owns identity tiers. This roadmap owns sequencing, known gaps, house-desk order, and release gates.

## Current product

- `/` is Claflin's front door. On a fresh visit it opens the foyer and house book; `/desk` is an alias, not a second product. Former marketplace, demo, profile, dashboard, broker-profile, listing and admin pages redirect to `/`.
- No onboarding wizard, broker questionnaire, directory, ratings, streaks or free-call funnel is mounted. The paper desk does not require a wallet, an account, or a microphone.
- The house book resolves a natural-language instruction into verified offerings. Comparable exposures stay separate when issuer, terms, instrument, rail, venue or desk coverage differ; only open desks with actual coverage are shown. `?offering=` carries the selection and is removed when it does not cover the selected desk.
- The seated first pass put the ticket and the line on one writing surface and removed the competing hero, empty continuity sections, and future-desks grid. A first-run lead (`The desk hears you.`) states the promise only while the ticket is untouched — with tappable hearable example lines — and retires on the first instrument; it is not a returning hero. A quiet footer return (`Back to your ticket`, smooth scroll with reduced-motion respect) keeps the colophon from stranding the work. Line/ticket promise copy is explicit: Hetty fills the ticket and reads it back, mic stays off until the caller talks, and nothing is filed without review (`Talk it through with Hetty`, idle `data-cue` with a reduced-motion-safe glow). The ticket title and a dictation rail speak in the same voice grammar. Paper/live mode is said once — `MODE_HINTS` behind the ModeStamp ⓘ, `LINE_FOOT` at the line foot, brass rule + lamp + thud with one-time captions — with no duplicate `title=` on the tape, wire, ModeStamp, ledger, dictation bar, ticket closing states or call foot (91ce5d6); the blank slip no longer re-sells the ring (foyer owns the pitch). The physical room, Claflin display identity, and receiver still-then-WebGL swap are in place. Remaining work is completion, recovery, and comprehension — not more rooms.
- The job is instruction → offering → eligible desk → estimate → review → local paper record, optionally driven by the line, plus explicit live settlement where the selected desk supports it. The ticket, voice tools, and receiver share one foreground document; browsing a filed record is read-only. After filing, the compact ledger sits in the working area; the archive opens from there. Surfaces exist to serve that job: ticket, tape, board (when something exists), shareable `?intent=` drafts. They are not a landing inventory.
- A live tape (`/api/stocks/marks`) shows indicative Chainlink reference marks for the quote-supported instruments — never offers — with explicit stale/unavailable labels. Tape marks load the instrument into the ticket. The receiver is a working hand on the line (with the call button and `H` key via `claflin:line-signal`); handset pickup is reserved for an actual voice connection, not a pending quote. First paint is a still from the model; WebGL replaces it after a matching frame. While the line is live the room leans in (warmer lamp, paused tape).
- A live ElevenLabs voice session (“Ring Hetty” / lift the receiver / `H`) drives the same draft through client tools executing in the caller's browser: `choose_instrument`, `set_instruction`, `set_amount`, `request_estimate`, `describe_desk`, `record_paper`, `cancel_instruction`, `watch_mark`, `share_desk_note`. Session URLs are minted server-side (`/api/hetty/session`); the agent id and API key never reach the client. Hetty cannot sign, submit or reconcile — she drafts, quotes and records paper only, and speaks the desk's live/paper mode on every empty-ticket opening. The desk note is spoken verbatim from the house record — once per call, attributed, never advice, never an improvised quote. She belongs on a nameplate, not as the principal heading.
- Hetty's read-only Aerodrome estimates use `MixedRouteQuoterV3`, the verified factory selector and canonical USDC pool identities. Buy amounts are USDC spend; sell amounts are token quantity. Amount math uses strings and integers.
- The workflow supports review, edits, expiry, refresh, cancellation and explicit recording of simulated outcomes in browser-local storage. Optional Sign in (Privy, env-gated) copies paper records to the account and writes call transcripts server-side. Sync is best-effort: local storage stays authoritative; deletes are not propagated; transcripts have no client read surface; ringing Hetty does not send the account token. This is not live access.
- Hetty's wallet signing, two-step approval/execution and live receipt reconciliation exist behind `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED` (see `docs/LIVE_BASE_SPRINT.md`); with the flag off the desk stays paper-only. A durable live journal (`claflin.live.v1.*`) persists approval and swap hashes as soon as submission returns, reconciles pending/unknown rows after reload without resubmitting, and shows them beside paper in Your record — historical transactions, not holdings. A read-only Coinbase Verifications check exists in source (`lib/eligibility.ts`, `/api/eligibility`) for a later authority tier. It is not shown on the paper desk.
- Public broker discovery/listing and ratings APIs return 410 through the routing layer. Former provider/settlement modules remain source infrastructure, not the product's identity or navigation model. No database deletion was performed.
- `/desk-study` and `/widget-probe` are development references only and return not-found in production.
- `/night-desk` redirects to live Jesse Room view (`/?desk=jesse&view=room`). Fixture study: `/night-desk?study=1`. `/` opens the house book on a fresh visit; Jesse opens through an eligible offering or the direct `?desk=jesse` deep link ([docs/JESSE_DESK.md](docs/JESSE_DESK.md)).
- House sequence (Isabel / Arbitrum) lives in §5. It is strategy, not first-page IA. Isabel and Arbitrum stay closed rooms: no quote, no paper file, no live order, and no transplanted approval. Jesse’s Solana desk is open; live settlement remains separately gated. A four-card chain grid must not return.
- Paper success is a filed paper record, not a live outcome. Live journal document types are approval, submitted swap, and confirmed swap; statuses remain `submitted`, `pending`, `filled`, `failed`, `unknown`.

## Immediate opportunity: Stocklana

Stocklana remains the Jesse/Solana milestone, confirmed submission deadline **September 25, 2026 at 16:00 ET / 20:00 UTC / 21:00 BST**. The [four-engineer build plan](docs/STOCKLANA_BUILD_PLAN.md) remains the executable/historical brief. The integrated desk now has real xStock/Jupiter paper, dual-env-gated Jupiter live settle, ConvAI and Room/Compact presentation. Do not collapse the house into a desk-first or chain-first selector: the foyer remains offering-led, and `/?desk=jesse&view=room` is the Stocklana judge deep link (`/?desk=jesse` remains valid). House presence grammar (ring first, blank slip until intent, one line foot) is shared across foyer, Hetty, and Jesse — see [Stocklana submission pack](docs/STOCKLANA_SUBMISSION.md). Bounty scope is settled (2026-09-17): main track primary, Pyth secondary, PreStocks sanctioned as an additional secondary on Jesse's desk; Clawpump, Tessera, and Meteora-DBC-as-primary are declined — rationale and constraints live in the build plan's contest-focus section.

Experience decision: Night and direct presentations are available from first use, with the same work/capabilities. The room gains continuity through explicit paper records and watches—not exams, XP, account balance, trade count, or paid-call activity. See [Product Direction](docs/PRODUCT_DIRECTION.md#night-desk-progression-and-presentation).

Sequence: shared contracts → real quote/paper-file/return → duplex evidence and voice correction in both presentations → integrated failure/first/return acceptance → independently gated live proposal/signature/reconciliation → submission. Engineer 1 owns core contracts; 2 market evidence/presenter; 3 conversation/shared attention; 4 scene integration/direct view/wallet UI/release. Each supplies evidence; the lead reviews the integrated result before promotion.

The earlier Base Builder Quest remains separate historical context, with [its demo script](docs/QUEST_DEMO.md). Do not treat that quest's assumptions or deadline as Stocklana requirements.

## 1. Finish the first useful client journey

**Implemented foundation:** canonical offering-led root entry; concrete Base and Solana offerings; exact-input estimates; explicit review and local paper records; live voice over the same desk draft; tape and desk board where coverage supports them. Seated desk: ticket and line share one writing surface; physical room around it; Claflin as display identity; selected broker as a nameplate; receiver still on first paint and lift/hang-up on the shared line signal. First-run lead states the promise once (with hearable taps) and retires; footer carries a quiet return to the ticket; primary/call actions share one brass treatment with an idle cue that respects reduced motion; header Sign in reads as the optional record-keeping promise (`Sign in to keep your record`). House copy and room tone are weather, not the product.

Remaining acceptance work:

- Keep the consolidated interface. Do not add more rooms, decorative objects, or surface areas until completion and recovery hold.
- Treat paper as the house language: blotter = draft, slip = returned estimate, receipt = filed evidence, ledger = retrievable history, tray = explicit watches. A dossier must not pretend to be a legal certificate.
- Keep finished work out of the tray. Do not label a recorded instruction “in progress,” and do not count drafts or records as pinned.
- Finish the foreground-document contract: implicit voice references follow the visible document; a missing archive record is an unavailable recovery, not a success heading; the compact ledger stays a recent preview.
- After filing, a short viewport must still show where the record went without a decorative scroll trick. Desktop: ledger beside the receipt. Mobile: compact ledger above the receipt.
- Review first visit, return visit, unavailable quote, expired review, failed filing, and missing records against the hierarchy in [Product Direction](docs/PRODUCT_DIRECTION.md). Ask what happened, where it lives tomorrow, whether funds moved, and how to change it.
- Verify keyboard, mobile, zoom, and reduced-motion on that same journey. Source tests do not substitute.
- Keep essential state stable; background updates must not replace the instrument, amount or terms under review.
- Measure user comprehension and intent-to-reviewed-estimate friction. Do not measure success by paid minutes, onboarding completion, sign-ins or trading frequency.

**Exit evidence:** a client can explain the product, amount, paper status, estimate and recorded result, and find that result on a return visit. Live trading is not that evidence. Automated checks supplement rather than substitute for product acceptance.

## 1a. The foyer is the line

**Approved 2026-09-24.** Rebuild `/` as a working dealer turret: a push-to-talk house line over the existing dictation path, desk lamps lit by offering match, a market-aware headline, a dense board with honest gaps, an annotated slip, and a labelled example call. Anatomy and gates: [docs/FOYER_LINE.md](docs/FOYER_LINE.md).

| Phase | Deliverable | When |
|---|---|---|
| 0 | Copy truth: session countdown and headline, plain subhead, "AI broker" lines, gap labelled against the stock reference, "estimate" wording, footer | May land before Stocklana if the full suite passes |
| 1 | Turret: hold-to-talk house line, lamps by offering match, named choice, mic-denied fallback | Built on branch `foyer-turret`; merge after 2026-09-25 |
| 2 | Board table with provenance and honest gap column | After Phase 1 |
| 3 | Annotated slip and labelled example call from an accepted real recording | Needs an accepted recording |
| 4 | Desks, straight answers, footer, mobile handset | — |
| 5 | After-hours pulse (real counters only) and funnel metrics | Needs a documented event source |

**Exit evidence:** a first-time visitor speaks or types an instruction within 30 seconds, reaches a matching desk without choosing a chain, and can say what the token is, which rail it settles on, and that nothing moved.

## 2. Connect Hetty to the shared instruction

**Delivered (paper scope).** “Ring Hetty” starts a live ElevenLabs ConvAI voice session: `POST /api/hetty/session` mints a short-lived signed URL server-side (API key and `ELEVENLABS_AGENT_HETTY` never reach the client; 10 sessions/minute per instance), and the desk registers nine client tools which execute in the caller's browser against the same `useTradingDesk` draft. Hetty reads back real estimate output, requires explicit confirmation before recording, and cannot sign or submit anything. `share_desk_note` lets her speak the desk's note of the day — exactly the line shown on the desk, with its attribution, once per call, on any foreground including a read-only record; the browser enforces the once-per-call rule even if she calls again. Voice and manual input manipulate one instruction; edits still invalidate review; provider failures surface honest errors rather than fabricated quotes.

Remaining within this milestone:

- Microphone consent is requested by the browser at ring time; dropped calls and mic denial surface honest errors. The desk never auto-launches a call.
- Post-call transcripts POST to `/api/hetty/transcript` when a Privy bearer token is present (30-day TTL). There is no GET and no desk UI for them. Anonymous calls store nothing. The retained webhook pipeline remains dormant. Ringing does not attach the account token, so a signed-in call is still minted anonymously.
- Recording, account binding and a live-execution tool surface remain gated work, not voice-reachable.

## 3. Establish account access and transaction preparation

The capability-tier model and the current scaffold are in [docs/AUTH_AND_ACCESS.md](docs/AUTH_AND_ACCESS.md). Voice remains a channel over the shared draft, never an authentication boundary. Sign-in is optional and must not become a front door.

Decided, not released:

- **Identity:** Privy (email/social, optional wallet link). Implemented as an env-gated provider and bearer-token verification, not httpOnly cookies.
- **Eligibility policy:** Coinbase Verifications on Base (live “Verified Account” + non-US/territory “Verified Country”). Read-only check in `lib/eligibility.ts`. Not a paper-desk surface.

Still open before any live ticket:

- Client funding model and the applicable product-access review for Coinbase Tokenized Stocks.
- Verify the execution router against the actual factory and selected pools. The historical router constant is not execution acceptance evidence.
- Bind a proposal to product, account, chain, side, exact amounts, fee/slippage bounds and validity. Separate token allowances from swap authorization.
- Check account-specific token policy/pauses, balances and required permissions. Observe corporate-action/update multiplier changes consistently.
- If the account tier is kept: bind `/api/hetty/session` to the signed-in caller, honor paper deletes on the server, and give transcripts a read surface — or keep describing the tier as optional backup with no client-visible history.
- Add deterministic and appropriate test-environment fixtures for rejection, wrong chain, stale data, expiry, changed terms and failed simulation.

**Exit evidence:** an exact, independently reviewable transaction proposal with no silent account switch, bridging or reused authority. No funds move during preparation. A passing eligibility check is not a proposal.

## 4. Release controlled live trading

- Complete product/access/compliance and security review for the selected products, users, venues and limits.
- Validate user authorization, submission, duplicate prevention and reconciliation in an explicitly approved live setup.
- Distinguish live outcomes from paper files. A paper record is filed, never filled. Live statuses already exist as types (`submitted`, `pending`, `filled`, `failed`, `unknown`); add venue reconciliation, reverted/rejected/expired as needed, and never reuse the paper receipt as a generic success model.
- Establish monitoring, incident/disable controls and client recovery paths. Call-payment receipts remain separate from trade receipts.

**Exit evidence:** authorized transactions reconcile to venue/chain evidence and actual balances. Paper or testnet success alone does not establish live readiness.

## 5. Add supporting depth and specialist desks

Research, reviewed market letters, saved interests and explainable adaptation support trade discovery and understanding. They are not required reading before a direct instruction. Avoid a CMS, infinite news feed or autonomous thematic basket project ahead of reliable trading.

**Sourced education (Phases 4–6 slice).** A versioned catalog in `lib/education/` covers the tape, certificate, bucket shop, and travelling instruction at decision points (`DeskTerm`, dossier, quote details), with `explain_concept` sharing the same copy with Hetty. Optional house history (participation) lives in the directory, not as an intro. `/practice/delayed-tape` is a labelled simulation reached from the tape topic only. Closed desks expose educational examination methods without quote or file access.

## 6. Desk slips — belonging without fake equity

Desire hook for early callers who respect the desk but need a reason to *want in*. Full plan: [docs/DESK_SLIPS.md](docs/DESK_SLIPS.md).

**Formula:** be among the first to take a Base equity instruction by voice—and keep the slip that proves you were there. Coinbase tokenized stocks remain the fractional claim; the slip is provenance only.

A keepsake records participation; it never unlocks the Night Desk or financial permissions. Stocklana requires ordinary retrievable paper records and explicit watches, not scarce seats, NFT minting or collectible mechanics. Do not build later keepsake phases as a dependency of Jesse's integration.

| Phase | Deliverable |
|---|---|
| **A (now)** | Local commemorative slips on first paper file and first live Base fill; optional spoken dedication; ledger surface; never framed as the stock |
| **B** | Onchain Base mint (soulbound preferred for firsts) with the same disclaimer in metadata |
| **C** | Optional audible dedication clip; vendor-agnostic slip metadata |
| **D** | Limited historical participation seats — scarcity + story, no marketplace/streaks |

**Not backlog under this heading:** audible NFT “parcels” of tokenised stocks, slip trading games, or any collectible that sounds like ownership of the underlying.

**Rail-neutral desk and offering seams (on main).** Shared desk vocabulary lives in `lib/desk/contracts.ts`; mandates live in `lib/desk/mandates.ts`; concrete product offerings live in `lib/desk/offerings.ts`; desk runtimes and coverage live in `lib/desk/registry.ts`; estimate context/envelopes live in `lib/desk/estimates.ts`. `lib/house.ts` remains directory and presentation metadata, not the source of execution truth. What landed:

- `DeskRuntime` supports multiple `DeskCoverage` entries: each coverage declares its mandate, rails, venues, capabilities and adapters. Planned desks keep named coverage intent but no borrowed venue or adapter.
- `InstrumentOffering` binds product, instrument, mandate, issuer, rail, venue, quote asset, units and eligible desks. Similar exposures on Base and Solana remain separate offerings.
- `quoteAdapterFor(deskId, input)` resolves a concrete instrument/offering through runtime coverage. Unknown, inactive, cross-desk or ambiguous requests fail closed rather than inferring from `chainId` or network.
- Desk-aware routes `GET /api/desk/[deskId]/quote|marks` keep per-desk budgets and caches; legacy `/api/stocks/*` delegate to Hetty's adapters. The ticket and tape thread `deskId` through `requestQuote` and `useReferenceMarks`.
- `?offering=` carries a catalog offering into an eligible desk; invalid desk/offering pairs are removed instead of hydrating the wrong instrument. Fresh estimates carry explicit desk/mandate/offering/instrument context while retaining rail-specific evidence and legacy parser compatibility; `DeskEstimateEnvelope` can wrap the full rail/venue binding when needed.

Deliberately unchanged: `TradeIntent` units (`USDC`/`token`), the voice tool names, and the paper receipt shapes. Broader paper-record and execution ports are defined in shared contracts; rail-specific records and transaction payloads remain separate.

| Desk | Sequence and gate |
|---|---|
| Hetty / Base | First. Coinbase Tokenized Stocks, verified products, explicit access and execution policy. Adapter-backed (Aerodrome + Chainlink) on the desk-aware routes. |
| Jesse Livermore / Solana | Second desk — paper desk open (default; set `NEXT_PUBLIC_JESSE_PAPER_ENABLED=false` to close). xStock catalog + Jupiter Metis quotes + v2 paper + controller + UI + ElevenLabs ConvAI line. Room/Compact presentations. Free venue duplex (Backed/Jupiter vs venue USD) + PreStocks secondary duplex (evidence-only). Jupiter marks adapter derives desk marks from the same venue-duplex read, feeding the desk tape, foyer wire, broker take and ticket gap strip. Pyth comparison API honest-unavailable until Pro entitlement + unit basis. Live Jupiter settle behind `NEXT_PUBLIC_JESSE_LIVE_ENABLED` + `JESSE_LIVE_ENABLED` (both default off). `/night-desk` → Room view; fixtures at `?study=1`. See [docs/JESSE_DESK.md](docs/JESSE_DESK.md) and [build plan](docs/STOCKLANA_BUILD_PLAN.md). |
| Isabel Benham / Robinhood Chain | Third. EVM L2 (Arbitrum Orbit, chain ID 4663) — reuses the EVM adapter pattern, not Arbitrum One. Baseline already reviewed in [Architecture](docs/AGENTIC_ARCHITECTURE.md#robinhood-chain-integration-baseline): 18-decimal stock tokens, Chainlink per-token feeds, `/assets` + `/prices` data APIs, RFQ/AMM secondary venues. **Needs:** verified secondary-market venue with quote/submission interfaces, eligibility policy, account/gas setup. Not an order-placement API today. |
| Jay Cooke / Arbitrum | Fourth. Named for the financier who built the distribution rails that let ordinary investors reach government bonds — fitting for an infrastructure-first network. Mostly config-level EVM reuse once the registry holds a second EVM entry; mandate, execution adapter and access model remain to be defined; existing billing infrastructure does not move it forward in the sequence. |

Handoffs may carry permitted context, never silent transaction authority or funds. Visiting a planned desk from the house directory is already a closed room: no ticket, no quote, no recording, and no transplanted approval. Further route options require independent product/provider verification and transparent terms. One rejected 0x NVDAc request and an Odos infrastructure error do not establish a universal aggregator prohibition.

## Not backlog

Do not revive open broker registration, marketplace rankings, personality quizzes, calling streaks, per-minute discovery, the old onboarding wizard or migration work for nonexistent legacy users. Do not put eligibility, wallet-link or “live access” chrome on the paper desk. Preserve useful code selectively, not the old product structure.

## Verification and evidence

The preceding paper slice passed unit/type/build checks and mocked browser lifecycle checks, with a separate read-only mainnet estimate. Viewport checks of the seated composition exist; they do not certify user comprehension of filing, return, or recovery. Neither set of checks claims a validated live voice or trading release. Live execution remains §4. The Night Desk prototype at decace0 separately passed 13 focused logic tests, 22 cloud desktop assertions and a production build; mobile and real provider integrations were not certified. Keep prototype and integrated-release evidence separate.
