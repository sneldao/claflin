# Claflin — your trading desk

**A voice-first trading product expressed as a Deco-futurist brokerage house — the office above the pit.** Clients give an instruction to a house that keeps a record. Voice, research, publications and personalization support that job.

Claflin is the institution. Hetty / Base is the first relationship, followed by Jesse Livermore / Solana, Isabel Benham / Robinhood Chain, and then an Arbitrum desk. These are curated AI characters and mandates, not an open marketplace or a claim of current live execution. The first broker is not the brand.

## One front door

`/` is Claflin's desk. The ticket or the line is first; the room is around it. No welcome wizard, directory, personality questionnaire, house explainer, broker-as-heading, free-call funnel, automatic microphone request, wallet bootstrapping, ratings or streaks precede the work.

The current release supports **paper trading with live venue estimates**:

1. Choose a Coinbase tokenized stock on Base.
2. Specify a USDC spend to buy, or a token quantity to sell.
3. Review a verified, time-limited estimate.
4. Edit, refresh, cancel, or explicitly record a paper trade.
5. Return to the local record, pin a mark to the desk, or use a record as a new draft.

No stock or amount is preselected. Paper records are simulations, not fills, submissions, wallet positions, or call receipts. They live in this browser first. Visiting Jesse, Isabel, or Arbitrum from the house directory is a closed room — an approval from the Base desk cannot come with you. When an optional account is configured and the client is signed in, new records are also copied to that account (best-effort; local storage stays authoritative; deletes are local-only and can reappear from the account copy). Records are visible to anyone using that browser profile.

**Voice:** “Ring Hetty” opens a live ElevenLabs ConvAI voice session (`POST /api/hetty/session` mints a short-lived signed URL; the API key and agent id stay server-side). Hetty’s tool calls are *client tools* that execute against the desk in the caller’s browser — she can choose the instrument, set the instruction and amount, request an estimate, describe the desk, pin a watched mark, share the desk's note of the day, and record a paper trade only on explicit confirmation. She cannot sign, submit or reconcile — nothing moves onchain. The provisioned agent is `ELEVENLABS_AGENT_HETTY` (see `scripts/create-hetty-agent.mjs`). If the voice session is not configured, the rest of the desk is unaffected.

**Account (optional):** when `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID` are set, a Sign in control appears. Sign-in never gates the tape, estimates, paper records or ringing Hetty. It unlocks best-effort paper backup and write-only transcript storage. It is not live access, eligibility, or a wallet requirement.

**Live execution boundary:** there is no transaction construction, signing or submission in the desk. A read-only Coinbase Verifications check exists in source (`/api/eligibility`) for a later authority tier; it is not shown on the paper desk. Account eligibility, funding, allowances, router compatibility and outcome reconciliation remain release gates. Paper trading does not establish eligibility for the live products.

## Local development

```bash
pnpm install
pnpm dev
```

Open `/`. Wallet, ElevenLabs, Privy and Redis setup are not prerequisites for the current paper desk. The read-only quote service uses Base's public RPC by default; configure `BASE_RPC_URL` for an appropriate production provider. Configure `NEXT_PUBLIC_APP_URL` for deployment metadata. Do not expose provider credentials through public environment variables.

The old client routes—including `/desk`, `/marketplace`, `/demo`, `/profile`, `/dashboard`, `/list-your-broker`, broker profiles and the old admin pages—redirect to `/`. `/desk-study` and `/widget-probe` are development-only references, absent from client navigation and unavailable in production.

Public marketplace APIs (`/api/agents` and descendants, `/api/ratings`, `/api/sdk/register`) return **410 Gone** through the routing layer. Directory seeding, public broker submission and onboarding analytics are not setup steps or product milestones. No database rows were deleted by this cutover.

## Code organization

| Responsibility | Source |
|---|---|
| House identity, desk sequence and capability labels | `lib/house.ts` |
| Period desk notes and words of the house (one note or term of the day, never advice) | `lib/desk-notes.ts` |
| Sourced education catalog, broker examination methods, delayed-tape practice | `lib/education/`, `components/desk/EducationTopic.tsx`, `app/practice/delayed-tape/` |
| Root document and desk composition | `app/layout.tsx`, `app/page.tsx`, `components/desk/WorkingDesk.tsx` |
| Intent, estimate and paper-record interaction | `lib/trading/useTradingDesk.ts` |
| Ticket, board, tape and record presentation | `components/desk/TradeTicket.tsx`, `components/desk/PaperLedger.tsx`, `components/desk/DeskBoard.tsx`, `components/desk/TickerTape.tsx`, `components/desk/PaperHistory.tsx` |
| House mark and desk instrument | `components/desk/HouseMark.tsx`, `components/desk/DeskInstrument.tsx`, `lib/desk-instrument.ts` |
| Explicit units and canonical catalog | `lib/trading/domain.ts`, `lib/trading/catalog.ts`, `lib/tokenized-stocks.ts` |
| Read-only estimate service and RPC integration | `lib/trading/quotes.ts`, `lib/trading/aerodrome.ts` |
| Thin HTTP boundary | `lib/trading/http.ts`, `lib/api-client.ts`, `app/api/stocks/quote/route.ts`, `app/api/stocks/marks/route.ts` |
| Indicative tape marks (Chainlink reference, never offers) | `lib/trading/marks.ts`, `lib/trading/marks-shared.ts`, `lib/trading/useReferenceMarks.ts` |
| Shared draft/review transitions and local persistence | `lib/trading/workflow.ts`, `lib/trading/paper-records.ts` |
| Live execution journal (approvals, submitted/confirmed swaps) | `lib/trading/live-journal.ts`, `lib/trading/useLiveJournal.ts`, `lib/trading/useDeskExecution.ts` |
| Delight: spoken-line caption, since-last-visit tray deltas, ledger export | `lib/trading/tray-deltas.ts`, `lib/trading/ledger-export.ts` (wired in `WorkingDesk.tsx`, `DeskBoard.tsx`, `TradeTicket.tsx`, `PaperLedger.tsx`) |
| Optional account, paper backup, transcript write | `components/auth/AuthProvider.tsx`, `lib/auth.ts`, `lib/trading/usePaperSync.ts`, `app/api/paper/route.ts`, `app/api/hetty/transcript/route.ts` |
| Voice session | `components/desk/HettyCall.tsx`, `lib/trading/voice-tools.ts`, `lib/desk-notes.ts`, `lib/education/`, `app/api/hetty/session/route.ts` |
| Eligibility check (source only; not a paper-desk surface) | `lib/eligibility.ts`, `app/api/eligibility/route.ts` |
| Shareable paper-intent links | `lib/share.ts` |

Trading uses decimal strings and integer base units. The service verifies chain, pool/factory, token order, decimals and output at a recent block. Estimates are never called executable orders. Reference observations have explicit freshness and uncertainty labels.

Older voice, billing, registry and webhook modules remain implementation scaffolding, not the client-facing identity system. They are not mounted by the root layout. Arbitrum billing and identity configuration are independent of Base trading. Retained settlement is not a stock execution adapter.

## Verification

- `pnpm test` — domain, quote, paper-record, route-cutover and retained infrastructure tests.
- `pnpm typecheck` — TypeScript verification.
- `pnpm exec next build --webpack` — production compilation without the repository's destructive standalone postbuild cleanup. Deployment packaging is a separate operation.
- `pnpm lint` has an existing ESLint 9 / legacy `.eslintrc.json` configuration mismatch; do not change security or tooling policies to mask failures.
- Current cutover checks use source contracts and HTTP responses, not a browser automation session. Earlier paper-desk browser checks do not establish visual acceptance of every subsequent change.

## Product rules

- The old approach is retired, not a compatibility target. There are no existing-user or collaborator constraints requiring it to remain in the product.
- Preserve useful implementation capabilities selectively; do not preserve the old discovery, onboarding or billing-led experience.
- Give the client one coherent place to work. The first semantic thing is the ticket or the line. Do not list page inventory as the product, and do not make the first broker the house identity.
- Explain permissions and terms at the relevant action rather than build a prerequisite tour or a house-strategy grid.
- Keep paper mode, product identity and material terms clear. Put technical metadata in the relevant details, not the welcome headline. Say paper mode once.
- A provider configuration or historical token listing is not evidence of operational readiness.
- Sign-in, a linked wallet, or a passing eligibility check is not live access.
- Use the existing Next.js/React/TypeScript, ethers, Zod, Tailwind and Three.js stack; do not introduce a framework migration for this cutover.

## Canonical documentation

- [Product Direction](docs/PRODUCT_DIRECTION.md): jobs, principles, and information hierarchy — not page anatomy.
- [Roadmap](ROADMAP.md): current state and next release gates.
- [Auth and access](docs/AUTH_AND_ACCESS.md): capability tiers and what the account scaffold actually does.
- [Architecture](docs/AGENTIC_ARCHITECTURE.md): domain boundaries, integration evidence and retained implementation references.
- [Performance](docs/PERFORMANCE.md): runtime requirements and verification.
- [Deployment](docs/DEPLOYMENT.md) and [Hetzner deployment](docs/HETZNER_DEPLOYMENT.md): infrastructure reference; deploy frontend and API versions together when proxying `/api/*`.
- [Widget architecture](docs/WIDGET_ARCHITECTURE.md), [Redis keys](docs/REDIS_KEYS.md), and [payment security](docs/SECURITY_ARCHITECTURE_COMPARISON.md): retained service references, not the primary client experience.
