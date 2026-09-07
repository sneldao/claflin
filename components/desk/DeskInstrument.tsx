'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { DeskInstrumentController, DeskInstrumentStage } from '@/lib/desk-instrument';
import styles from './DeskInstrument.module.css';

function stageCaption(stage: DeskInstrumentStage) {
  if (stage === 'confirmation') return 'REVIEW INSTRUCTION';
  if (stage === 'conversation') return 'CONVERSATION STUDY';
  return 'HETTY — AT THE DESK';
}

export const DeskInstrument = memo(function DeskInstrument({ stage, label = 'PAPER TRADING / NO LIVE ORDERS' }: { stage: DeskInstrumentStage; label?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<DeskInstrumentController | null>(null);
  const stageRef = useRef(stage);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [allowScene, setAllowScene] = useState(false);

  useEffect(() => {
    stageRef.current = stage;
    controllerRef.current?.setStage(stage);
  }, [stage]);

  // Label changes repaint the instrument display in place — they must not
  // tear down and recreate the whole Three.js scene on every selection.
  useEffect(() => {
    controllerRef.current?.setLabel(label);
  }, [label]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Defer Three.js until the instrument is on-screen and the main thread is idle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || reducedMotion) {
      setAllowScene(false);
      return;
    }
    let cancelled = false;
    let idleId = 0;
    let timeoutId = 0;
    const arm = () => {
      if (cancelled || allowScene) return;
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof win.requestIdleCallback === 'function') {
        idleId = win.requestIdleCallback(() => { if (!cancelled) setAllowScene(true); }, { timeout: 1200 });
      } else {
        timeoutId = window.setTimeout(() => { if (!cancelled) setAllowScene(true); }, 200);
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        io.disconnect();
        arm();
      }
    }, { rootMargin: '80px' });
    io.observe(host);
    return () => {
      cancelled = true;
      io.disconnect();
      const win = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (idleId && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  // allowScene omitted intentionally — arm once per mount/reducedMotion flip
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || reducedMotion || !allowScene) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setReady(false);
      return;
    }

    import('@/lib/desk-instrument').then(({ createDeskInstrument }) => {
      if (cancelled) return;
      controllerRef.current = createDeskInstrument(canvas, host, stageRef.current, () => setReady(false), label);
      setReady(true);
    }).catch(() => {
      if (!cancelled) setReady(false);
    });

    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  // label is applied live via setLabel — recreating the scene per label
  // change would restart the instrument on every stock selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, allowScene]);

  return (
    <div
      ref={hostRef}
      className={styles.instrument}
      data-ready={ready && !reducedMotion}
      data-stage={stage}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className={styles.instrumentFallback}>
        <div className={styles.fallbackReceiver}><i /><i /></div>
        <div className={styles.fallbackBody}>
          <span className={styles.fallbackDisplay}>
            CLAFLIN
            <br />
            <strong>{stageCaption(stage)}</strong>
            <small>{label}</small>
          </span>
          <span className={styles.fallbackDial} />
          <span className={styles.fallbackEdge} />
        </div>
      </div>
      <canvas ref={canvasRef} className={styles.instrumentCanvas} aria-hidden="true" />
    </div>
  );
});
