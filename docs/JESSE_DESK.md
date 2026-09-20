# Jesse’s Solana desk

**Status:** House foyer on first visit; seated paper desk open when `NEXT_PUBLIC_JESSE_PAPER_ENABLED` is not `false` (default on). Stocklana entry: `/?desk=jesse`. Jesse ConvAI line wired; Room/Compact are presentations of the same controller (`/?desk=jesse&view=room|compact`). **Venue duplex** (Backed/Jupiter stock reference vs Jupiter venue USD) and **PreStocks** duplex on the ticket. Pyth comparison stays honest-unavailable without Pro entitlement + unit basis. **Live settle** (Jupiter order → wallet sign → execute) is implemented but **off by default** — both `NEXT_PUBLIC_JESSE_LIVE_ENABLED=true` and `JESSE_LIVE_ENABLED=true` required. `/night-desk` redirects to Jesse Room view; fixture study at `/night-desk?study=1` (and `/desk-study` in development).

## Product bar

Jesse is a first-class Claflin desk: same room craft as Hetty, real Jupiter Metis paper quotes, explicit v2 paper filing that survives reload, honest market evidence (including unavailable), and an env-gated live Solana settle path that never pretends to be paper.

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
| `claflin.jesse.live.v1.*` (Redis / memory) | Short-lived live proposals (server) |

Legacy `claflin.paper.v1.*` rows are untouched. Account sync is Hetty-only.

## Ports

- Quote: `GET /api/desk/jesse/quote` → Jupiter adapter → `parseJesseEstimate` (optional `JUPITER_API_KEY` for higher rate limits; keyless works)
- Compare (Pyth): `GET /api/desk/jesse/comparison` → returns `unavailable` with reason codes until Pyth Pro + unit basis are verified — never a synthetic number
- Venue duplex (free): `GET /api/desk/jesse/venue-duplex?instrumentId=sol:…` → Backed public `price-data` when present, else Jupiter Price v3 `stockData`, versus Jupiter venue `usdPrice` — evidence only, never labelled Pyth
- PreStocks (secondary): `GET /api/desk/jesse/prestocks` → issuer mark vs tokenPrice duplex; evidence only, not paper-filing
- Live prepare: `POST /api/desk/jesse/live/prepare` → fresh Metis `/order` with `taker` (both live flags required)
- Live submit: `POST /api/desk/jesse/live/submit` → message-bound signed tx → Jupiter `/execute`
- Live status: `GET /api/desk/jesse/live/status?proposalId=…`
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

Missing amounts never inherit. Unknown tickers never resolve to the catalog. Live settle is a separate UI path (wallet sign) — not a voice tool in this release.

## Evidence honesty

- **Pyth panel:** every feed mapping currently has `tokenUnitBasis: null`. The comparison panel shows reason sentences without inventing basis points. Filing does not wait on evidence.
- **Venue duplex:** free Backed/Jupiter reference vs Jupiter venue USD. Reference difference is labelled as a reading, not profit or arbitrage. When Backed `quote` is null, Jupiter `stockData` may stand in with an explicit source label.
- **PreStocks:** SPV issuer mark vs issuer token price — secondary bounty track only.

## Live settle (gated)

Implements build-plan §4.6 slice: prepare → review → `signTransaction` → execute. Defaults **off**.

| Env | Role |
|---|---|
| `NEXT_PUBLIC_JESSE_LIVE_ENABLED=true` | Shows the settle UI; sets `DESK_CAPABILITIES.jesse.live` |
| `JESSE_LIVE_ENABLED=true` | Server accepts prepare/submit/status |

Neither flag alone enables real funds. Demo limits: **25 USDC** buy / **0.1** scaled sell. Paper filing stays separate. Execute timeout → `unknown` — reconcile the same signature; do not resign a different order. UI: [`JesseLiveSettle`](../components/desk/JesseLiveSettle.tsx). Wallet: Phantom/Solflare-shaped browser port ([`lib/solana/wallet.ts`](../lib/solana/wallet.ts)).

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

## Known limits

- No Jesse mark adapter / tape
- Pyth Pro duplex awaits entitlement / unit basis; comparison stays honest-unavailable
- Venue duplex is free evidence, not Pyth Pro quality or an exchange print
- PreStocks is evidence-only — not filed as xStock paper
- Live settle requires both flags; instruction-allowlist / wallet challenge auth from the full R2 plan are not yet complete
- Hearable Solana-native phrases on the Jesse lead (quote / correct / compare / refuse)
- Account call-transcript sync stays Hetty-only
- Stocklana judges should open `/?desk=jesse` — see [STOCKLANA_SUBMISSION.md](STOCKLANA_SUBMISSION.md)

## Flags

```bash
# Close Jesse’s seated desk
NEXT_PUBLIC_JESSE_PAPER_ENABLED=false

# Enable live Jupiter settle (both required)
NEXT_PUBLIC_JESSE_LIVE_ENABLED=true
JESSE_LIVE_ENABLED=true
```
