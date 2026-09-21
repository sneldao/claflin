'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
};

type HouseSceneApi = {
  update(state: HouseSceneState): void;
  subscribeAnchors(listener: (anchors: NightDeskAnchors) => void): () => void;
};

const INITIAL_SCENE: HouseSceneState = { visible: true, layout: 'foyer', view: 'desk', stage: 'arrival', still: false };

const HouseSceneContext = createContext<HouseSceneApi | null>(null);

export function HouseSceneProvider({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState(INITIAL_SCENE);
  const anchorListeners = useRef(new Set<(anchors: NightDeskAnchors) => void>());
  const update = useCallback((next: HouseSceneState) => setScene(old =>
    old.visible === next.visible
    && old.layout === next.layout
    && old.view === next.view
    && old.stage === next.stage
    && old.still === next.still ? old : next), []);
  const subscribeAnchors = useCallback((listener: (anchors: NightDeskAnchors) => void) => {
    anchorListeners.current.add(listener);
    return () => anchorListeners.current.delete(listener);
  }, []);
  const emitAnchors = useCallback((anchors: NightDeskAnchors) => {
    anchorListeners.current.forEach(listener => listener(anchors));
  }, []);
  const api = useMemo<HouseSceneApi>(() => ({ update, subscribeAnchors }), [update, subscribeAnchors]);
  return (
    <HouseSceneContext.Provider value={api}>
      <div className={styles.house} data-house-scene={scene.layout}>
        <div className={styles.scene} hidden={!scene.visible} aria-hidden="true">
          <NightDeskScene
            view={scene.view}
            stage={scene.stage}
            layout={scene.layout}
            still={scene.still}
            onAnchors={emitAnchors}
          />
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </HouseSceneContext.Provider>
  );
}

export function useHouseScene(state: HouseSceneState) {
  const api = useContext(HouseSceneContext);
  const { visible, layout, view, stage, still } = state;
  useEffect(() => { api?.update({ visible, layout, view, stage, still }); }, [api, visible, layout, view, stage, still]);
  return api !== null;
}

export function useHouseSceneAnchors(onAnchors?: (anchors: NightDeskAnchors) => void) {
  const api = useContext(HouseSceneContext);
  const anchorsRef = useRef(onAnchors);
  useEffect(() => { anchorsRef.current = onAnchors; }, [onAnchors]);
  useEffect(() => api?.subscribeAnchors(anchors => anchorsRef.current?.(anchors)), [api]);
}
