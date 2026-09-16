'use client';

import { useEffect, useRef, useState } from 'react';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { NightDeskAnchors, NightDeskSceneController } from '@/lib/night-desk-scene';
import styles from './NightDesk.module.css';

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

  useEffect(() => {
    viewRef.current = view;
    stageRef.current = stage;
    anchorsRef.current = onAnchors;
  });

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
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
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    controllerRef.current?.setStage(stage);
  }, [stage]);

  return (
    <div ref={hostRef} className={styles.sceneHost} data-scene={ready && !unavailable ? 'live' : 'static'}>
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
      <canvas ref={canvasRef} className={styles.sceneCanvas} aria-hidden="true" />
    </div>
  );
}
