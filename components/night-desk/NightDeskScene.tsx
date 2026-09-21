'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { NightDeskAnchors, NightDeskLayout, NightDeskSceneController } from '@/lib/night-desk-scene';
import styles from './NightDesk.module.css';

/**
 * Room scene host — CSS fallback covers first paint; WebGL boots eagerly
 * when Room is active. Reduced-motion keeps the fallback only (no WebGL).
 */
export function NightDeskScene({
  view,
  stage,
  layout = 'room',
  onAnchors,
}: {
  view: NightDeskView;
  stage: NightDeskStage;
  layout?: NightDeskLayout;
  onAnchors?: (anchors: NightDeskAnchors) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<NightDeskSceneController | null>(null);
  const viewRef = useRef(view);
  const stageRef = useRef(stage);
  const layoutRef = useRef(layout);
  const anchorsRef = useRef(onAnchors);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    viewRef.current = view;
    stageRef.current = stage;
    layoutRef.current = layout;
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
    if (!host || !canvas || reducedMotion !== false) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setReady(false);
      return;
    }
    let cancelled = false;
    let controller: NightDeskSceneController | null = null;
    setUnavailable(false);
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
          layoutRef.current,
        );
        controllerRef.current = controller;
        controller.setView(viewRef.current);
        controller.setStage(stageRef.current);
        controller.setLayout(layoutRef.current);
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

  useEffect(() => {
    controllerRef.current?.setLayout(layout);
  }, [layout]);

  return (
    <div
      ref={hostRef}
      className={styles.sceneHost}
      data-scene={ready && !unavailable && reducedMotion === false ? 'live' : 'static'}
      data-motion={reducedMotion === null ? 'pending' : reducedMotion ? 'reduce' : 'full'}
      data-layout={layout}
    >
      <div className={styles.fallbackRoom} aria-hidden="true">
        {layout === 'foyer' && (
          <Image
            className={styles.fallbackReceiver}
            src="/desk-receiver.webp"
            alt=""
            width={960}
            height={540}
            sizes="(max-width: 760px) 80vw, 44vw"
          />
        )}
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
      {reducedMotion === false && <canvas ref={canvasRef} className={styles.sceneCanvas} aria-hidden="true" />}
    </div>
  );
}
