# Claflin — your trading desk

**A voice-first trading product expressed as a Deco-futurist brokerage house.** Clients express an intent, understand the product and terms, authorize a decision, and verify the result. Voice, research, publications and personalization support that job.

Hetty / Base comes first, followed by Jesse Livermore / Solana, Isabel Benham / Robinhood Chain, and then an Arbitrum desk. These are curated AI characters and mandates, not an open marketplace or a claim of current live execution.

## One front door

`/` is Hetty's desk. No welcome wizard, directory, personality questionnaire, free-call funnel, automatic microphone request, wallet bootstrapping, ratings or streaks precede the work.

The current release supports **paper trading with live venue estimates**:

1. Choose a Coinbase tokenized stock on Base.
2. Specify a USDC spend to buy, or a token quantity to sell.
3. Review a verified, time-limited estimate.
4. Edit, refresh, cancel, or explicitly record a paper trade.
5. Return to the browser-local record or use it as a new draft.

No stock or amount is preselected. Paper records are simulations, not wallet positions or call receipts. They are visible to anyone using that browser profile, do not sync to an account, and can be explicitly deleted.

**Voice boundary:** optional browser dictation or a typed instruction updates the same draft. It is not a live Hetty conversation and never authorizes a trade. The structured broker-tool bridge remains unimplemented.

**Live execution boundary:** there is no transaction construction, signing or submission in the desk. Account eligibility, funding, allowances, router compatibility and outcome reconciliation remain release gates. Paper trading does not establish eligibility for the live products.

## Local development

```bash
pnpm install
pnpm dev
```

Open `/`. Wallet, ElevenLabs and Redis setup are not prerequisites for the current paper desk. The read-only quote service uses Base's public RPC by default; configure `BASE_RPC_URL` for an appropriate production provider. Configure `NEXT_PUBLIC_APP_URL` for deployment metadata. Do not expose provider credentials through public environment variables.

The old client routes—including `/desk`, `/marketplace`, `/demo`, `/profile`, `/dashboard`, `/list-your-broker`, broker profiles and the old admin pages—redirect to `/`. `/desk-study` and `/widget-probe` are development-only references, absent from client navigation and unavailable in production.

Public marketplace APIs (`/api/agents` and descendants, `/api/ratings`, `/api/sdk/register`) return **410 Gone** through the routing layer. Directory seeding, public broker submission and onboarding analytics are not setup steps or product milestones. No database rows were deleted by this cutover.

## Code organization

| Responsibility | Source |
|---|---|
| House identity, desk sequence and capability labels | `lib/house.ts` |
| Root document and desk composition | `app/layout.tsx`, `app/page.tsx`, `components/desk/WorkingDesk.tsx` |
| Intent, estimate and paper-record interaction | `lib/trading/useTradingDesk.ts` |
| Ticket and record presentation | `components/desk/TradeTicket.tsx`, `components/desk/PaperHistory.tsx` |
| House mark and optional instrument rendering | `components/desk/HouseMark.tsx`, `components/desk/DeskInstrument.tsx`, `lib/desk-instrument.ts` |
| Explicit units and canonical catalog | `lib/trading/domain.ts`, `lib/trading/catalog.ts`, `lib/tokenized-stocks.ts` |
| Read-only estimate service and RPC integration | `lib/trading/quotes.ts`, `lib/trading/aerodrome.ts` |
| Thin HTTP boundary | `lib/trading/http.ts`, `app/api/stocks/quote/route.ts`, `app/api/stocks/marks/route.ts` |
| Indicative tape marks (Chainlink reference, never offers) | `lib/trading/marks.ts`, `lib/trading/marks-shared.ts`, `components/desk/TickerTape.tsx` |
| Shared draft/review transitions and local persistence | `lib/trading/workflow.ts`, `lib/trading/paper-records.ts` |

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
- Give the client one coherent place to work. Explain permissions and terms at the relevant action rather than build a prerequisite tour.
- Keep paper mode, product identity and material terms clear. Put technical metadata in the relevant details, not the welcome headline.
- A provider configuration or historical token listing is not evidence of operational readiness.
- Use the existing Next.js/React/TypeScript, ethers, Zod, Tailwind and Three.js stack; do not introduce a framework migration for this cutover.

## Canonical documentation

- [Product Direction](docs/PRODUCT_DIRECTION.md): enduring product and design decisions.
- [Roadmap](ROADMAP.md): current state and next release gates.
- [Architecture](docs/AGENTIC_ARCHITECTURE.md): domain boundaries, integration evidence and retained implementation references.
- [Performance](docs/PERFORMANCE.md): runtime requirements and verification.
- [Deployment](docs/DEPLOYMENT.md) and [Hetzner deployment](docs/HETZNER_DEPLOYMENT.md): infrastructure reference; deploy frontend and API versions together when proxying `/api/*`.
- [Widget architecture](docs/WIDGET_ARCHITECTURE.md), [Redis keys](docs/REDIS_KEYS.md), and [payment security](docs/SECURITY_ARCHITECTURE_COMPARISON.md): retained service references, not the primary client experience.
