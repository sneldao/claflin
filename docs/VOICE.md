# Voice in Claflin

**Merged 2026-11-17** from DICTATION and ASSEMBLYAI_VOICE_AGENT (single-source consolidation; full prior text in git history).

Claflin is voice-first: the voice line is how a ticket gets filled, quoted, and spoken back. This is the single document for the voice stack — what hears you, what talks back, and the safety rules that bind both. Desk personas and their division of labour live in [docs/DESKS.md](DESKS.md); the product framing is [docs/PRODUCT.md](PRODUCT.md).

---

## Voice architecture at a glance

| Direction | Engine | How it's reached | Notes |
|---|---|---|---|
| **Input** (hearing you) | AssemblyAI Dictation (Universal-3.5 Pro) | `POST /api/dictation` → `https://dictation.assemblyai.com/v1/transcribe/live` | Disfluency-stripped, auditable transcripts. The default voice input for every desk. |
| **Output** (talking back) | ElevenLabs ConvAI, per desk | `POST /api/hetty/session`, `POST /api/desk/jesse/session`, `POST /api/desk/tennie/session`, `POST /api/desk/halley/session` | The default line for Hetty, Jesse, Tennie and Halley. |
| **Alternative line** (Jesse only) | AssemblyAI Voice Agent API | `NEXT_PUBLIC_JESSE_VOICE=assemblyai` (deployment flag) or `?line=assemblyai` (per visit) | Same prompt, same desk, same ten client tools as the ElevenLabs line. See [AssemblyAI Voice Agent](#assemblyai-voice-agent). |

**The hard boundary, on every line.** Voice is a microphone into the desk, never a hand on the money. Client tools execute in the caller's browser against the desk controller (`useTradingDesk` / `useJesseDesk`); the agent has no wallet and no signing tool on either provider. Voice can **never sign, submit, reconcile, or move funds**. A voice recording is **paper only** — a record of what was heard, not a trade and not an approval. The operational posture is in [docs/OPERATIONS.md](OPERATIONS.md); the desk-by-desk detail is [docs/DESKS.md](DESKS.md).

---

## Dictation

**Dictation is the new keyboard for financial execution.** AssemblyAI's Dictation API is the default voice input engine, creating a clean, auditable trading-ticket flow.

### Dual-engine architecture

Voice input and voice output are decoupled:

```
                  ┌──────────────────────────────────────────────┐
                  │              User Speaks Input               │
                  │  ("Buy 100 USDC of ... umm ... NVDA at mkt") │
                  └──────────────────────┬───────────────────────┘
                                         │ (Raw Audio Stream)
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         AssemblyAI Dictation API             │
                  │       (Universal-3.5 Pro Engine)             │
                  │ • Removes disfluencies ("ums", "ahs")        │
                  │ • High-accuracy stock symbol resolution      │
                  │ • Sub-second synchronous response            │
                  └──────────────────────┬───────────────────────┘
                                         │ (Clean Auditable Transcript)
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │            Structured Trade Intent           │
                  │    { side: 'buy', stock: 'NVDAc', $100 }     │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
   ┌───────────────────────────┐                   ┌───────────────────────────┐
   │       Working Desk        │                   │     ElevenLabs ConvAI     │
   │  Populates Ticket Draft   │                   │    Hetty Spoken Audio     │
   │   & Verified Quotation    │                   │   ("Quoting $100 NVDA")   │
   └───────────────────────────┘                   └───────────────────────────┘
```

- **Input (AssemblyAI Dictation)**: captures voice commands, removes disfluencies, and returns structured, auditable order intents.
- **Output (ElevenLabs)**: delivers the spoken broker persona ("Hetty") and conversational audio confirmation.

### Endpoints & configuration

- **Dictation**: `https://dictation.assemblyai.com/v1/transcribe/live` (multipart: `config` JSON part first, `audio` WAV/PCM part second; see [AssemblyAI's dictation docs](https://www.assemblyai.com/docs/dictation)).
- **Fallback**: `https://sync.assemblyai.com/transcribe`.
- **Local proxy**: `POST /api/dictation` accepts browser audio (webm/opus, mp4, wav — anything MediaRecorder produces), transcodes to 16 kHz mono WAV in-browser (`lib/dictation/useDictation.ts`), and forwards as `config` + `audio` parts to AssemblyAI.
- Only WAV (`audio/wav`) and raw PCM S16LE (`audio/pcm`) are accepted upstream — webm/mp3/m4a are rejected with 415 `unsupported_audio`.
- The response prefers `llm_response` (cleaned-up, send-ready) and falls back to verbatim `text`; both are returned (`transcript`, `verbatimTranscript`, `cleanedUp`).
- An invalid key returns 404 upstream, mapped to 503 `credits_exhausted`; empty transcripts return 422 `no_speech`.

Environment variables:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
ASSEMBLYAI_DICTATION_ENDPOINT=https://dictation.assemblyai.com/v1/transcribe/live
```

Client secrets stay server-side; the browser only ever talks to `/api/dictation`.

### Intent parser & hearing receipt

Trading instructions require deterministic precision. Dictation strips hesitations and filler words so the intent parser (`lib/trading/dictation-parser.ts`) can extract:

- **Action / Side**: `buy` vs. `sell` — only when the utterance names one; otherwise the ticket asks.
- **Asset**: tokenized stocks (`NVDAc`, `AAPLc`, `TSLAc`, `GOOGLc`, …).
- **Amount & Units**: numeric quantities or dollar/USDC spends (supports `$100`, `2k`, …) — only when the utterance names one; a missing amount clears the box and focuses it, never inherits a stale figure.

The clean transcript is shown on the ticket as what was heard, with a hearing receipt (`Heard · …`) binding transcript, provider session id, and timestamp — a record of the hearing, not a trade and not an approval. Partial hearings are shown as partial ("Buy GOOGLc heard — add the amount on the ticket"). The honest-speech principle this implements is described in [docs/PRODUCT.md](PRODUCT.md); the UX grammar for receipts and partials is [docs/UX.md](UX.md).

---

## AssemblyAI Voice Agent (Jesse's alternative line)

**Status:** implemented behind a flag; verified against the live API (token, session, tool round trip). Real-microphone browser QA still pending.

Jesse's line can run on AssemblyAI's Voice Agent API with the same prompt, the same desk, and the same ten client tools as the ElevenLabs line. Two protocol features carry the house's safety rules: **progressive tool reveal** (`record_paper` is only registered while a quotation is in review) and **`hold` execution** for filing. Tool results are released only on `reply.done`. Paper only: no tool can sign, submit, or move funds.

### Turn it on

| Where | How |
|---|---|
| Whole deployment | `NEXT_PUBLIC_JESSE_VOICE=assemblyai` (rebuild) plus `ASSEMBLYAI_API_KEY` on the server |
| One visit | `/?desk=jesse&view=room&line=assemblyai` |
| Back to ElevenLabs | `?line=elevenlabs`, or leave the flag unset (the default) |

The flag defaults to ElevenLabs, so the Stocklana judge URL (`/?desk=jesse&view=room`) behaves exactly as before. The AssemblyAI demo URL is `/?desk=jesse&view=room&line=assemblyai`.

**Failover.** On an *unpinned* visit (no `?line=`), a carrier that cannot open the line — session endpoint error, dial stall, transport failure — hands the pending ring to the other carrier once, and the desk stays on whichever answered for the rest of the visit. Failover is establishment-only: never mid-call, and never on microphone denial, which is a client-side refusal both carriers would meet identically. A *pinned* `?line=` never fails over: a demo link keeps its honest error rather than silently changing providers, so the judge URLs above behave exactly as advertised.

### How a call works

```
Ring Jesse ─► POST /api/desk/jesse/voice-agent/token      (server: GET agents.assemblyai.com/v1/token
                                                            ?product=voice_agent&expires_in_seconds=60
                                                            &max_session_duration_seconds=600)
          ─► wss://agents.assemblyai.com/v1/ws?token=…    (browser; the key never leaves the server)
          ─► session.update { system_prompt, greeting, output.voice, input.keyterms, tools }
          ◄─ session.ready → mic audio streams as input.audio (PCM16, 24 kHz, base64)
          ◄─ transcript.user.delta / transcript.user        → "Hearing…" line, then a caption
          ◄─ tool.call { name, arguments }                  → lib/jesse/desk-tools.ts runs it on the desk
          ─► tool.result (only once reply.done is the latest event)
          ◄─ reply.audio / transcript.agent                 → playback worklet, caption
   foreground changes ─► session.update { tools }           (progressive reveal)
   End call / tab hidden ─► session.end                    (stops billing; no 30 s resume window)
```

**Session caps.** Tokens are minted with `expires_in_seconds=60` and a **10-minute call cap** (`max_session_duration_seconds=600`); the token route adds per-instance and per-IP budgets. Ending the call or hiding the tab sends `session.end`, which stops billing immediately — there is no 30-second resume window.

### Safety, in the protocol

| House rule | How the Voice Agent API enforces it |
|---|---|
| Nothing is filed without a quotation in review | `record_paper` is not registered unless `foreground.kind === 'quotation'` (progressive reveal via a mid-call `session.update`). The browser also refuses an out-of-state call, in case it races the reveal. |
| Filing is deliberate | `record_paper` runs in `hold` mode: the broker goes silent until the browser has written or refused the record. |
| A misheard amount is re-asked, not guessed | `set_amount.amount` has a `pattern` and `examples`, so a value that doesn't match is rejected before the tool runs. |
| A filed record is read-only | Receipt, archive and missing records expose only `describe_desk`, `explain_concept` and `watch_mark`. |
| Barge-in wins | `input.speech.started` empties the playback ring. Pending tool results are still sent on the interrupted `reply.done`: the tool has already changed the desk, and a dropped result makes the agent's call time out and report the tool as broken. |
| Voice cannot move money | No tool signs, submits, or touches a wallet (asserted in the tests). |

The full tool-safety policy across every desk line is the same: tools execute in the caller's browser against the desk controller, and nothing in the tool set can sign, submit, reconcile, or move funds.

### Files

| File | Role |
|---|---|
| `lib/jesse/assemblyai-agent.ts` | Pure config: tools ported from `scripts/jesse-agent-config.mjs`, parameter hints, execution modes, `toolsForForeground` (reveal), `jesseSessionUpdate`, `ToolResultQueue` |
| `lib/jesse/assemblyai-session.ts` | Browser session: mic capture, playback worklets, socket protocol, clean `session.end` |
| `lib/jesse/desk-tools.ts` | The ten tool handlers over `useJesseDesk`, **shared** with the ElevenLabs line |
| `components/desk/JesseCallAssemblyAI.tsx` | Call panel: same UI grammar as `JesseCall.tsx`, plus a live "Hearing…" partial transcript |
| `app/api/desk/jesse/voice-agent/token/route.ts` | Token minting with instance and IP budgets |
| `tests/jesse-assemblyai.test.ts` | Config, reveal, ordering, socket protocol, token route |

### Audio

This follows AssemblyAI's browser guide and the official `voice-agent-starter-js`:

- The mic is opened with `echoCancellation: true`, `noiseSuppression: false` and `autoGainControl: false`.
- Both `AudioContext`s run at the device rate, and worklets resample to and from 24 kHz (the Voice Agent API's PCM16 wire format). Safari ignores a forced `sampleRate`, and Firefox's echo canceller only sees the default graph.

### Verified & not yet verified

- **Unit and protocol tests:** 18 in `tests/jesse-assemblyai.test.ts`.
- **Live API (2026-09-24):** a token was minted; `session.ready` echoed `voice: "charles"` and the nine drafting tools; a mid-call `session.update` revealed `record_paper`; a synthesized caller said "Put Apple on the ticket, please", was transcribed word for word, Jesse called `choose_instrument {"query":"Apple"}`, and he spoke the tool result back: *"Apple is on the ticket. What would you like to do with it?"*
- **Not yet verified:** a real microphone in Chrome, Safari and iOS (including echo cancellation on laptop speakers); a full estimate → file → hold sequence by voice on the live desk; voice choice — `charles` (UK) is a placeholder, `george` or `michael` (US) are candidates for a Livermore voice.

---

## Broadcast (in progress)

The Stocks Maxxing sprint is taking the desk voice stack live: an avatar-broker broadcasting to a room rather than speaking to one caller. Scope, open questions, and the build plan live in [docs/LIVE_DESK_AVATAR_PLAN.md](LIVE_DESK_AVATAR_PLAN.md). Until that plan lands, the per-desk ConvAI sessions above remain the only supported way to talk to a desk; release gating for voice changes is in [docs/RELEASE_VALIDATION.md](RELEASE_VALIDATION.md), and the running log of prior voice decisions is [docs/HISTORY.md](HISTORY.md).
