'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DELAYED_TAPE_INTRO,
  DELAYED_TAPE_STEPS,
  DELAYED_TAPE_REVEAL,
  applyDelayedTapeChoice,
  delayedTapeDebrief,
  initialDelayedTapeProgress,
  practiceReturnHref,
  type DelayedTapeChoice,
} from '@/lib/education';
import styles from './DelayedTapePractice.module.css';

/**
 * Practice surface for “the delayed tape.” Separate from the working desk:
 * no ticket, no wallet, no venue. Reached from the tape explanation.
 * Returns to the same instruction with an explicit handoff cue.
 */
export function DelayedTapePractice() {
  const [progress, setProgress] = useState(initialDelayedTapeProgress);
  const step = DELAYED_TAPE_STEPS[progress.stepIndex];

  const choose = (choice: DelayedTapeChoice) => {
    setProgress(current => applyDelayedTapeChoice(current, choice));
  };

  return (
    <div className={styles.shell}>
      <header className={styles.brandBar}>
        <Link href={practiceReturnHref} className={styles.brand}>CLAFLIN</Link>
        <span>Practice · not the desk</span>
        <Link href={practiceReturnHref}>Return to instruction</Link>
      </header>
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.label}>{DELAYED_TAPE_INTRO.label}</p>
          <h1>{DELAYED_TAPE_INTRO.title}</h1>
          <p className={styles.summary}>{DELAYED_TAPE_INTRO.summary}</p>
          <p className={styles.back}>
            Your ticket on the Base desk is unchanged while you are here.
          </p>
        </header>

        {!progress.complete && step && (
          <section className={styles.step} aria-labelledby="step-title">
            <h2 id="step-title">Step {progress.stepIndex + 1} of {DELAYED_TAPE_STEPS.length}</h2>
            <p className={styles.available}><strong>Available now.</strong> {step.available}</p>
            <p className={styles.withheld}><strong>Not yet known.</strong> {step.withheld}</p>
            <p className={styles.prompt}>{step.prompt}</p>
            <div className={styles.choices} role="group" aria-label="Your decision">
              {step.choices.map(choice => (
                <button
                  key={choice.id}
                  type="button"
                  className={styles.choice}
                  onClick={() => choose(choice.id)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {progress.complete && (
          <section className={styles.reveal} aria-labelledby="reveal-title">
            <h2 id="reveal-title">Reveal</h2>
            <p>{DELAYED_TAPE_REVEAL.whatActuallyPrinted}</p>
            <p className={styles.lesson}>{DELAYED_TAPE_REVEAL.lesson}</p>
            <p className={styles.debrief}>{DELAYED_TAPE_REVEAL.debriefPrompt}</p>
            <p className={styles.debriefNote} role="status">{delayedTapeDebrief(progress.choices)}</p>
            <div className={styles.choices}>
              <Link className={styles.primaryLink} href={practiceReturnHref}>
                Return to your instruction
              </Link>
              <button
                type="button"
                className={styles.choice}
                onClick={() => setProgress(initialDelayedTapeProgress())}
              >
                Begin again
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
