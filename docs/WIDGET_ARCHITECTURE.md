# Voice Transport: Widget Engine (retained)

## Scope and status

**Archive for the old widget path. Not the live Hetty session.**

**Updated:** 2026-09-08. The desk voice path is `components/desk/HettyCall.tsx` plus `POST /api/hetty/session` (ConvAI signed URL, client tools against the paper draft). The historical `<elevenlabs-convai>` widget, `WidgetEngine`, and `/api/webhooks/elevenlabs` are retained source, not mounted by the root layout and not how Hetty rings today.

The notes below are dated evidence about that retained stack, not a guarantee of current provider behavior and not setup instructions for the paper desk.

[Product Direction](PRODUCT_DIRECTION.md) owns the visible experience. [ROADMAP.md](../ROADMAP.md) owns priorities. [Architecture](AGENTIC_ARCHITECTURE.md) describes the live Hetty path.

## Why a controlled widget

The original May 2026 investigation reported negotiation timeouts through direct `Conversation.startSession()` use while the official `<elevenlabs-convai>` widget connected successfully in the probe. The implementation moved to a single controlled widget rather than a visible vendor widget or multiple competing voice sessions.

The transport is supporting infrastructure. Keep provider presets, agent IDs, and connection mechanics out of the primary client journey, while clearly identifying Hetty as AI and explaining microphone use.

## Implementation map

| Layer | Source | Responsibility |
|---|---|---|
| Mounted voice engine | `components/WidgetEngine.tsx` | `WidgetEngineProvider` mounts one offscreen widget and exposes control through context; adapts to provider runtime capabilities. |
| Conversation lifecycle | `lib/useWidgetConversation.ts` | Starts/ends conversations, tracks connection/duration/cost, accepts budget/time limits, and consumes transcript delivery. |
| Call launch | `app/page.tsx`, `lib/product-launch.ts`, `components/AgentPreviewSheet.tsx` | Selects broker and handles pre-call entry; launch/cap inconsistencies remain open in the roadmap. |
| Visible conversation | `components/ActiveCall.tsx` | Currently call telemetry, controls, and transcript; target working-desk surfaces should use real lifecycle and tool state. |
| Session authorization | `app/api/webrtc/signal/route.ts` | Backend session/signed-URL path used by the conversation hook. |
| Tool and transcript delivery | `app/api/webhooks/elevenlabs/route.ts`, `app/api/transcripts/route.ts` | Provider callbacks and transcript delivery to the client; do not assume widget-native transcript events. |
| Internal runtime probe | `app/widget-probe/page.tsx`, `components/WidgetProbe.tsx` | Inspect actual provider methods, shadow DOM, events, and lifecycle behavior. Not a client destination. |

Do not assume `display: none` preserves provider audio/lifecycle behavior. Maintain a mounted, visually suppressed engine and verify its operation when changing visibility or control paths.

## Historical probe: 2026-05-13

The previous investigation recorded these observations at `/widget-probe`:

| Question | Observation at that time |
|---|---|
| Imperative methods on host element? | No usable conversation methods; lifecycle callbacks only. |
| Shadow DOM? | Open shadow root with one button and no inputs. |
| Start/end control? | Clicking the shadow button toggled the conversation. |
| Mute/volume methods? | Not exposed on the host element. |
| Custom events on host? | None observed. |
| Signed URL mode? | Worked with a backend-issued signed URL. |
| Offscreen operation? | Rendered and responded off-viewport. |
| Transcript events? | Not emitted by the widget; webhook reconciliation required. |

These findings explain the control adapters and fallback strategies. They must not be rewritten as "the widget exposes startConversation events" or "all controls work" without new evidence. The old SDK migration plan is historical; it is not pending product work.

## Current transcript path and limitations

`useWidgetConversation` contains a fetch-based SSE reader for `/api/transcripts?callId=...`. The webhook/API path, not an assumed widget event, supplies transcript material. Some source comments still describe an older post-call-only arrangement; verify actual provider event timing, session correlation, and delivery before promising live transcription.

Show a truthful waiting/unavailable state when no transcript has arrived. An animated waveform is not evidence that speech was transcribed. A transcript is also not evidence that a paper instruction was confirmed and persisted; those need separate structured state and records.

## Required client-facing behavior

These requirements are release gates, not blanket claims about current behavior:

- **Consent:** an explicit call action precedes microphone activation; permission is requested in context. Cancel/back does not leave capture or a billable session running.
- **Connection:** distinguish connecting, connected, failed, and ended using reliable transport evidence. An optimistic timeout or decorative "patching" sequence must not certify a successful connection.
- **Controls:** verify real mute, speaker, and hang-up behavior. Do not show a control as successful merely because local UI state changed; expose unsupported/unavailable states honestly.
- **Budget:** the reviewed cap and trial terms must reach the hook and be enforced. `ActiveCall` currently chooses its own five-minute paid cap and a two-minute trial limit; a cap control elsewhere is not proof of end-to-end propagation.
- **Recovery:** do not double-start sessions, replay a paper instruction, or duplicate a payment during retry/reconnection. Preserve useful work and state what was saved or remains pending.
- **Completion:** ending voice, saving a work record, and settling the call payment are separate outcomes. Surface delayed or failed records without claiming success.
- **Accessibility:** keyboard operation, clear status, readable text, and reduced-motion behavior are required. Optional ambience must not compete with voice; no sound-on autoplay or forced spatial gesture.

## Verification protocol

When voice implementation changes, record the date, browser/device, build, relevant configuration mode, observed behavior, and remaining limitations. Do not record credentials or private conversation content in diagnostics.

1. Use the internal probe to inspect actual widget capabilities rather than assume the historical contract still holds.
2. Test one explicit launch through each client entry path, including eligible trial and paid modes, with the intended broker and exact reviewed terms.
3. Verify permission denial, cancellation while connecting, failed connection, retry, mute/speaker behavior, hang-up, and capture cleanup.
4. Verify time/cost cap termination and usage handling during reconnect; distinguish zero-charge trial presentation from paid cost computation.
5. Verify transcript timing and call-ID correlation through callback, API, UI, and stored records. Exercise delayed/missing delivery.
6. Verify work-record persistence and receipt/payment states independently, including decline and failure. Tests that incur charges, create records, or settle funds require an appropriate explicitly approved test setup.
7. Repeat relevant interactions at mobile widths, with keyboard, reduced motion, and ambience off. Clean up only the browser/session started for that test.

Use the repository's `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` commands as appropriate to code changes. Passing them does not replace runtime/provider verification. No fresh voice-session or payment validation was performed for the September 5 documentation alignment.
