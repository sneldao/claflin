'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { NightDeskLayout } from '@/lib/night-desk-scene';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import styles from './HouseScene.module.css';

export type HouseSceneState = {
  visible: boolean;
  layout: NightDeskLayout;
  view: NightDeskView;
  stage: NightDeskStage;
};

const INITIAL_SCENE: HouseSceneState = { visible: true, layout: 'foyer', view: 'desk', stage: 'arrival' };

const HouseSceneContext = createContext<((state: HouseSceneState) => void) | null>(null);

export function HouseSceneProvider({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState(INITIAL_SCENE);
  const update = useCallback((next: HouseSceneState) => setScene(old =>
    old.visible === next.visible && old.layout === next.layout && old.view === next.view && old.stage === next.stage ? old : next), []);
  return (
    <HouseSceneContext.Provider value={update}>
      <div className={styles.house} data-house-scene={scene.layout}>
        <div className={styles.scene} hidden={!scene.visible} aria-hidden="true">
          <NightDeskScene view={scene.view} stage={scene.stage} layout={scene.layout} />
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </HouseSceneContext.Provider>
  );
}

export function useHouseScene(state: HouseSceneState) {
  const update = useContext(HouseSceneContext);
  const { visible, layout, view, stage } = state;
  useEffect(() => { update?.({ visible, layout, view, stage }); }, [update, visible, layout, view, stage]);
  return update !== null;
}
