# Jesse’s Solana desk

**Status:** Seated paper desk open when `NEXT_PUBLIC_JESSE_PAPER_ENABLED` is not `false` (default on). Homepage remains Hetty. Night Desk stays a labelled study until bound as a presentation mode.

## Product bar

Jesse is a first-class Claflin desk: same room craft as Hetty, real Jupiter Metis paper quotes, explicit v2 paper filing that survives reload, honest market evidence (including unavailable). No live Solana execution in this release.

## Entry

- House directory → **Jesse Livermore** (`switchDesk('jesse')`)
- Surface: [`components/desk/JesseDeskSurface.tsx`](../components/desk/JesseDeskSurface.tsx)
- Authority: [`createJesseController`](../lib/solana/controller.ts) via [`useJesseDesk`](../lib/solana/useJesseDesk.ts)
- Hetty’s Base documents never load for Jesse (`usesLegacyDeskDocuments` in [`lib/house.ts`](../lib/house.ts))

## Storage keys

| Key | Purpose |
|---|---|
| `claflin.paper.v2.jesse.*` | Filed paper records |
| `claflin.draft.v2.jesse` | Draft checkpoint |
| `claflin.watched.v2.jesse` | Explicit watches |
| `claflin.presentation.v1.jesse` | Night/direct preference |

Legacy `claflin.paper.v1.*` rows are untouched. Account sync is Hetty-only.

## Ports

- Quote: `GET /api/desk/jesse/quote` → Jupiter adapter → `parseJesseEstimate`
- Compare: `GET /api/desk/jesse/comparison` → returns `unavailable` with reason codes until Pyth Pro + unit basis are verified — never a synthetic number
- Voice token: `POST /api/desk/jesse/voice/token` → AssemblyAI short-lived token, or 503 when unconfigured

## Command grammar

Typed bar and speech parser: [`lib/jesse/speech.ts`](../lib/jesse/speech.ts). Examples:

- `buy 100 USDC of Apple`
- `compare NVIDIA`
- `file this paper record`
- `cancel`

Missing amounts never inherit. Unknown tickers never resolve to the catalog.

## Evidence honesty

Every feed mapping currently has `tokenUnitBasis: null`. The comparison panel shows reason sentences (e.g. unverified unit basis) without inventing basis points. Filing does not wait on evidence.

## Known limits

- No Jesse mark adapter / tape
- Conversational AssemblyAI streaming UI is scaffolded; full duplex session + Jesse TTS voice id still to provision (`DESK_CAPABILITIES.jesse.voice` stays `null` until a real session works)
- No PreStocks, no R2 live wallet path
- Night Desk not yet bound to this controller

## Flags

```bash
# Close Jesse’s seated desk
NEXT_PUBLIC_JESSE_PAPER_ENABLED=false
```
