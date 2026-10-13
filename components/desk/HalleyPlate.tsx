'use client';

import type { ReactNode } from 'react';
import type { HalleyDraft } from '@/lib/meteora/contracts';
import { LAUNCH_STEPS, isBlankDraft, launchStep, type PlateStage } from '@/lib/meteora/plate';
import styles from './HalleyPlate.module.css';

/**
 * An engraved comet on its orbit: a stand-in emblem, not a portrait. The
 * `portrait` prop replaces it later without changing the frame.
 */
function CometEmblem() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="56" strokeWidth="1" strokeDasharray="1 5" />
      <ellipse cx="60" cy="62" rx="50" ry="20" strokeWidth="1.2" transform="rotate(-24 60 62)" />
      <ellipse cx="60" cy="62" rx="36" ry="13" strokeWidth=".7" transform="rotate(-24 60 62)" />
      <circle cx="60" cy="62" r="3" fill="currentColor" stroke="none" />
      <g strokeWidth=".9" strokeLinecap="round">
        <path d="M96 40 L117 24" />
        <path d="M97 42 L119 31" />
        <path d="M95 38 L113 20" />
        <path d="M98 44 L116 38" />
        <path d="M94 37 L106 17" />
      </g>
      <circle cx="96" cy="41" r="4.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Says what the launch desk is for and where the caller stands in it. It reads
 * the draft and stage only; it never edits them or claims a result.
 */
export function HalleyPlate({ stage, draft, mode = 'paper', portrait }: {
  stage: PlateStage;
  draft: HalleyDraft;
  /** The caller's selected path — the stamp and the last step name it. */
  mode?: 'paper' | 'live';
  /** Optional replacement for the emblem, e.g. a future character. */
  portrait?: ReactNode;
}) {
  /* Paper 'done' means a filing — on the live path nothing is done until a
     wallet-signed mint is verified, so 'saved' reads as step 3 still open. */
  const current = mode === 'live' && stage === 'saved' ? 3 : launchStep(stage, draft);
  /* Orientation is for the caller who hasn't begun; once they have, the rail
     is wayfinding — titles for the road, detail only where they stand. */
  const started = !(stage === 'draft' && isBlankDraft(draft));
  return (
    <section className={styles.plate} aria-labelledby="halley-plate-title">
      <figure className={styles.portrait}>
        <div className={styles.frame}>{portrait ?? <CometEmblem />}</div>
        <figcaption className={styles.caption}>The launch desk</figcaption>
      </figure>
      <h2 id="halley-plate-title" className={styles.title}>What this desk does</h2>
      {!started && (
        <p className={styles.lede}>
          The tape desks price existing tokens. Here, you plan a new tracker and review its projected launch curve.
        </p>
      )}
      <ol className={styles.steps} aria-label={mode === 'live' ? 'Steps to a launch' : 'Steps to a paper launch'}>
        {LAUNCH_STEPS.map((step, index) => {
          const number = index + 1;
          const state = current === 'done' || number < current ? 'done' : number === current ? 'current' : 'todo';
          const live3 = mode === 'live' && number === 3;
          const title = live3 ? 'Review and sign with your wallet'
            : number === 3 ? 'Review the paper projection'
            : step.title;
          const detail = live3
            ? 'Review the projected curve, then continue to the wallet ceremony — your wallet signs the mint.'
            : step.detail;
          /* Rail doubles as wayfinding: steps 1–2 jump to the matching
             slip section, step 3 to the review action. Copy stays verbatim. */
          const target = number === 3 ? 'instruction' : number === 2 ? (draft.quoteSymbol ? 'halley-step-3' : 'halley-step-2') : 'halley-step-1';
          const go = () => {
            const el = document.getElementById(target);
            if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const focusId = number === 1 ? 'halley-name' : number === 2 && draft.quoteSymbol ? 'halley-supply' : undefined;
            if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
          };
          const showDetail = !started || state === 'current';
          return (
            <li key={title} className={styles.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <strong>
                {title}
                {state === 'done' && <span className={styles.srOnly}> (done)</span>}
              </strong>
              {showDetail && <span className={styles.stepDetail}>{detail}</span>}
              {state !== 'todo' && (
                <button type="button" className={styles.stepGo} onClick={go} aria-label={`Go to ${title}`}>
                  {state === 'done' ? 'Review' : 'Continue'} →
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {/* No stamp here: the mode stamp and the slip's foot already say who
          signs (canon rule 5 — one legal stamp, said once). */}
    </section>
  );
}
