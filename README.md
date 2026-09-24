# Claflin — your trading desk

**Claflin is the voice-first trading desk for global investors who want to trade tokenized US stocks onchain.**

The product spans multiple desks, mandates, venues, and settlement rails. Implementation status below describes this checkout: the foyer resolves a visitor instruction into concrete offerings, then opens only desks eligible for the selected product/rail/venue combination. Hetty covers Coinbase Tokenized Stocks on Base; Jesse covers Backed xStocks on Solana. Base has an env-gated wallet-authorized execution path; Jesse has paper filing plus a dual-env-gated live settle path. `/night-desk` redirects to `/?desk=jesse&view=room`. It does not establish the status of other branches or deployments.

**A voice-first trading product expressed as a Deco-futurist brokerage house — the office above the pit.** Clients give an instruction to a house that keeps a record. Voice, research, publications and personalization support that job.

Claflin is the institution. A desk combines a broker, mandate, settlement rail, venue, and capability policy; these are curated relationships, not an open marketplace. The house does not ask visitors to prefer a chain: an instruction resolves to concrete offerings, similar exposures on different rails remain distinct, and only eligible desks can open each offering. Hetty currently covers Coinbase Tokenized Stocks on Base; Jesse covers Backed xStocks on Solana; Isabel and Jay remain planned.

## Desk views and Stocklana team handoff

[The public Room view](https://claflin.trustfall.xyz/?desk=jesse&view=room) is the live Jesse spatial layout (same controller as Compact). Fixture study: [`/night-desk?study=1`](https://claflin.trustfall.xyz/night-desk?study=1). The **integrated Jesse desk** for Stocklana demos: [`/?desk=jesse&view=room`](https://claflin.trustfall.xyz/?desk=jesse&view=room) — real Jupiter quotes, v2 local paper, Room/Compact views, PreStocks secondary duplex (issuer mark vs token), and honest Pyth comparison when entitled. See [Jesse desk](docs/JESSE_DESK.md). `/` shows the foyer on a fresh visit and restores only a remembered open desk.

**Engineers:** [Stocklana Build Plan](docs/STOCKLANA_BUILD_PLAN.md) is the historical execution brief; [Jesse desk](docs/JESSE_DESK.md) owns current Jesse capabilities and remaining Pyth/live-release limits. [Product Direction](docs/PRODUCT_DIRECTION.md#desk-views-room--compact) records Room/Compact as view choices over the same work.

## One front door

`/` is Claflin's front door. A fresh visit opens the foyer and house book; a chosen or remembered desk then puts the ticket or the line first, with the room around it. No welcome wizard, broker questionnaire, ratings, automatic microphone request, wallet bootstrapping, or chain picker precedes the work.

The current release supports **paper estimates on Base and Solana**, an env-gated Base execution path, and Jesse's dual-env-gated Solana live path. Paper remains the default; live settlement appears only where the selected desk supports it.

1. Give the house an instruction, or choose a verified offering from the house book.
2. Compare the concrete product terms — issuer, mandate, settlement rail, venue, quote asset, and desk coverage. Similar exposures on different rails are separate offerings, never silent substitutions.
3. Open an eligible desk. The selected offering travels in `?offering=` and seeds that desk's own draft context without borrowing another desk's state.
4. Specify the supported side and amount, then review a verified, time-limited venue estimate.
5. For live settlement where the selected desk supports it, connect the appropriate wallet and explicitly authorize the rail-specific transaction. Live review and authorization remain separate from paper filing.
6. Alternatively, explicitly record a paper trade. Recording always saves a simulation, even when live execution is enabled.
7. Return to Your record for paper records and live transaction history, pin a mark to the desk, or use a record as a new draft.

The Base live path builds Aerodrome router transactions, submits them through the client's Privy wallet integration, and checks transaction receipts. Jesse's live path prepares a fresh wallet-bound Jupiter order, verifies the signed message against the proposal, submits it, and reconciles the result. Base swap hashes are saved locally after submission returns; Jesse proposal status and signatures live in the short-lived server-side proposal store (Redis, with memory fallback). Pending or unknown entries can be reconciled without resubmitting. Live history is transaction evidence, not a holdings view. A successful receipt or confirmed signature, not a quote or submitted operation alone, establishes the displayed outcome.

A selected offering may preselect the instrument, but it never preselects an amount or authorization. Paper records are simulations, not fills, submissions, wallet positions, or call receipts. They live in this browser first. Visiting Isabel or Arbitrum is a closed room — an approval from one desk cannot come with you. Jesse’s records stay browser-local (no account sync). When an optional account is configured and the client is signed in on Hetty, new Base records are also copied to that account (best-effort; local storage stays authoritative; deletes are local-only and can reappear from the account copy). Records are visible to anyone using that browser profile.

**Voice & Dictation:** 
- **AssemblyAI Dictation (Input / Audit Trail):** Dictation on the trading ticket uses AssemblyAI's synchronous Dictation API (`POST /api/dictation` routing to `dictation.assemblyai.com/transcribe`). Spoken instructions (e.g., *"Buy 100 USDC of NVDA"*) have disfluencies (*"ums"*, *"ahs"*) stripped at the speech model level, outputting a clean, auditable transcript that automatically structures the order ticket draft. See [docs/DICTATION.md](docs/DICTATION.md).
- **AssemblyAI Voice Agent API (Jesse's line):** Jesse can run on AssemblyAI's Voice Agent API instead of ElevenLabs. The browser gets a single-use token from `POST /api/desk/jesse/voice-agent/token` (the key stays server-side; sessions are capped at 10 minutes), opens `wss://agents.assemblyai.com/v1/ws`, and sends one `session.update` carrying the same prompt and client tools as the ElevenLabs agent (`lib/jesse/assemblyai-agent.ts`, handlers shared in `lib/jesse/desk-tools.ts`). **Progressive tool reveal** keeps `record_paper` unregistered until a quotation is in review, and it runs in `hold` mode; tool results are released only on `reply.done`. Enable it with `NEXT_PUBLIC_JESSE_VOICE=assemblyai`, or per visit with `?line=assemblyai`. ElevenLabs stays the default. See [docs/ASSEMBLYAI_VOICE_AGENT.md](docs/ASSEMBLYAI_VOICE_AGENT.md).
- **ElevenLabs ConvAI (Output / Broker Persona):** “Ring Hetty,” lifting the desk receiver, or pressing `H` (outside form fields) opens the selected desk's live ElevenLabs ConvAI session (`POST /api/hetty/session` for Hetty; `POST /api/desk/jesse/session` for Jesse; API keys and agent ids stay server-side). The call button, receiver, and key share one line signal; session lifecycle stays in the call panel. Tool calls are *client tools* that execute against the selected desk controller in the caller's browser — they can choose the covered instrument, set the instruction and amount, request an estimate, describe the desk, pin a watched mark, share the desk's note of the day, and record paper only on explicit confirmation. Voice cannot sign, submit or reconcile transactions. Real trades require the caller's explicit live action on the ticket and wallet authorization; voice recording remains paper-only. Hetty's provisioned agent is `ELEVENLABS_AGENT_HETTY` (see `scripts/create-hetty-agent.mjs`); Jesse's setup is documented in [Jesse desk](docs/JESSE_DESK.md). If a voice session is not configured, the rest of the desk is unaffected.

**Account and wallet:** `NEXT_PUBLIC_PRIVY_APP_ID` enables Privy sign-in; `NEXT_PUBLIC_PRIVY_CLIENT_ID` is optional. Sign-in never gates the tape, estimates, paper records or ringing a desk. An account supports best-effort Base paper backup and write-only transcript storage. Live Base execution additionally requires a connected wallet, input tokens, ETH for gas and explicit wallet authorization. Jesse live uses a Solana wallet under its own flags. Sign-in alone neither authorizes spending nor proves eligibility.

**Live execution boundary:** Base transaction preparation, wallet signing, submission and receipt reconciliation are implemented, gated by `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED=true`. Jesse’s Solana live path is implemented behind both `NEXT_PUBLIC_JESSE_LIVE_ENABLED` and `JESSE_LIVE_ENABLED`. Each desk initially selects live mode only when its live capability is enabled; paper recording remains available. See [Live Base Execution](docs/LIVE_BASE_SPRINT.md) for the previously recorded mainnet smoke-test result and setup. The read-only Coinbase Verifications check (`/api/eligibility`) is separate and is not enforced by the current ticket execution path; do not describe the implemented flow as verified eligibility gating. Funding, allowances, product access policy and outcome verification remain distinct concerns. Night presentation never grants spending authority. Paper trading never grants spending authority.

## Local development

```bash
pnpm install
pnpm dev
```

Open `/`. Wallet, ElevenLabs, Privy and Redis setup are not prerequisites for the current paper desks. The Base quote service uses Base's public RPC by default; configure `BASE_RPC_URL` for an appropriate production provider. Jesse's Jupiter quotes work keyless by default; configure `JUPITER_API_KEY` only for higher provider limits. Production hosts: frontend `https://claflin.trustfall.xyz`, API `https://api.claflin.trustfall.xyz`. Set `NEXT_PUBLIC_APP_URL` for deployment metadata. Do not expose provider credentials through public environment variables.

The old client routes—including `/desk`, `/marketplace`, `/demo`, `/profile`, `/dashboard`, `/list-your-broker`, broker profiles and the old admin pages—redirect to `/`. `/desk-study` and `/widget-probe` are development-only references, absent from client navigation and unavailable in production.

Public marketplace APIs (`/api/agents` and descendants, `/api/ratings`, `/api/sdk/register`) return **410 Gone** through the routing layer. Directory seeding, public broker submission and onboarding analytics are not setup steps or product milestones. No database rows were deleted by this cutover.

## Code organization

| Responsibility | Source |
|---|---|
| House identity and desk directory | `lib/house.ts` |
| Mandates, concrete offerings, desk coverage and estimate envelopes | `lib/desk/contracts.ts`, `lib/desk/mandates.ts`, `lib/desk/offerings.ts`, `lib/desk/registry.ts`, `lib/desk/estimates.ts` |
| Entry parsing, saved desk preference and `?offering=` validation | `lib/house-entry.ts` |
| Period desk notes and words of the house (one note or term of the day, never advice) | `lib/desk-notes.ts` |
| Sourced education catalog, broker examination methods, delayed-tape practice | `lib/education/`, `components/desk/EducationTopic.tsx`, `app/practice/delayed-tape/` |
| Root document, foyer and desk composition | `app/layout.tsx`, `app/page.tsx`, `components/desk/HouseFoyer.tsx`, `components/desk/HouseOfferings.tsx`, `components/desk/WorkingDesk.tsx` |
| Room view + fixture study | `/?desk=jesse&view=room`; `app/night-desk/page.tsx` (redirect / `?study=1`); `components/night-desk/` (scene + study); `components/desk/RoomPresentation.tsx`; `lib/room-view-projection.ts`; `lib/desk-presentation.ts`; `styles/desk-craft.css` |
| Intent, estimate, offering hydration and paper-record interaction | `lib/trading/useTradingDesk.ts` |
| Ticket, board, tape and record presentation | `components/desk/TradeTicket.tsx`, `components/desk/PaperLedger.tsx`, `components/desk/DeskBoard.tsx`, `components/desk/TickerTape.tsx`, `components/desk/PaperHistory.tsx` |
| House mark and desk instrument | `components/desk/HouseMark.tsx`, `components/desk/DeskInstrument.tsx`, `lib/desk-instrument.ts` |
| Explicit units and canonical catalog | `lib/trading/domain.ts`, `lib/trading/catalog.ts`, `lib/tokenized-stocks.ts` |
| Offering presentation, instruction matching and desk eligibility | `lib/desk/offerings-presentation.ts`, `components/desk/HouseOfferings.tsx` |
| Base estimate service and RPC integration | `lib/trading/quotes.ts`, `lib/trading/aerodrome.ts` |
| Desk adapter resolution, quote and marks routes | `lib/trading/adapters.ts`, `app/api/desk/[deskId]/quote/route.ts`, `app/api/desk/[deskId]/marks/route.ts` |
| Thin HTTP boundary | `lib/trading/http.ts`, `lib/api-client.ts`, `app/api/stocks/quote/route.ts`, `app/api/stocks/marks/route.ts` |
| Indicative tape marks (Chainlink on Base; Jupiter venue-duplex marks on Solana — reference, never offers) | `lib/trading/marks.ts`, `lib/trading/marks-shared.ts`, `lib/trading/useReferenceMarks.ts`, `lib/trading/adapters/jupiter-marks.ts` |
| Market clock, broker voice and the ring-on-arrival line | `lib/market-clock.ts`, `lib/use-market-clock.ts`, `lib/desk/broker-voice.ts`, `lib/desk/broker-take.ts`, `lib/trading/line-signal.ts`, `components/desk/BrokerLine.tsx` |
| House presence grammar (blotter hearables, blank slip, receiver, room clock, shared copy) | `components/desk/BlotterHearables.tsx`, `components/desk/ReceiverShell.tsx`, `components/desk/RoomMarketClock.tsx`, `lib/desk/ui-copy.ts` |
| Solana instruments, estimates, paper and live evidence | `lib/solana/` |
| Shared draft/review transitions and local persistence | `lib/trading/workflow.ts`, `lib/trading/paper-records.ts` |
| Live execution journal (approvals, submitted/confirmed swaps) | `lib/trading/live-journal.ts`, `lib/trading/useLiveJournal.ts`, `lib/trading/useDeskExecution.ts` |
| Desk slips (commemorative first-paper / first-live keepsakes) | `lib/trading/desk-slips.ts`, [docs/DESK_SLIPS.md](docs/DESK_SLIPS.md) |
| Delight: spoken-line caption, since-last-visit tray deltas, ledger export | `lib/trading/tray-deltas.ts`, `lib/trading/ledger-export.ts` (wired in `WorkingDesk.tsx`, `DeskBoard.tsx`, `TradeTicket.tsx`, `PaperLedger.tsx`) |
| Optional account, paper backup, transcript write | `components/auth/AuthProvider.tsx`, `lib/auth.ts`, `lib/trading/usePaperSync.ts`, `app/api/paper/route.ts`, `app/api/hetty/transcript/route.ts` |
| Voice dictation input (AssemblyAI) | `app/api/dictation/route.ts`, `lib/dictation/useDictation.ts`, `lib/trading/dictation-parser.ts`, `components/desk/TradeTicket.tsx`, [docs/DICTATION.md](docs/DICTATION.md) |
| Desk voice sessions (ElevenLabs) | `components/desk/HettyCall.tsx`, `components/desk/JesseCall.tsx`, `lib/trading/voice-tools.ts`, `lib/desk-notes.ts`, `lib/education/`, `app/api/hetty/session/route.ts`, `app/api/desk/jesse/session/route.ts` |
| Eligibility check (source only; not a paper-desk surface) | `lib/eligibility.ts`, `app/api/eligibility/route.ts` |
| Shareable paper-intent links | `lib/share.ts` |

Trading uses decimal strings and integer base units. The Base service verifies chain, pool/factory, token order, decimals and output at a recent block; Solana estimates preserve mint identity, amount units and Jupiter route evidence. Estimates are never called executable orders. Reference observations have explicit freshness and uncertainty labels.

Older voice, billing, registry and webhook modules remain implementation scaffolding, not the client-facing identity system. They are not mounted by the root layout. Arbitrum billing and identity configuration are independent of Base trading. Retained settlement is not a stock execution adapter.

## Verification

- `pnpm test` — domain, quote, paper-record, route-cutover and retained infrastructure tests.
- `pnpm typecheck` — TypeScript verification.
- `pnpm exec next build --webpack` — production compilation without the repository's destructive standalone postbuild cleanup. Deployment packaging is a separate operation.
- `pnpm lint` — ESLint; currently reports warnings but no errors.
- Current cutover checks use source contracts and HTTP responses, not a browser automation session. Earlier paper-desk browser checks do not establish visual acceptance of every subsequent change.

## Product rules

- The old approach is retired, not a compatibility target. There are no existing-user or collaborator constraints requiring it to remain in the product.
- Preserve useful implementation capabilities selectively; do not preserve the old discovery, onboarding or billing-led experience.
- Give the client one coherent place to work. At the house, the first semantic thing is the instruction and concrete offerings; inside a desk, it is the ticket or the line. Do not list page inventory as the product, make the first broker the house identity, or present the settlement rail as the strategy.
- Explain permissions and terms at the relevant action rather than build a prerequisite tour or a house-strategy grid.
- Keep paper mode, product identity and material terms clear. Put technical metadata in the relevant details, not the welcome headline. Say paper mode once — `MODE_HINTS` behind the ModeStamp ⓘ + `LINE_FOOT` at the line foot; no duplicate `title=` on tape/wire/ModeStamp/ledger/dictation/call-foot (91ce5d6).
- A provider configuration or historical token listing is not evidence of operational readiness.
- Sign-in alone is not trade authority. Live execution requires the explicit approve/execute wallet ceremony; a passing eligibility check is not access on its own.
- Use the existing Next.js/React/TypeScript, ethers, Zod, Tailwind and Three.js stack; do not introduce a framework migration for this cutover.

## Canonical documentation

- [Jesse desk](docs/JESSE_DESK.md): seated Solana paper desk — storage, ports, grammar, evidence honesty.
- [Stocklana build plan](docs/STOCKLANA_BUILD_PLAN.md): four-engineer Jesse integration brief and remaining acceptance.
- [Product Direction](docs/PRODUCT_DIRECTION.md): jobs, principles, and information hierarchy — not page anatomy.
- [The Foyer Is the Line](docs/FOYER_LINE.md): foyer anatomy (voice-first dealer turret) and its build phases.
- [Jesse on AssemblyAI's Voice Agent API](docs/ASSEMBLYAI_VOICE_AGENT.md): flag, protocol, progressive tool reveal, verification.
- [AssemblyAI Voice Agent Hackathon submission pack](docs/ASSEMBLYAI_SUBMISSION.md): URLs, copy, video script, checklist.
- [Roadmap](ROADMAP.md): current state and next release gates.
- [Auth and access](docs/AUTH_AND_ACCESS.md): capability tiers and what the account scaffold actually does.
- [Architecture](docs/AGENTIC_ARCHITECTURE.md): domain boundaries, integration evidence and retained implementation references.
- [Performance](docs/PERFORMANCE.md): runtime requirements and verification.
- [Deployment](docs/DEPLOYMENT.md) and [Hetzner deployment](docs/HETZNER_DEPLOYMENT.md): infrastructure reference; deploy frontend and API versions together when proxying `/api/*`.
- [Widget architecture](docs/WIDGET_ARCHITECTURE.md), [Redis keys](docs/REDIS_KEYS.md), and [payment security](docs/SECURITY_ARCHITECTURE_COMPARISON.md): retained service references, not the primary client experience.
