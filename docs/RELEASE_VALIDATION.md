# Integration validation: 2026-10-03

**Scope:** Local integration through `8d8d84b` on `main`, before this documentation
update. These checks do not establish deployment, hosted CI, live voice,
transaction execution or real-device acceptance.

## Integrated changes

- Feature repair commit `aca3bbd`: unique foyer example/register sections,
  hook-safe example rendering with validated optional audio/timing, mounted
  Hetty/Jesse paper receipt portraits, and visible venue provenance.
- Market evidence: provider observation timestamps govern freshness; Base stock
  gaps require comparable units, a known corporate-action multiplier, and
  same-block feed/multiplier reads. Missing, stale or unsupported evidence
  remains unavailable rather than a fabricated comparison.
- Copy commands scan actual source, reject empty scans and use canonical broker
  contracts. CI includes typecheck and both copy checks.
- The Room measurement command collects paint, WebGL, frame and payload metrics
  and rejects missing data or regressions above 15% against a successful baseline.
- Validated dependency merges: `pnpm/action-setup@v6`, `actions/upload-artifact@v7`,
  PostCSS 8.5.28, tsx 4.23.15 and Upstash Redis 1.39.0. Lockfile repairs retain
  Node 24 declarations and a frozen-installable dependency graph.
- Redis compatibility tests use the installed SDK with an in-memory requester:
  snapshot retention, rate-limit JSON/TTL, user hash deserialization and provider
  errors are exercised without a live database.

## Checks and results

| Check | Recorded result |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed |
| `pnpm test` | 1,311 passed; no failures or skipped unit tests |
| `pnpm typecheck` | Passed |
| `pnpm lint` | No errors; 44 warnings |
| `pnpm check:canon` | Passed; 312 source files scanned |
| `pnpm check:broker-voice` | Passed; 313 source files scanned |
| `pnpm exec next build --webpack` | Passed in production mode; an earlier timed-out build was rerun successfully |
| `CI=true pnpm exec playwright test` | Four maintained journeys passed; 14 legacy tests skipped |
| Workflow YAML and preserved action inputs | Checked locally; hosted action execution not yet verified |

Browser checks cover a fresh foyer visit, instruction-to-offering routing and
desktop/phone paper estimate, filing, return and reopen. They use provider
fixtures, not live quotes or voice sessions. The skipped legacy suite does not
count as acceptance of its keyboard, recovery, reduced-motion or layout cases.
Unit/source contracts supplement, rather than replace, user comprehension and
manual accessibility checks.

To repeat production browser checks, install Chromium, run the direct production
build, then run `CI=true pnpm test:e2e`. Keep live execution disabled in the
test environment. The direct build avoids the deployment packaging script's
standalone cleanup; Docker/deployment packaging was not certified by this pass.

## Performance is not accepted

The [Room budget](PERFORMANCE_ROOM_VIEW.md) originally recorded the
feature-repair build's local SwiftShader baseline: Room paint, mount and frame
rate missed the desktop targets and both views transferred 1,573,768 gzipped
JavaScript bytes while mounting WebGL. The subsequent per-view payload split —
recorded as that doc's newer baseline — keeps Compact from ever mounting WebGL
and cuts its payload by ~249KB, and the scene now boots exactly once. The
absolute targets remain unmet: Compact still exceeds the <200KB payload budget
and Room still exceeds its payload budget. A passing regression comparison
does not mean the absolute targets are met. Real Android and iOS checks remain
open.

## Deferred dependency work

An isolated trial with ElevenLabs React 1.16.0 and viem 2.57.2 passed typecheck and
all 1,311 existing tests. Additional offline checks exercised real EIP-191 wallet
and voice-call signatures, rejecting wrong-wallet and wrong-call claims. Lucide
React 1.49.0 passed typecheck and exported/rendered all 14 imported icons.
These trial versions were **not merged**: full SDK/provider lifecycle,
transaction/RPC integration and browser/visual acceptance remain unverified.
The trial worktree was removed; the validated main dependency versions remain.

- Align React and React DOM together: the React-types branch locks React 19.3.0
  with React DOM 19.2.7.
- Migrate the Tailwind 4 PostCSS plugin and styles together; a manifest-only
  upgrade is not a stylesheet migration.
- Consolidate overlapping Three.js runtime/types branches into one matching pair
  and validate graphics and performance before merging.
- Keep Node 24 runtime/declarations aligned; the Node 26 declaration branch is
  not a runtime migration.
- Do not merge already-integrated branches again or revive the stale Devin work.

## Follow-up: 2026-10-05, uncommitted release candidate

Optional account services, Jesse's default voice transport, desk views and the
live-only Solana wallet panel now load separately. Account activation keeps the
paper subtree mounted; desk controllers remain mounted across view changes.
The default voice gate preserves ring-on-arrival and cancellation. AssemblyAI
selection and provider failover remain owned by the desk surface.

Before verification stopped, 1,328 unit tests passed, typecheck and changed-code
lint passed, and production builds passed for the main loading changes. The
original four maintained journeys and four added recovery/keyboard scenarios
passed. New missing-record and transport-on-ring cases remain unrun; 14 legacy
browser cases remain skipped. Fixtures do not certify live account or voice
services, device accessibility or user comprehension.

Code review then fixed cancel-then-ring during an in-flight transport import,
cleared pending intent on unmount/handoff, and guarded disabled account actions.
A regression case was added but not run. Temporary attribution scripts were
removed. Latest edits need fresh verification; historical passing counts do not
certify the final patch.

The owner requested no further browser automation or heavy builds due to CPU
load. Both final build attempts were stopped; the current `.next` output may be
incomplete and must not be deployed. No commit, push or deployment occurred.

### Owner-run checks before release

Run sequentially when resources permit: typecheck, lint, unit suite, a complete
`pnpm build`, maintained browser scenarios and the Room budget measurement.
Set `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED`, `NEXT_PUBLIC_JESSE_LIVE_ENABLED`,
`JESSE_LIVE_ENABLED`, `NEXT_PUBLIC_HALLEY_LIVE_ENABLED` and `HALLEY_LIVE_ENABLED`
to `false` for paper-only verification. Port 3000 was occupied in this session;
use an isolated local server rather than testing against an unrelated process.

Manually verify sign-in, returning-account restoration, sign-out, explicit
anonymous-record import, parked drafts across desk switches, ring/cancel/H,
and provider failover. Account restoration currently checks an app-owned
activation marker plus legacy `privy:` storage keys; the latter is a provider
implementation assumption that needs verification. Review the outstanding
Compact budget and timing comparison in [Room budget](PERFORMANCE_ROOM_VIEW.md)
before accepting a paper-only production release and its smoke checks.

## Halley first-use guidance: Phase 1, committed in 3891237

Halley's surface now includes a static comet emblem in a fixed portrait slot,
a three-step paper-launch guide, and a visible no-mint boundary. A first-use
button fills an editable NVDA example without estimating or filing. Visible
field hints explain the anchor, curve, supply and graduation threshold; the
estimate button identifies missing required fields. The header displays the
actual draft/review stage instead of an empty placeholder. No avatar service,
Rive runtime, new dependency or live launch path was added.

Regression tests were added in `tests/halley-plate.test.ts`. Browser review,
full typecheck/build and test execution remain owner-run checks under the
CPU restriction. Verify desktop/phone layout, example editing, visible hints,
progress through estimate/file/archive, and keyboard focus before release.

## Halley Room integration, committed in 8c2ff27

Halley now uses the shared Room presentation and scene owner, with persisted
Room/Compact preferences and query overrides. The controller and paper-only
launch workflow are unchanged. Both views retain the launch form and guide;
Room adds the shared receiver, document-driven scene posture and a static,
pointer-inert celestial accent. Compact uses the receiver poster without
arming its Three.js scene. No new rendering dependency was added.

Changing views during a connected or connecting call is refused with a status
message, since replacing the presentation shell would otherwise unmount the
call. End or cancel the call first; paper drafts remain owned above the shell.
The H shortcut now uses the shared line signal on Halley.

Source regression cases were added in `tests/halley-room.test.ts`; they have
not been executed. No browser, build or full typecheck was run under the owner's
CPU restriction. Verify both views, reduced motion, query/preference restoration,
receiver/H behavior, call-safe switching, review/file/archive posture, mobile
layout and the celestial layer's visibility before release. This reuses the
house composition but does not certify visual parity with Jesse's Room.

## Hosted verification: 2026-10-08

For commit `8c2ff27`, hosted unit tests and secret scanning passed, but lint
failed on a missing JSX closing brace in Halley's missing-fields message.
Build, browser acceptance and Docker jobs were skipped. Vercel also reported a
failed deployment; its detailed logs were inaccessible with the local CLI's
team permissions. GitHub Pages success does not establish a successful Vercel
production release.

The closing brace was repaired and a TypeScript syntax regression test added.
A lightweight parse of the corrected surface returned zero syntax diagnostics.
The repair still needs hosted lint/typecheck, build and deployment confirmation;
no local browser or heavy build was run. Earlier source-only reviews missed
this error and must not be treated as executable validation.

## Remaining release gates

- Accept a real example-call recording/transcript/slip; the current pending
  state does not claim a recording exists.
- Complete skipped browser cases, broader failure/recovery, accessibility and
  first/return-visit comprehension checks.
- Resolve performance/payload targets and certify real Android/iOS devices.
- Verify hosted CI, including the upgraded Actions, Docker packaging and audit
  findings. The workflow's security audit is informational, not a blocking gate.
- Certify provider freshness/units, voice lifecycle and any explicitly approved
  live execution independently. Paper filing and local checks never authorize
  funds movement or establish live readiness.
