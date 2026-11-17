# Claflin documentation index

**Consolidated 2026-11-17.** Thirty-four documents merged into ten; superseded
files were deleted with their full text preserved in git history. One doc owns
each concern — if you are about to add a new doc, extend one of these instead.

## Living docs

| Doc | Owns |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Product direction and principles, desk canon (identity), eligibility & venue compliance policy, auth & access model, desk slips, house artefacts |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, error resilience & CORS, retained legacy references (voice widget, call-billing security), removed infrastructure |
| [DESKS.md](DESKS.md) | Per-desk mechanics: Jesse (Solana/xStocks) and his market evidence, Halley (Meteora launch desk); pointers for Hetty and Tennie |
| [VOICE.md](VOICE.md) | The voice stack: AssemblyAI dictation (input), ElevenLabs ConvAI lines (output), AssemblyAI Voice Agent alternative, tool-safety boundaries |
| [UX.md](UX.md) | UX improvement plan, foyer anatomy ("the foyer is the line"), funnel metrics |
| [OPERATIONS.md](OPERATIONS.md) | Deployment (Vercel + Hetzner), Redis keys, performance and room-view motion budget |
| [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md) | Dated integration/release validation records |
| [LIVE_DESK_AVATAR_PLAN.md](LIVE_DESK_AVATAR_PLAN.md) | Active sprint: Stocks Maxxing — VRM broker avatar, LiveKit state-sync broadcast. Its **Phases A–C** are sprint-local, unrelated to desk-slip stages |
| [HISTORY.md](HISTORY.md) | Digest of closed hackathon/submission packs (Stocklana, AssemblyAI, World's Fair, Base Quest, live-Base sprint), the critical evaluation, and removed infrastructure |

## Phase/stage naming

- **Phases A–C** — sprint-local to [LIVE_DESK_AVATAR_PLAN.md](LIVE_DESK_AVATAR_PLAN.md) only.
- **Stages 1–4** — desk-slip delivery sequence in [PRODUCT.md](PRODUCT.md) only.
- Halley slip UX **Phases 1–5** — landed 2026-10, recorded in [DESKS.md](DESKS.md).

## Root documents

- `README.md` — product overview, code organization table
- `ROADMAP.md` — sequenced plan and dated release record
- `AGENTS.md` / `CLAUDE.md` — agent rules (Next.js version notice)
