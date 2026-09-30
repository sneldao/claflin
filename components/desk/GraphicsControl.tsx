'use client';

import { useId } from 'react';
import { useHouseGraphics } from './HouseScene';
import type { GraphicsPreference } from '@/lib/desk/graphics';
import styles from './GraphicsControl.module.css';

export function GraphicsControl({ className }: { className?: string }) {
  const graphics = useHouseGraphics();
  const selectId = useId();
  if (!graphics.inside) return null;
  return (
    <details className={`${styles.control}${className ? ` ${className}` : ''}`}>
      <summary className={styles.summary}>Graphics</summary>
      <div className={styles.panel}>
        <label className={styles.label} htmlFor={selectId}>Scene graphics</label>
        <select
          id={selectId}
          className={styles.select}
          value={graphics.preference}
          disabled={!graphics.ready}
          onChange={event => graphics.setPreference(event.target.value as GraphicsPreference)}
        >
          <option value="auto">Automatic</option>
          <option value="lightweight">Lightweight</option>
          <option value="full">Full scene</option>
        </select>
        <p className={styles.status}>{
          !graphics.ready
            ? 'Reading graphics preference…'
            : graphics.lightweight
              ? 'Lightweight graphics — trading unchanged.'
              : 'Full graphics allowed — trading unchanged.'
        }</p>
      </div>
    </details>
  );
}
