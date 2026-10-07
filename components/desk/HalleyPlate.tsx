'use client';

import type { ReactNode } from 'react';
import type { HalleyDraft } from '@/lib/meteora/contracts';
import { LAUNCH_STEPS, launchStep, type PlateStage } from '@/lib/meteora/plate';
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
export function HalleyPlate({ stage, draft, portrait }: {
  stage: PlateStage;
  draft: HalleyDraft;
  /** Optional replacement for the emblem, e.g. a future character. */
  portrait?: ReactNode;
}) {
  const current = launchStep(stage, draft);
  return (
    <section className={styles.plate} aria-labelledby="halley-plate-title">
      <figure className={styles.portrait}>
        <div className={styles.frame}>{portrait ?? <CometEmblem />}</div>
        <figcaption className={styles.caption}>The launch desk</figcaption>
      </figure>
      <h2 id="halley-plate-title" className={styles.title}>What this desk does</h2>
      <p className={styles.lede}>
        The tape desks price existing tokens. Here, you plan a new tracker and review its projected launch curve.
      </p>
      <ol className={styles.steps} aria-label="Steps to a paper launch">
        {LAUNCH_STEPS.map((step, index) => {
          const number = index + 1;
          const state = current === 'done' || number < current ? 'done' : number === current ? 'current' : 'todo';
          return (
            <li key={step.title} className={styles.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <strong>
                {step.title}
                {state === 'done' && <span className={styles.srOnly}> (done)</span>}
              </strong>
              {step.detail}
            </li>
          );
        })}
      </ol>
      <p className={styles.stamp}>Paper only · no token is minted</p>
    </section>
  );
}
