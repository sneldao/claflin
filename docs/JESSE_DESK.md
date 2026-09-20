# Jesse’s Solana desk

**Status:** House foyer on first visit; seated paper desk open when `NEXT_PUBLIC_JESSE_PAPER_ENABLED` is not `false` (default on). Stocklana entry: `/?desk=jesse`. Jesse ConvAI line wired; Room/Compact are live presentations of the same controller (`/?desk=jesse&view=room|compact`). PreStocks duplex on the ticket review path. Pyth comparison stays honest-unavailable without Pro entitlement. `/night-desk` redirects to live Jesse Room view; fixture study at `/night-desk?study=1` (and `/desk-study` in development).

## Product bar

Jesse is a first-class Claflin desk: same room craft as Hetty, real Jupiter Metis paper quotes, explicit v2 paper filing that survives reload, honest market evidence (including unavailable). No live Solana execution in this release.

## House model

```text
Foyer → choose desk (Hetty / Jesse / …)
         └─ one controller per desk
              ├─ view=compact → seated composition
              └─ view=room  → NightDeskScene + HTML work overlays
```

Desk chooses broker + market. Room and Compact are presentations of the same work — never remount finance, never invent quotes.

## Entry

- Fresh visit → Claflin foyer (house wordmark + open-desk doors). Choose Jesse or Hetty.
- Deep link: `/?desk=jesse` (Stocklana submission URL) or `/?desk=hetty`
- Presentation: `?view=room` or `?view=compact` (per-desk preference in `claflin.presentation.v1.<deskId>`)
- Canonical Room view: `/?desk=jesse&view=room` (also reached via `/night-desk`)
- Last open desk remembered in `claflin.desk.v1.last`
- House directory → switch desks without losing parked work
- Surface: [`components/desk/JesseDeskSurface.tsx`](../components/desk/JesseDeskSurface.tsx)
- Authority: [`createJesseController`](../lib/solana/controller.ts) via [`useJesseDesk`](../lib/solana/useJesseDesk.ts)
- Hetty’s Base documents never load for Jesse (`usesLegacyDeskDocuments` in [`lib/house.ts`](../lib/house.ts))
- Submission pack: [`docs/STOCKLANA_SUBMISSION.md`](STOCKLANA_SUBMISSION.md)

## Storage keys

| Key | Purpose |
|---|---|
| `claflin.paper.v2.jesse.*` | Filed paper records |
| `claflin.draft.v2.jesse` | Draft checkpoint |
| `claflin.watched.v2.jesse` | Explicit watches |
| `claflin.presentation.v1.jesse` | Room/compact view preference |

Legacy `claflin.paper.v1.*` rows are untouched. Account sync is Hetty-only.

## Ports

- Quote: `GET /api/desk/jesse/quote` → Jupiter adapter → `parseJesseEstimate` (optional `JUPITER_API_KEY` for higher rate limits; keyless works)
- Compare (xStock): `GET /api/desk/jesse/comparison` → returns `unavailable` with reason codes until Pyth Pro + unit basis are verified — never a synthetic number
- PreStocks (secondary): `GET /api/desk/jesse/prestocks` → issuer mark vs tokenPrice duplex; evidence only, not paper-filing
- Voice token: `POST /api/desk/jesse/voice/token` → AssemblyAI short-lived token, or 503 when unconfigured
- Voice session: `POST /api/desk/jesse/session` → ElevenLabs ConvAI signed URL

## View

Room / Compact is a preference only (`claflin.presentation.v1.jesse`). Toggle on the desk or use `?view=room|compact` (legacy `night|direct` still accepted). Room mounts the approved 3D scene with the same ticket, line, and ledger as Compact — scene focus never authorizes money. Switching never remounts the controller, re-quotes, or resets the draft. `/night-desk` redirects to Room view; `?study=1` keeps the fixture study.

## Command grammar

Typed bar and speech parser: [`lib/jesse/speech.ts`](../lib/jesse/speech.ts). Examples:

- `buy 100 USDC of Apple`
- `compare NVIDIA`
- `file this paper record`
- `cancel`

Missing amounts never inherit. Unknown tickers never resolve to the catalog.

## Evidence honesty

Every feed mapping currently has `tokenUnitBasis: null`. The comparison panel shows reason sentences (e.g. unverified unit basis) without inventing basis points. Filing does not wait on evidence.

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

## Known limits

- No Jesse mark adapter / tape
- Pyth Pro duplex awaits entitlement / unit basis; comparison stays honest-unavailable
- PreStocks is evidence-only (issuer mark vs tokenPrice) — shown on the ticket review path, not filed as xStock paper
- Hearable Solana-native phrases on the Jesse lead (quote / correct / compare / refuse)
- No R2 live wallet path
- Full 3D NightDeskScene is not yet the night presentation renderer (seated atmosphere + toggle first)
- Account call-transcript sync stays Hetty-only
- Stocklana judges should open `/?desk=jesse` — see [STOCKLANA_SUBMISSION.md](STOCKLANA_SUBMISSION.md)

## Flags

```bash
# Close Jesse’s seated desk
NEXT_PUBLIC_JESSE_PAPER_ENABLED=false
```
