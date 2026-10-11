'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { DeskFilm } from '@/lib/desk-films';
import scene from './DeskScene.module.css';

/**
 * The desk's card playing — a paper-framed overlay opened only from the
 * verso of a foyer card. Mounted on choice: the video is inert until the
 * caller asks for it (poster first, metadata preload only).
 */
export function FilmOverlay({ film, onClose }: { film: DeskFilm; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const close = useCallback(() => {
    videoRef.current?.pause();
    onClose();
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className={scene.filmOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="The desk's card"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={scene.filmFrame}>
        <video
          ref={videoRef}
          src={film.src}
          poster={film.poster}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className={scene.filmVideo}
        />
        <div className={scene.filmFoot}>
          <p className={scene.filmNote}>An AI character of the house — not the historical {film.namesake}.</p>
          <details className={scene.filmTranscript}>
            <summary>Narration</summary>
            <p>{film.transcript}</p>
          </details>
          <button ref={closeRef} type="button" className={scene.filmClose} onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
