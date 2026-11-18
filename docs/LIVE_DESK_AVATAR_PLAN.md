# Live Desk Avatar Plan — Stocks Maxxing

> **Status:** Phase A landed (`72552fc`, 2026-11-17); Phase B in progress —
> the LiveKit token route is minted and tested, host publish next.
> This doc tracks the experiment; checkboxes are the source of truth for
> progress.
> Phases A–C here are sprint-local to this experiment (unrelated to the
> desk-slip stages in [DESK_SLIPS.md](DESK_SLIPS.md) or Halley's slip UX phases).

Deadline: **Dec 5** (Stocks Maxxing submission close).
Judging: 50% traction verified onchain · 25% product · 25% build in public.
Launch partner: **Feel.cash** ($10k partner prizes stack with the track prize).

## The bet

Paper trading has no stakes and hasn't landed. The experiment: a real coin
on Feel.cash (paired against a tokenized stock on Base), plus the thing no
one else ships — **an AI broker with a body, live in the room, who drives
what's on screen**: camera moves, board highlights, premium-vs-stock
visuals fired by the same client tools that already run the desk.

The stream is the community primitive, not marketing. The room has market
hours; when the desk closes it's gone — ephemeral by design, no VOD, no
media servers.

Track: **Meme and Community Economies** (Feel.cash is a partner there).
Secondary option: Agentic Stock Finance if the broadcast agent does
something genuinely novel — do not split focus.

## Architecture (target)

```
Host browser (broadcast session)
  ├─ ElevenLabs ConvAI session (existing /api/hetty/session pattern)
  ├─ VRM avatar in night-desk-scene.ts, lip-synced client-side
  ├─ scene-drive client tools → NightDeskSceneController
  └─ LiveKit publish: voice audio track + data channel (scene state)

LiveKit Cloud room (ephemeral, "market hours" only)
  └─ Observer browsers: subscribe audio + data channel,
     render the SAME scene locally — stream state, not video
```

Key principle: **don't stream video of the room — stream the room's
state.** Every observer's browser renders the scene; only the broker's
voice is real media. Cheap egress, the room is real for everyone.

Upgrade path preserved: a photoreal avatar (Anam/Simli, audio-passthrough
mode) can later join the same LiveKit room as a participant — no
re-architecture.

## Phase 0 — Coin & contest setup

- [ ] Check the live Feel.cash launch form: which stock pairings are
      actually available **on Base** (AAPLc, NVDAc, AMZNc confirmed in
      docs; GME appears Robinhood Chain only — verify)
- [ ] Pick the stock on community meme-energy, not fundamentals
- [ ] Launch the coin on Feel.cash (choose pairing, Trade Feeling curve,
      opening FDV ~$10k, dev buy decision) — **gated on Phase A avatar**
- [ ] Apply to Stocks Maxxing selecting Feel.cash as launch partner
- [ ] Decide marathon rules: desk hours, holder-count milestones
      ("every N holders keeps the desk open another hour")

## Spike S1 — Agent audio out of the host browser ✅ RESOLVED

Verified against `@elevenlabs/react@1.19.1` / `@elevenlabs/client@1.30.0`
in node_modules:

- [x] `connectionType: "webrtc"` is a supported session config option —
      the ConvAI session then runs over a `livekit-client` `Room`
      (`utils/WebRTCConnection`, `getRoom(): Room` is public)
- [x] The agent's voice arrives as a `RemoteAudioTrack`; its
      `mediaStreamTrack` can be republished into our own LiveKit room —
      **no decode/re-encode, no tab capture, no TTS re-synthesis**
- [x] `onConversationCreated` lifecycle callback yields the
      `Conversation`; `connection` is `protected` (compile-time only) —
      reachable at runtime, note as off-label API use in code comments
- [x] Bonus: `onAudioAlignment` / `onAudioAlignmentPlayback` callbacks
      expose character-alignment timing — the lip-sync source for the
      VRM avatar, relayable over our data channel to observers
- [x] `useConversation` does NOT expose the room or a MediaStream —
      `getOutputVolume`/frequency data only. WebRTC mode is required.

Implication: **ElevenLabs is already our transport.** We forward the
agent's track rather than reconstruct audio. Phase B host publish is
`localParticipant.publishTrack(agentMediaStreamTrack)` — the cheapest
possible fan-out.

Session route note: the existing `/api/*/session` routes issue tokens
for the websocket path — check whether the webrtc path needs a
different token type (conversation token) when wiring the broadcast
session.

## Phase A — The broker gets a body

In-scene VRM avatar (not a photoreal overlay): Deco-stylized, fits the
house, $0/min, and can *walk to the evidence board* — a video head can't.

- [x] Choose VRM model + rig (viseme/ARKit blendshapes required) — Eugenia (Polygonal Mind, CC0, VRM 0.x) at `public/avatars/hetty.vrm`
- [x] Integrate `@pixiv/three-vrm` into
      `lib/night-desk-scene.ts` — avatar placed at the desk (dynamic import, payload budget untouched)
- [x] Lip sync: `onAudioAlignmentPlayback` timing → viseme map on the VRM
      blendshapes (`lib/desk/avatar-mouth.ts` + `lib/night-desk-avatar.ts`); volume fallback via `getOutputVolume`
- [x] Idle/talk gesture set; avatar anchor point added to scene anchors
- [x] New client tools on Hetty's broadcast session, following the
      `useConversationClientTool` pattern in
      `components/desk/HettyCallSession.tsx`:
      - [x] `move_to(view)` → `controller.setView()`
      - [x] `walk_room(progress)` → `controller.setTour()`
      - [x] `show_premium()` → premium-vs-stock chart focus + readout
      - [x] `highlight_mark(symbol)` → board/lamp aim at a pinned mark
- [x] Broker prompt update: commentary persona, **reads the market,
      never advises** — no "buy" language, consistent with existing
      voice-can't-sign policy (`scripts/hetty-agent-config.mjs`)

## Phase B — The house goes live

- [ ] LiveKit Cloud account + room model (ephemeral rooms, pay per
      participant-minute)
- [x] `app/api/hetty/livekit-token` — issue observer/publisher tokens,
      mirroring the existing `session` routes (keys server-side)
      - `{ role: "host" }` → fresh `hetty-<uuid>` room, publish + data
      - `{ role: "observer", room }` → that room, **subscribe-only in the
        signed grant** (a modified observer page still can't publish)
      - missing role is an observer; an unknown role is 400, never publish
      - host rooms are always freshly minted, so a stale link can't be
        revived into a live microphone
      - awaits `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`;
        documented in `.env.local.example`, 503 while unset
- [ ] Host mode: start ConvAI with `connectionType: "webrtc"`, reach
      `connection.getRoom()`, republish the agent's
      `RemoteAudioTrack.mediaStreamTrack` into our LiveKit room +
      data channel messages for scene state (view, tour progress,
      stage, transcript lines, premium value, audio alignment)
- [ ] Observer mode: join room, subscribe audio, apply data-channel
      state to a locally-rendered scene; read-only — no client tools
- [ ] "The desk is open" presence: house lamp/live indicator on `/`,
      desk-hours schedule surfaced in the foyer
- [ ] Session limits: max session length, observer cap, graceful close

## Phase C — Marathon event & build-in-public

- [ ] Launch-day marathon: one 6–12h "the desk is open" window around
      the coin's first day — concentrates volume, holders, presence
- [ ] Onchain milestones drive the broadcast (holder count, premium
      thresholds trigger broker call-outs)
- [ ] Optional: OBS on the host browser → X/Twitch restream
      (separate decision, no infra dependency)
- [ ] Dated build-in-public posts on X **and Farcaster** (Base judges
      live on Farcaster) — desk hours announcements, progress clips,
      marathon recap; $6k build-in-public prize is a parallel goal
- [ ] Submission write-up for the track

## Safety & boundaries

- Broker commentates, never advises. Prompt-injection from live chat
  is assumed — chat input is rate-limited, sanitized, never reaches
  tool calls unfiltered.
- Voice cannot sign, submit, or record — existing tool policy holds.
- No persistent recording: ephemeral rooms, no VOD, nothing to
  moderate after the fact.
- Copy keeps the paper/live distinction discipline the repo already
  enforces — a coin community does not blur what a record is.

## Explicitly out of scope (this sprint)

- Photoreal hosted avatars (HeyGen/Tavus) — session caps (~20 min on
  HeyGen entry tier) and per-minute cost make them wrong for a marathon;
  Anam/Simli audio-passthrough remains the upgrade path
- Live-broadcast ports for Jesse / Tennie / Halley — the house stays
  furnished; only Hetty gets a microphone this sprint
- New paper-trading features, Robinhood Chain work, Solana work

## Risks / open questions

| Risk | Mitigation |
| --- | --- |
| ~~ConvAI audio can't be extracted~~ ✅ solved via WebRTC transport (`getRoom()` + track republish) | — |
| Off-label use of `protected` connection breaks in an SDK upgrade | Pin `@elevenlabs/react` version; wrap access in one adapter module |
| Nobody tunes in — visible evidence of no traction | Marathon is the launch event, not an ongoing channel; seed the room before going live |
| Scope creep into Jesse/Tennie before Dec 5 | Out-of-scope list above; revisit after submission |
| LiveKit/observer egress cost if the room fills | Observer caps; state-only sync keeps per-client cost near zero |

## Decision log

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-17 | VRM in-scene over photoreal API avatar | Drives the scene, on-brand, no per-minute cost or session caps |
| 2026-11-17 | LiveKit Cloud state-sync over video fan-out | No media servers; observers render locally; ephemeral rooms |
| 2026-11-18 | Observer tokens are subscribe-only in the signed grant | Read-only enforced server-side; a tampered observer client still cannot publish |
| 2026-11-18 | Missing role defaults to observer, host rooms never reused | Least privilege; a forwarded link cannot carry publish rights or revive a dead mic |
| 2026-11-17 | Coin launch gated on avatar | The differentiator is the broadcast persona; launch without it is just another Feel coin |

## Key references

- Scene controller: `lib/night-desk-scene.ts` (poses, tour, lamp, `setView`/`setTour`/`setStage`)
- Hetty ConvAI session + client tools: `components/desk/HettyCallSession.tsx`
- Shared tool-handler pattern: `lib/jesse/desk-tools.ts`
- Session routes (token-server pattern): `app/api/hetty/session`, `app/api/desk/jesse/session`
- Existing docs: `docs/PRODUCT.md`, `docs/PRODUCT.md`, `docs/DESKS.md`
- Avatar research: gabber.dev VRM+Next.js guide; TalkingHead (Mixamo/ARKit visemes); Anam & Simli audio-passthrough docs; forasoft real-time avatar architecture
- Contest: base.org/stocksmaxxing · docs.feel.cash (launch mechanics, Base pairings)
