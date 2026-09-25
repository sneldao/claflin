# Jesse’s Solana desk

**Status:** House foyer and offering book on first visit; Jesse opens through an eligible Backed xStock offering or the direct `/?desk=jesse` deep link. Seated paper desk open when `NEXT_PUBLIC_JESSE_PAPER_ENABLED` is not `false` (default on). Stocklana entry: `/?desk=jesse&view=room`; offering-aware entry may include `?offering=<solanaOfferingId>`. Jesse ConvAI line wired; Room/Compact are presentations of the same controller (`/?desk=jesse&view=room|compact`). **Pyth Pro** equity-versus-xStock evidence (raw-token basis verified 2026-09-21; Lazer→file daemon, see `lib/solana/market/snapshot-file.ts`). **Venue duplex** and **PreStocks** remain as free/secondary evidence. **Live settle** (Jupiter order → wallet sign → execute) opens when both `NEXT_PUBLIC_JESSE_LIVE_ENABLED=true` and `JESSE_LIVE_ENABLED=true` are set; the ticket defaults to paper with an explicit live toggle. `/night-desk` redirects to Jesse Room view; fixture study at `/night-desk?study=1` (and `/desk-study` in development).

## Product bar

Jesse is a first-class Claflin desk: same room craft as Hetty, real Jupiter Metis paper quotes, explicit v2 paper filing that survives reload, honest market evidence (including unavailable), and an env-gated live Solana settle path that never pretends to be paper.

## House model

```text
Foyer → visitor instruction → concrete offering
         └─ eligible desk (Jesse for Backed xStocks / Solana)
              └─ one controller per desk
                   ├─ view=compact → seated composition
                   └─ view=room  → NightDeskScene + HTML work overlays
```

The offering chooses the concrete product/mandate/rail/venue. Desk eligibility comes from catalog coverage; Room and Compact are presentations of the same work — never remount finance, never invent quotes.

## Entry

- Fresh visit → Claflin foyer and house book. An instruction resolves to concrete offerings; a Jesse-covered Backed xStock offering can then open Jesse.
- Deep link: `/?desk=jesse&view=room` (Stocklana submission URL) or `/?desk=jesse` / `/?desk=hetty`. A deep link remains valid without an offering.
- Offering context: `/?desk=jesse&offering=<solanaOfferingId>` preselects that instrument through Jesse's controller only when the catalog offering explicitly covers Jesse; mismatched offering parameters are removed.
- Presentation: `?view=room` or `?view=compact` (per-desk preference in `claflin.presentation.v1.<deskId>`)
- Canonical Room view: `/?desk=jesse&view=room` (also reached via `/night-desk`)
- Last open desk remembered in `claflin.desk.v1.last`
- House directory → switch desks without losing parked work
- Surface: [`components/desk/JesseDeskSurface.tsx`](../components/desk/JesseDeskSurface.tsx)
- Authority: [`createJesseController`](../lib/solana/controller.ts) via [`useJesseDesk`](../lib/solana/useJesseDesk.ts)
- Hetty’s Base documents never load for Jesse (`usesLegacyDeskDocuments` in [`lib/desk/registry.ts`](../lib/desk/registry.ts))
- Submission pack: [`docs/STOCKLANA_SUBMISSION.md`](STOCKLANA_SUBMISSION.md)

## Storage keys

| Key | Purpose |
|---|---|
| `claflin.paper.v2.jesse.*` | Filed paper records |
| `claflin.draft.v2.jesse` | Draft checkpoint |
| `claflin.watched.v2.jesse` | Explicit watches |
| `claflin.presentation.v1.jesse` | Room/compact view preference |
| `claflin.jesse.live.v1.*` (Redis / memory) | Short-lived live proposals (server) |

Legacy `claflin.paper.v1.*` rows are untouched. Account sync is Hetty-only.

## Ports

- Quote: `GET /api/desk/jesse/quote` → Jesse runtime coverage → Jupiter adapter → `parseJesseEstimate` (optional `JUPITER_API_KEY` for higher rate limits; keyless works)
- Compare (Pyth Pro): `GET /api/desk/jesse/comparison?instrumentId=sol:…` → snapshots from the Lazer daemon's host-local file (`PYTH_SNAPSHOT_FILE`, default `/opt/claflin/state/pyth-snapshots.json`); normalizes raw-token prices by mint multiplier; honest `unavailable` when feeds/multiplier missing
- Venue duplex (free): `GET /api/desk/jesse/venue-duplex?instrumentId=sol:…` → Backed public `price-data` when present, else Jupiter Price v3 `stockData`, versus Jupiter venue `usdPrice` — evidence only, never labelled Pyth
- Marks: `GET /api/desk/jesse/marks` → Jesse mark adapter ([`lib/trading/adapters/jupiter-marks.ts`](../lib/trading/adapters/jupiter-marks.ts)) → observed marks built from the same venue-duplex read; the venue leg is the mark and a comparable issuer/stock reference rides along as `stockReference` with `differenceBps`. Feeds the desk tape, the foyer wire, Jesse's broker take and the ticket's onchain-versus-reference gap strip, so those surfaces cannot disagree with the evidence panel
- PreStocks (secondary): `GET /api/desk/jesse/prestocks` → issuer mark vs tokenPrice duplex; evidence only, not paper-filing
- Live prepare: `POST /api/desk/jesse/live/prepare` → fresh Metis `/order` with `taker` (both live flags required)
- Live submit: `POST /api/desk/jesse/live/submit` → message-bound signed tx → Jupiter `/execute`
- Live status: `GET /api/desk/jesse/live/status?proposalId=…`
- Voice token: `POST /api/desk/jesse/voice/token` → AssemblyAI short-lived token, or 503 when unconfigured
- Voice session: `POST /api/desk/jesse/session` → ElevenLabs ConvAI signed URL

## View

Room / Compact is a preference only (`claflin.presentation.v1.jesse`). Toggle on the desk or use `?view=room|compact` (legacy `night|direct` still accepted). Room mounts the approved 3D scene with the same ticket, line, and ledger as Compact — scene focus never authorizes money. Switching never remounts the controller, re-quotes, or resets the draft. `/night-desk` redirects to Room view; `?study=1` keeps the fixture study. The room reacts to the work: fresh tape readings warm the lamp (shared scene `tape` channel), and filing lands a stamp ceremony — slam, thud, sheen, staggered receipt — with the just-filed ledger line dropping in 450ms later. No second motion library; CSS + the existing synth in [`lib/sounds.ts`](../lib/sounds.ts) only.

## Command grammar

Typed bar and speech parser: [`lib/jesse/speech.ts`](../lib/jesse/speech.ts). Examples:

- `buy 100 USDC of Apple`
- `compare NVIDIA`
- `file this paper record`
- `cancel`

Missing amounts never inherit. Unknown tickers never resolve to the catalog. Live settle is a separate UI path (wallet sign) — not a voice tool in this release.

## Evidence honesty

- **Pyth panel:** equity vs xStock from Pro/Lazer snapshots. Token basis is `usd-per-raw-token` (verified 2026-09-21). Filing does not wait on evidence. Quiet Pyth Pro credit on the panel.
- **Venue duplex:** free Backed/Jupiter reference vs Jupiter venue USD when Pyth snapshots are cold. The same read backs the `marks` adapter, so the tape, broker take and gap strip share one number with the evidence panel.
- **PreStocks:** SPV issuer mark vs issuer token price — secondary bounty track only.

## Live settle (gated)

Implements build-plan §4.6 slice: prepare → review → `signTransaction` → execute. Defaults **off**.

| Env | Role |
|---|---|
| `NEXT_PUBLIC_JESSE_LIVE_ENABLED=true` | Shows the settle UI; sets `DESK_CAPABILITIES.jesse.live` |
| `JESSE_LIVE_ENABLED=true` | Server accepts prepare/submit/status |

Neither flag alone enables real funds. Per-order limits: **250 USDC** buy / **10** scaled sell. Paper filing stays the default option alongside live. Execute timeout → `unknown` — reconcile the same signature; do not resign a different order. UI: paper/live toggle on [`JesseTicket`](../components/desk/JesseTicket.tsx) + [`JesseLiveSettle`](../components/desk/JesseLiveSettle.tsx). Wallet: Phantom/Solflare-shaped browser port ([`lib/solana/wallet.ts`](../lib/solana/wallet.ts)). Capability probe: `GET /api/desk/jesse/live/status` (no `proposalId`).

```bash
NEXT_PUBLIC_JESSE_LIVE_ENABLED=true
JESSE_LIVE_ENABLED=true
```

## Voice agent

Provisioned like Hetty — separate ElevenLabs ConvAI agent, Solana/xStock prompt, client tools executing against `applyJesseCommand` in the browser:

```bash
node --env-file=.env.local scripts/create-jesse-agent.mjs   # once
node --env-file=.env.local scripts/update-jesse-agent.mjs   # prompt/tools refresh
```

| Env | Purpose |
|---|---|
| `ELEVENLABS_AGENT_JESSE` | ConvAI agent id (never shipped to the browser) |
| `ELEVENLABS_VOICE_JESSE` | Brian (`nPczCjzI2devNBz1zQrb`) — TTS + agent voice; distinct from Hetty’s Rachel |

Session mint: `POST /api/desk/jesse/session`. Call surface: [`JesseCall`](../components/desk/JesseCall.tsx) — lift the receiver or press `H`. `DESK_CAPABILITIES.jesse.voice` is `elevenlabs-convai` when paper is open. AssemblyAI dictation/`/api/desk/jesse/voice/token` remains for the Stocklana streaming path.

Jesse has a second carrier too: `JesseCallAssemblyAI` runs the same prompt and client tools on AssemblyAI's Voice Agent API (see [ASSEMBLYAI_VOICE_AGENT.md](ASSEMBLYAI_VOICE_AGENT.md); `?line=` per visit, `NEXT_PUBLIC_JESSE_VOICE` per deployment). On an unpinned visit, a carrier that cannot open the line hands the pending ring to the other once — establishment failures only, never mid-call or mic denial; a pinned `?line=` never swaps.

## Known limits

- Venue-duplex-derived marks feed the same tape/wire/take/gap-strip as the evidence panel (adapter in `lib/trading/adapters/jupiter-marks.ts`)
- Pyth numerical compare needs the Lazer daemon writing the snapshot file (`PYTH_PRO_API_KEY`) — without snapshots the panel stays honest-unavailable
- Venue duplex is free evidence, not Pyth Pro quality or an exchange print
- PreStocks is evidence-only — not filed as xStock paper
- Live settle requires both flags; instruction-allowlist / wallet challenge auth from the full R2 plan are not yet complete
- Hearable Solana-native phrases on the Jesse lead (quote / correct / compare / refuse)
- Account call-transcript sync stays Hetty-only
- Stocklana judges should open `/?desk=jesse&view=room` — see [STOCKLANA_SUBMISSION.md](STOCKLANA_SUBMISSION.md)

## Flags

```bash
# Close Jesse’s seated desk
NEXT_PUBLIC_JESSE_PAPER_ENABLED=false

# Enable live Jupiter settle (both required)
NEXT_PUBLIC_JESSE_LIVE_ENABLED=true
JESSE_LIVE_ENABLED=true

# Pyth Pro Lazer daemon (server)
PYTH_PRO_API_KEY=
```
