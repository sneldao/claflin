# Performance Notes

**Scope:** Source-based implementation notes and verification priorities, updated 2026-09-08. These are not measured performance results.

[Product Direction](PRODUCT_DIRECTION.md) sets the priority: facilitate intended trades through a responsive desk. [ROADMAP.md](../ROADMAP.md) owns sequencing. Optimize time to a valid quote, clear review, reliable execution, and verified outcome—not time spent reading or talking. Publications, ranking, and the scene must not sit on the critical trading path.

## Priorities for the client journey

1. **Arrival:** render direct instrument/intent entry and actual coverage/mode without waiting for letters, personalization, activity, or decorative media.
2. **Preparation:** resolve product/account/access and obtain a valid quote promptly; keep voice permission/connection honest and cancellable. Separate provider latency from UI and scene work.
3. **Review:** keep quote validity, terms, fees, account, and explicit authorization stable and responsive. Content refresh must not move controls or silently replace reviewed terms.
4. **Execution and outcome:** submit once, track real adapter/venue/chain states, and reconcile the position and receipt. Measure quote-to-submission latency without weakening expiry or approval checks. Call settlement is separate.
5. **Return:** recover verified orders/positions and pending intents without replaying an introduction or requiring content consumption.

Establish measured baselines and budgets before adding substantial imagery, ambience, or dimensional rendering. Record the device, network, build mode, scenario, and result. No numerical improvement or release claim should be inferred from the existence of an optimization.

## Current source map

| Surface | Current mechanism | Caveat or next verification |
|---|---|---|
| Initial page | `app/page.tsx` renders `WorkingDesk` directly. No onboarding, directory or call meter. Optional Privy mounts only when public env is set, via `next/dynamic`. | Verify the normal root entry, not only an alternate preview route. No measured speed improvement is claimed from source changes alone. |
| Trade preparation | `useTradingDesk` coordinates explicit requests with aborts and stale-response guards; `TradeTicket` owns the review surface. | No quote request before an explicit action. Recheck expiry at save even if background timers were throttled. |
| Rendering | `DeskInstrument` dynamically imports Three.js; the form and records remain HTML. `/desk-study` is a development fixture, not the product. | Rendering must not block preparing or reviewing an instruction; verify reduced-motion, hidden state, fallback and cleanup. |
| Return visits | `PaperHistory` reads browser-local paper records. Signed-in clients may also pull account copies (add-only). | Storage failures are visible; paper records must not appear as real positions. Account copies are not a second source of truth. |
| Voice | “Ring Hetty” starts an ElevenLabs ConvAI session (`/api/hetty/session` mints the signed URL server-side). Her client tools drive the same desk draft. The old widget is not loaded. | Live conversation is real. Transcript POST is write-only when a bearer token is present; the ring request does not send one. No execution authority. |

## Engineering constraints

- Keep background activity and decorative assets off the critical path; nonessential failures should not block the desk.
- Stop unnecessary media and update loops when hidden or unmounted. Keep one voice session and clean up its capture/listeners explicitly.
- Prefer event-driven transform/opacity transitions where motion adds information. `transition` alone does not guarantee compositor execution; width and layout changes need measurement.
- Keep reduced-motion and ambience-off modes complete. Do not require animation completion before controls become usable.
- Reserve stable space for changing status, amounts, and working records. Preserve readable rates/caps on mobile rather than hiding them to fit the layout.
- Treat data freshness separately from caching success. Stale quotes, delayed transcripts, and unavailable activity need appropriate labeling.
- Use memoization only where profiling justifies it; do not claim constant rendering cost for larger lists or zero parent re-renders without evidence.

## Target adaptive and publishing surfaces

These are planned requirements, not capabilities of the current use-case ranking or `/desk-study`.

- Render a stable default desk and the selected edition without waiting for personalization or optional news. Keep an unavailable-data state rather than invent a morning letter or quote.
- Cache shared publication editions by version and entitlement. Scope private context and personalized views to the correct client; privacy boundaries take precedence over cache reuse.
- Batch quote/headline updates at a cadence appropriate to the data contract and visible surfaces. Do not rebuild the 3D scene or rerank the whole desk on every tick.
- Preserve the current reading passage, keyboard focus, pinned work, and confirmation ticket while background relevance changes. Announce significant corrections/staleness without streaming every market tick to assistive technology.
- Expiry and permission checks remain authoritative even when UI refresh is throttled. A visible old quote must not remain actionable because the desk is idle or hidden.
- Suspend optional news polling and rendering when appropriate; revalidate freshness on return. Do not let cached "why shown" reasons survive deleted history or revoked consent.
- Measure first letter readability, passage-to-conversation context transfer, update latency, and return-to-work correctness alongside load/render cost. No optimization for sensational click-through or paid-minute consumption.

## Verification

For implementation changes, use the relevant `pnpm test`, `pnpm typecheck`, and `pnpm exec next build --webpack` commands, then perform scoped runtime checks when authorized. The direct build avoids destructive standalone postbuild cleanup; the existing `pnpm lint` configuration limitation is documented in the README. Development compilation time is not production load performance.

Measure and inspect:

- First usable arrival and call action on representative desktop and mobile devices/networks.
- Microphone permission, connection latency, cancel/retry, and transport failure.
- Input responsiveness, audio quality, and render activity during conversation.
- Actual cap termination and delayed transcript/work-record/payment states.
- Layout shifts, contrast, keyboard focus, narrow-screen overflow, reduced motion, and muted ambience.
- Return-to-work latency and correctness, with missing or stale records included.

Basic failure visibility belongs in beta. Choose monitoring and telemetry from the questions above, avoid recording sensitive conversation content by default, and set performance targets from measurements. Provider/runtime checks are described in [Voice Transport](WIDGET_ARCHITECTURE.md); safe read-only retry behavior is described in [Error Resilience](ERROR_RESILIENCE.md).

## Implemented on feat/desk-immersion-quest (2026-09-05)

- Review countdown uses a local `useReviewClock` only while `stage === 'review'` — the desk tree no longer re-renders every second.
- Aerodrome reader batches concurrent `eth_call`s (`batchMaxCount: 25`), pins Base via `staticNetwork`, and overlaps quote + Chainlink feed after identity checks.
- Desk instrument waits for intersection + `requestIdleCallback` before loading Three.js; reduced-motion keeps the enamel fallback.
