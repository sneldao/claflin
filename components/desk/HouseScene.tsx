'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GRAPHICS_STORAGE_KEY, parseGraphicsPreference, shouldUseLightweightGraphics, type GraphicsPreference } from '@/lib/desk/graphics';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { NightDeskAnchors, NightDeskLayout } from '@/lib/night-desk-scene';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import styles from './HouseScene.module.css';

export type HouseSceneState = {
  visible: boolean;
  layout: NightDeskLayout;
  view: NightDeskView;
  stage: NightDeskStage;
  /** A composed CSS room without mounting the animated WebGL surface. */
  still: boolean;
  /** Reference-tape freshness from the active desk — the room's lamp warms on it. */
  tape?: 'fresh' | 'stale';
  /** Reading timestamp — a new value re-prints the lamp's fresh glow. */
  tapeAt?: number | null;
};

type HouseSceneApi = {
  update(state: HouseSceneState): void;
  subscribeAnchors(listener: (anchors: NightDeskAnchors) => void): () => void;
  /** Scroll-driven camera walk — progress 0..1 through the room's poses,
      `null` hands the camera back to discrete views. No-op without WebGL. */
  setTour(progress: number | null): void;
};

const INITIAL_SCENE: HouseSceneState = { visible: true, layout: 'foyer', view: 'desk', stage: 'arrival', still: false };

const HouseSceneContext = createContext<HouseSceneApi | null>(null);

type HouseGraphicsApi = {
  preference: GraphicsPreference;
  setPreference(preference: GraphicsPreference): void;
  lightweight: boolean;
  ready: boolean;
  inside: boolean;
};

const HouseGraphicsContext = createContext<HouseGraphicsApi | null>(null);
const OUTSIDE_PROVIDER_GRAPHICS: HouseGraphicsApi = { preference: 'auto', setPreference: () => {}, lightweight: true, ready: false, inside: false };

function readSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as { connection?: { saveData?: unknown } }).connection;
  return connection?.saveData === true;
}

function useGraphicsState(): HouseGraphicsApi {
  const [preference, setPreferenceState] = useState<GraphicsPreference>('auto');
  const [ready, setReady] = useState(false);
  const [signals, setSignals] = useState({ reducedMotion: false, coarsePointer: false, saveData: false });

  useEffect(() => {
    const stored = (() => {
      try { return window.localStorage.getItem(GRAPHICS_STORAGE_KEY); } catch { return null; }
    })();
    setPreferenceState(parseGraphicsPreference(stored));
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const update = () => setSignals({
      reducedMotion: motion.matches,
      coarsePointer: pointer.matches,
      saveData: readSaveData(),
    });
    update();
    const connection = (navigator as { connection?: { addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void } }).connection;
    const onStorage = (event: StorageEvent) => {
      if (event.key === GRAPHICS_STORAGE_KEY) setPreferenceState(parseGraphicsPreference(event.newValue));
    };
    motion.addEventListener('change', update);
    pointer.addEventListener('change', update);
    connection?.addEventListener?.('change', update);
    window.addEventListener('storage', onStorage);
    setReady(true);
    return () => {
      motion.removeEventListener('change', update);
      pointer.removeEventListener('change', update);
      connection?.removeEventListener?.('change', update);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setPreference = useCallback((next: GraphicsPreference) => {
    setPreferenceState(next);
    try { window.localStorage.setItem(GRAPHICS_STORAGE_KEY, next); } catch {}
  }, []);

  return useMemo(() => ({
    preference,
    setPreference,
    lightweight: shouldUseLightweightGraphics(preference, signals),
    ready,
    inside: true,
  }), [preference, setPreference, signals, ready]);
}

export function HouseSceneProvider({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState(INITIAL_SCENE);
  const graphics = useGraphicsState();
  const anchorListeners = useRef(new Set<(anchors: NightDeskAnchors) => void>());
  const controllerRef = useRef<import('@/lib/night-desk-scene').NightDeskSceneController | null>(null);
  /* The WebGL controller mounts after first paint — replay the last tour
     position on (re)registration so a mid-page load lands mid-walk. */
  const lastTour = useRef<number | null>(null);
  const update = useCallback((next: HouseSceneState) => setScene(old =>
    old.visible === next.visible
    && old.layout === next.layout
    && old.view === next.view
    && old.stage === next.stage
    && old.still === next.still
    && old.tape === next.tape
    && old.tapeAt === next.tapeAt ? old : next), []);
  const subscribeAnchors = useCallback((listener: (anchors: NightDeskAnchors) => void) => {
    anchorListeners.current.add(listener);
    return () => anchorListeners.current.delete(listener);
  }, []);
  const emitAnchors = useCallback((anchors: NightDeskAnchors) => {
    anchorListeners.current.forEach(listener => listener(anchors));
  }, []);
  const setTour = useCallback((progress: number | null) => {
    lastTour.current = progress;
    controllerRef.current?.setTour(progress);
  }, []);
  const api = useMemo<HouseSceneApi>(() => ({ update, subscribeAnchors, setTour }), [update, subscribeAnchors, setTour]);
  return (
    <HouseSceneContext.Provider value={api}>
      <HouseGraphicsContext.Provider value={graphics}>
        <div className={styles.house} data-house-scene={scene.layout}>
          <div className={styles.scene} hidden={!scene.visible} aria-hidden="true">
            <NightDeskScene
              view={scene.view}
              stage={scene.stage}
              layout={scene.layout}
              still={scene.still || !graphics.ready || graphics.lightweight}
              tape={scene.tape}
              tapeAt={scene.tapeAt}
              onAnchors={emitAnchors}
              onController={controller => {
                controllerRef.current = controller;
                if (controller && lastTour.current !== null) controller.setTour(lastTour.current);
              }}
            />
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      </HouseGraphicsContext.Provider>
    </HouseSceneContext.Provider>
  );
}

export function useHouseScene(state: HouseSceneState) {
  const api = useContext(HouseSceneContext);
  const { visible, layout, view, stage, still, tape, tapeAt } = state;
  useEffect(() => { api?.update({ visible, layout, view, stage, still, tape, tapeAt }); }, [api, visible, layout, view, stage, still, tape, tapeAt]);
  return api !== null;
}

export function useHouseGraphics(): HouseGraphicsApi {
  return useContext(HouseGraphicsContext) ?? OUTSIDE_PROVIDER_GRAPHICS;
}

/** The scene api itself — for imperative drives like the scroll walk. */
export function useHouseSceneApi(): HouseSceneApi | null {
  return useContext(HouseSceneContext);
}

export function useHouseSceneAnchors(onAnchors?: (anchors: NightDeskAnchors) => void) {
  const api = useContext(HouseSceneContext);
  const anchorsRef = useRef(onAnchors);
  useEffect(() => { anchorsRef.current = onAnchors; }, [onAnchors]);
  useEffect(() => api?.subscribeAnchors(anchors => anchorsRef.current?.(anchors)), [api]);
}
