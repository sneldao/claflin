# House Funnel Metrics

The event source for docs/FOYER_LINE.md §8 and ROADMAP §1a Phase 5. Baselines first; no targets are set here.

## What is sent

`lib/funnel/client.ts` batches events and posts one beacon to `POST /api/funnel` (5 s after the first event, or on page hide). Every field is an enum or a boolean (`lib/funnel/events.ts`):

| Event | Fields | Emitted from |
|---|---|---|
| `visit_started` | landing: foyer/desk | `useTradingDesk` entry resolution, once per tab |
| `instruction_given` | source: spoken/typed/picked · matched: none/one/several · lead (first only) | `HouseFoyer` — transcript, 1.5 s typing pause, wire pick, or desk entry |
| `mic_blocked` | reason: denied/no_device/unsupported/interrupted/other | `useDictation` via the turret |
| `desk_entered` | desk · via: foyer/link/returning/switch · carried | `useTradingDesk` |
| `estimate_returned` | desk · outcome: quoted/unavailable | `useDeskDocuments.requestQuote`, Jesse quote port + `run()` |
| `record_filed` | desk | Hetty `save`, Jesse `file-paper` |
| `record_retrieved` | desk · via: ledger/last_filing/foyer/link | ledger buttons, last-filing lines, `?record=` entry |
| `example_call_played` | — | `AnnotatedExampleCall` Play (accepted recording only) |
| `offering_dossier_opened` | — | `HouseOfferings` board row expand |
| `gap_explainer_opened` | desk | `HouseFoyer` wire-gap disclosure (live tape, Phase 1) |

The last three are comprehension aids, not journey steps: they are counted and reported separately from the funnel stages, so they never distort the step counts below. `gap_explainer_opened` fires at most once per visit, attributed to the desk that published the mark.

Never sent: instruction text, amounts, instruments, record/quote ids, account ids, wallets. The envelope carries a random per-tab `visit` id (sessionStorage, gone when the tab closes) and `newcomer` (true when the browser holds no `claflin.` storage; the client then writes `claflin.seen.v1 = 1`). `hours` (NYSE open/closed) is stamped server-side from `lib/market-clock.ts`.

Not counted at all: Global Privacy Control, Do Not Track, or `navigator.webdriver` (Playwright, crawlers). The caller's IP is used only for the in-memory abuse budget and is never stored.

## Storage and retention

| Key | Type | TTL | Content |
|---|---|---|---|
| `funnel:counts:{YYYY-MM-DD}` | Hash | 90 days | `event\|dim=value…` → count |
| `funnel:reach:{YYYY-MM-DD}:{step}:{new\|returning}` | HyperLogLog | 90 days | Approximate unique visits reaching a step; ids cannot be read back |

Days are UTC. Steps: visited → instructed → matched → entered → quoted → filed → retrieved. No Redis → the route answers 204 and nothing is kept.

## Reading it

```
pnpm exec tsx --env-file=.env.local scripts/funnel-report.mts --days=7 [--json]
```

There is no HTTP read endpoint. Caveats: `link` entries include reloads of a desk URL; the mic denied rate is `denied / (spoken instructions + mic failures)`; React StrictMode double-fires entry effects in `next dev` only.

---

## Baseline — 2026-10-21 (Phase 0.5)

Run with `pnpm exec tsx --env-file=.env.local scripts/funnel-report.mts --days=7`:

```
Journey — first-time browsers: visited 1 · instructed 0 · matched 0 · entered 1 · quoted 0 · filed 0 · retrieved 0
Journey — returning browsers:  all zero
Instructions: 0 · Landings: desk 1 · Desk entries: jesse:link 2
Comprehension aids: example plays 0 · dossier opens 0 · gap explains none
```

**One visit is not a baseline.** The whole retention window (90 days) holds a single day of data — 2026-10-03, one `visit_started` (landing `desk`) and two `desk_entered` (desk `jesse`, via `link`). The 7-day window is empty, so the figures above and the 90-day figures are the same single visit. The reason is traffic, not instrumentation: the funnel client is present in the deployed `app/page` chunk and the ingest route answers, so a browser visit writes a `funnel:counts` hash.

Because Phase 1's exit gate is a +20% conversion comparison, that comparison cannot be drawn yet. Treat the numbers above as a **floor of one**, not a measurement to improve on. Re-run the report after a week of real traffic and replace this section before making any further funnel-impacting change.

`gap_explainer_opened` has never fired in the wild: the feature shipped in commit `542ff6d` on 2026-10-21, after the last recorded visit.

---

---

## Instrument depth — the Aerodrome pool probe

Utility is capped at 7 quotable instruments (`tests/pool-unlock.test.ts` pins the count). To see what unlocking the 9 blocked Base names would take:

```
pnpm exec tsx scripts/probe-aerodrome-pools.mts            # all blocked names
pnpm exec tsx scripts/probe-aerodrome-pools.mts --symbol=AMZNc
BASE_RPC_URL=https://your-node pnpm exec tsx scripts/probe-aerodrome-pools.mts --json
```

Read-only: it makes only `eth_call`s (decimals, the newest Slipstream CL factory's `getPool`, pool `liquidity`, and a 1-USDC `quoteExactInput` through the desk's own MixedRouteQuoterV3). It never signs, sends, or edits the catalog.

Each instrument gets one of four verdicts (`lib/trading/pool-unlock.ts`):

- **UNLOCKABLE (data only)** — decimals resolve and a USDC pool routes through the desk quoter. The script prints a paste-ready `VenuePair`; a human still fills TVL, re-checks the issuer list, and sets `availability: 'quote_candidate'`.
- **POOL FOUND, NOT ROUTABLE** — a USDC pool exists but the quoter won't route it (another factory/venue). Needs an adapter, not a catalog edit.
- **NO USDC POOL** — liquidity is elsewhere (Uniswap, a v2 pool). Needs an adapter.
- **BLOCKED** — `decimals()` unreadable; verify the contract against the issuer list first.

Type-check the scripts with `pnpm exec tsc -p tsconfig.scripts.json` (the app `typecheck` covers `.ts`, not `.mts`).
