# Jesse on AssemblyAI's Voice Agent API

**Date:** 2026-09-24 · **Status:** Implemented behind a flag; verified against the live API (token, session, tool round trip). Real-microphone browser QA still pending. · **Owner:** voice
**TL;DR:** Jesse's line can run on AssemblyAI's Voice Agent API with the same prompt, the same desk, and the same ten client tools as the ElevenLabs line. Two protocol features carry the house's safety rules: **progressive tool reveal** (`record_paper` is only registered while a quotation is in review) and **`hold` execution** for filing. Tool results are released only on `reply.done`. Paper only: no tool can sign, submit or move funds.

## Turn it on

| Where | How |
|---|---|
| Whole deployment | `NEXT_PUBLIC_JESSE_VOICE=assemblyai` (rebuild) plus `ASSEMBLYAI_API_KEY` on the server |
| One visit | `/?desk=jesse&view=room&line=assemblyai` |
| Back to ElevenLabs | `?line=elevenlabs`, or leave the flag unset (the default) |

The flag defaults to ElevenLabs, so the Stocklana judge URL (`/?desk=jesse&view=room`) behaves exactly as before. The AssemblyAI demo URL is `/?desk=jesse&view=room&line=assemblyai`.

## How a call works

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

## Files

| File | Role |
|---|---|
| `lib/jesse/assemblyai-agent.ts` | Pure config: tools ported from `scripts/jesse-agent-config.mjs`, parameter hints, execution modes, `toolsForForeground` (reveal), `jesseSessionUpdate`, `ToolResultQueue` |
| `lib/jesse/assemblyai-session.ts` | Browser session: mic capture, playback worklets, socket protocol, clean `session.end` |
| `lib/jesse/desk-tools.ts` | The ten tool handlers over `useJesseDesk`, **shared** with the ElevenLabs line |
| `components/desk/JesseCallAssemblyAI.tsx` | Call panel: same UI grammar as `JesseCall.tsx`, plus a live "Hearing…" partial transcript |
| `app/api/desk/jesse/voice-agent/token/route.ts` | Token minting with instance and IP budgets |
| `tests/jesse-assemblyai.test.ts` | Config, reveal, ordering, socket protocol, token route |

## Safety, in the protocol

| House rule | How the Voice Agent API enforces it |
|---|---|
| Nothing is filed without a quotation in review | `record_paper` is not registered unless `foreground.kind === 'quotation'`. The browser also refuses an out-of-state call, in case it races the reveal. |
| Filing is deliberate | `record_paper` runs in `hold` mode: the broker goes silent until the browser has written or refused the record. |
| A misheard amount is re-asked, not guessed | `set_amount.amount` has a `pattern` and `examples`, so a value that doesn't match is rejected before the tool runs. |
| A filed record is read-only | Receipt, archive and missing records expose only `describe_desk`, `explain_concept` and `watch_mark`. |
| Barge-in wins | `input.speech.started` empties the playback ring; an interrupted `reply.done` drops pending tool results. |
| Voice cannot move money | No tool signs, submits, or touches a wallet (asserted in the tests). |

## Audio

This follows AssemblyAI's browser guide and the official `voice-agent-starter-js`:
- The mic is opened with `echoCancellation: true`, `noiseSuppression: false` and `autoGainControl: false`.
- Both `AudioContext`s run at the device rate, and worklets resample to and from 24 kHz. Safari ignores a forced `sampleRate`, and Firefox's echo canceller only sees the default graph.

## Verified

- **Unit and protocol tests:** 18 in `tests/jesse-assemblyai.test.ts`.
- **Live API (2026-09-24):**
  - A token was minted.
  - `session.ready` echoed `voice: "charles"` and the nine drafting tools.
  - A mid-call `session.update` revealed `record_paper`.
  - A synthesized caller said "Put Apple on the ticket, please". AssemblyAI transcribed it word for word, Jesse called `choose_instrument {"query":"Apple"}`, and he spoke the tool result back: *"Apple is on the ticket. What would you like to do with it?"*

## Not yet verified

- A real microphone in Chrome, Safari and iOS, including echo cancellation on laptop speakers.
- A full estimate, file and hold sequence by voice on the live desk.
- Voice choice: `charles` (UK) is a placeholder. Try `george` or `michael` (US) for a Livermore voice.
