# AssemblyAI Dictation in Claflin

**Dictation is the new keyboard for financial execution.** Claflin integrates AssemblyAI's Dictation API (`https://dictation.assemblyai.com/v1/transcribe/live`) as its default voice input engine, creating a clean, auditable trading ticket flow.

---

## 1. Dual-Engine Architecture

Claflin decouples voice input from voice output to provide an institutional-grade experience:

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
                  │                                              │
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

- **Input (AssemblyAI Dictation)**: Captures voice commands, removes disfluencies, and returns structured, auditable order intents.
- **Output (ElevenLabs)**: Delivers the spoken broker persona ("Hetty") and conversational audio confirmation.

---

## 2. API Endpoints & Configuration

### Endpoint
- **Dictation**: `https://dictation.assemblyai.com/v1/transcribe/live` (multipart: `config` JSON part first, `audio` WAV/PCM part second; see [docs](https://www.assemblyai.com/docs/dictation))
- **Fallback**: `https://sync.assemblyai.com/transcribe`

### Local Proxy Route
- `POST /api/dictation` accepts browser audio (webm/opus, mp4, wav — anything MediaRecorder produces), transcodes to 16kHz mono WAV in-browser (`lib/dictation/useDictation.ts`), and forwards as `config` + `audio` parts to AssemblyAI.
- Only WAV (`audio/wav`) and raw PCM S16LE (`audio/pcm`) are accepted upstream — webm/mp3/m4a are rejected with 415 (`unsupported_audio`).
- The response prefers `llm_response` (cleaned-up, send-ready) and falls back to verbatim `text`; both are returned (`transcript`, `verbatimTranscript`, `cleanedUp`).
- An invalid key returns 404 upstream, mapped to 503 `credits_exhausted`; empty transcripts return 422 `no_speech`.
- Client secrets stay server-side (`ASSEMBLYAI_API_KEY`).

### Environment Variables
```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
ASSEMBLYAI_DICTATION_ENDPOINT=https://dictation.assemblyai.com/v1/transcribe/live
```

---

## 3. Intent Parser & Compliance Audit Trail

Trading instructions require deterministic precision. AssemblyAI Dictation filters out hesitations and filler words, allowing the intent parser (`lib/trading/dictation-parser.ts`) to extract:
- **Action / Side**: `buy` vs. `sell`
- **Asset**: Tokenized stocks (`NVDAc`, `AAPLc`, `TSLAc`, `GOOGLc`, etc.)
- **Amount & Units**: Numeric quantities or dollar/USDC spends (supports `$100`, `2k`, etc.)

The clean transcript is stamped directly on the ticket as the client's explicit instruction trail before paper or live quotation review.
