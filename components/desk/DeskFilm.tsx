'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HouseDeskId } from '@/lib/house';
import { DESK_FILMS } from '@/lib/desk-films';
import scene from './DeskScene.module.css';

/**
 * The desk's film — a chip in the desk nav that opens the character card
 * in an overlay. Renders nothing for desks without a card. The video is
 * inert until chosen: poster only, no preload.
 */
export function DeskFilm({ deskId }: { deskId: HouseDeskId }) {
  const film = DESK_FILMS[deskId];
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const close = useCallback(() => {
    videoRef.current?.pause();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!film) return null;
  return (
    <>
      <button
        type="button"
        className={scene.authLink}
        onClick={() => setOpen(true)}
        title="The desk's card — who Jesse was, and what the desk borrows from him"
      >
        The film · {film.length}
      </button>
      {open && (
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
              <p className={scene.filmNote}>An AI character of the house — not the historical Jesse Livermore.</p>
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
      )}
    </>
  );
}
