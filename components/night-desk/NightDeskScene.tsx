'use client';

import { useEffect, useRef, useState } from 'react';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { NightDeskAnchors, NightDeskSceneController } from '@/lib/night-desk-scene';
import styles from './NightDesk.module.css';

/**
 * Room scene host — CSS fallback covers first paint; WebGL boots eagerly
 * when Room is active. Reduced-motion keeps the fallback only (no WebGL).
 */
export function NightDeskScene({
  view,
  stage,
  onAnchors,
}: {
  view: NightDeskView;
  stage: NightDeskStage;
  onAnchors?: (anchors: NightDeskAnchors) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<NightDeskSceneController | null>(null);
  const viewRef = useRef(view);
  const stageRef = useRef(stage);
  const anchorsRef = useRef(onAnchors);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    viewRef.current = view;
    stageRef.current = stage;
    anchorsRef.current = onAnchors;
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || reducedMotion) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setReady(false);
      return;
    }
    let cancelled = false;
    let controller: NightDeskSceneController | null = null;
    import('@/lib/night-desk-scene')
      .then(module => {
        if (cancelled) return;
        controller = module.createNightDeskScene(
          canvas,
          host,
          viewRef.current,
          () => { if (!cancelled) setReady(true); },
          () => { if (!cancelled) setUnavailable(true); },
          anchors => anchorsRef.current?.(anchors),
        );
        controllerRef.current = controller;
        controller.setView(viewRef.current);
        controller.setStage(stageRef.current);
      })
      .catch(() => { if (!cancelled) setUnavailable(true); });
    return () => {
      cancelled = true;
      controllerRef.current = null;
      controller?.dispose();
      setReady(false);
    };
  }, [reducedMotion]);

  useEffect(() => {
    controllerRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    controllerRef.current?.setStage(stage);
  }, [stage]);

  return (
    <div
      ref={hostRef}
      className={styles.sceneHost}
      data-scene={ready && !unavailable && !reducedMotion ? 'live' : 'static'}
      data-motion={reducedMotion ? 'reduce' : 'full'}
    >
      <div className={styles.fallbackRoom} aria-hidden="true">
        <div className={styles.fallbackWindow}><i /><i /><i /><i /><i /><i /></div>
        <div className={styles.fallbackCity}><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className={styles.fallbackDesk}>
          <i className={styles.fallbackLamp} />
          <i className={styles.fallbackInstrument} />
          <i className={styles.fallbackLedger} />
          <i className={styles.fallbackPhone} />
          <i className={styles.fallbackBlotter} />
        </div>
      </div>
      {!reducedMotion && <canvas ref={canvasRef} className={styles.sceneCanvas} aria-hidden="true" />}
    </div>
  );
}
