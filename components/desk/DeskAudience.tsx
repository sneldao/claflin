'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/api-client';
import { HETTY_BROADCAST_ENABLED } from '@/lib/hetty/broadcast-flags';
import { joinObservedRoom, type DeskObserver } from '@/lib/hetty/observe';
import { audienceLinkFor, isLivekitRoomName } from '@/lib/hetty/room-name';
import { onSceneDrive } from '@/lib/desk/scene-drive';
import styles from './DeskAudience.module.css';

type Phase = 'idle' | 'connecting' | 'live' | 'blocked' | 'ended' | 'failed';

/**
 * The observer's door. It appears only when the URL carries a room name that
 * the server would accept, and it never joins on its own: opening the page is
 * not consent to start audio, so Listen is a deliberate press and the browser
 * treats it as the gesture that allows sound.
 *
 * Every line of copy here states what is actually true of the line. "Listening"
 * means the room is joined and audio is running, not that the page is open.
 */
export function DeskAudience() {
  const [room, setRoom] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [count, setCount] = useState(0);
  const observerRef = useRef<DeskObserver | null>(null);

  useEffect(() => {
    if (!HETTY_BROADCAST_ENABLED) return;
    const requested = new URLSearchParams(window.location.search).get('room');
    setRoom(requested && isLivekitRoomName(requested) ? requested : null);
  }, []);

  /* The door reads the same bus the scene does: the broker's line and her
     cadence arrive on it whether this browser is the host or a listener.
     A muted or blocked listener still gets the words. */
  useEffect(() => onSceneDrive(event => {
    if (event.type === 'line') setLine(event.text);
    else if (event.type === 'speech' || event.type === 'speech-activity') setSpeaking(true);
    else if (event.type === 'speech-end') setSpeaking(false);
  }), []);

  const leave = useCallback(() => {
    const observer = observerRef.current;
    observerRef.current = null;
    if (observer) void observer.stop();
    setPhase('idle');
    setNote(null);
    setLine(null);
    setSpeaking(false);
    setCount(0);
  }, []);

  /* A page that unmounts mid-listen must not leave audio playing. */
  useEffect(() => () => { void observerRef.current?.stop(); observerRef.current = null; }, []);

  const listen = useCallback(async () => {
    if (!room || phase === 'connecting') return;
    if (observerRef.current) {
      /* Re-press after a blocked start is the gesture the browser wanted. */
      const audible = await observerRef.current.startAudio();
      setPhase(audible ? 'live' : 'blocked');
      setNote(audible ? null : 'Your browser is blocking the sound. Press Listen again to allow it.');
      return;
    }
    setPhase('connecting');
    setNote(null);
    const minted = await fetchJson<{ url?: string; token?: string }>('/api/hetty/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'observer', room }),
      cache: 'no-store',
    });
    if (!minted.ok || !minted.data.url || !minted.data.token) {
      setPhase('failed');
      setNote(minted.ok ? 'The room is not open right now.' : minted.error.message);
      return;
    }
    try {
      const observer = await joinObservedRoom({ url: minted.data.url, token: minted.data.token, room });
      observerRef.current = observer;
      /* The broadcast ending under us is not a failure — it is the desk
         closing or the line dropping, and the bar says which. */
      observer.onEnded(reason => {
        observerRef.current = null;
        void observer.stop();
        setPhase('ended');
        setSpeaking(false);
        setCount(0);
        setNote(reason === 'closed'
          ? 'The host has closed the desk.'
          : 'The line went quiet — the broadcast may be over.');
      });
      /* The room's own count, live — a listener sees the audience they
         joined, not a guess at one. Fires once immediately. */
      observer.onAudience(setCount);
      const audible = observer.audible();
      setPhase(audible ? 'live' : 'blocked');
      setNote(audible ? null : 'Your browser is blocking the sound. Press Listen again to allow it.');
    } catch {
      setPhase('failed');
      setNote('The room could not be opened. The link may have closed.');
    }
  }, [room, phase]);

  if (!room) return null;

  const copy = phase === 'live'
    ? `Listening to the desk.${count > 1 ? ` ${count} listening.` : ''}`
    : phase === 'connecting'
      ? 'Opening the room…'
      : phase === 'blocked'
        ? 'In the room, sound blocked.'
        : phase === 'ended'
          ? 'The broadcast is over.'
          : phase === 'failed'
            ? 'The room did not open.'
            : 'This link is an open room at the desk.';
  /* Blocked is still "in the room": the retry resumes audio, it does not
     re-join. Only a live line offers Leave, so nobody drops by accident. */
  const action = phase === 'live'
    ? { label: 'Leave', run: leave }
    : { label: phase === 'blocked' ? 'Listen again' : 'Listen', run: () => void listen() };

  return (
    <div className={styles.audience} data-live={phase === 'live' ? 'true' : 'false'} data-speaking={speaking ? 'true' : 'false'} role="status" aria-live="polite">
      <span className={styles.lamp} aria-hidden="true" />
      <p className={styles.copy}>{copy}</p>
      <button type="button" className={styles.action} onClick={action.run} disabled={phase === 'connecting'}>
        {action.label}
      </button>
      {(phase === 'live' || phase === 'blocked') && line && (
        <p className={styles.caption}><span className={styles.captionSpeaker}>Hetty</span>{line}</p>
      )}
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}

/**
 * The host's side of the same door: the link to share and how many people are
 * in the room. Both are facts from the room itself — the count is the room's
 * participant count, not an estimate.
 */
export function DeskAudienceShare({ room, listening }: { room: string; listening: number }) {
  const [copied, setCopied] = useState(false);
  const link = audienceLinkFor(room, window.location.origin);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [link]);

  return (
    <div className={styles.share} aria-label="Audience">
      <div className={styles.shareHead}>
        <span className={styles.lamp} data-live="true" aria-hidden="true" />
        <span className={styles.shareTitle}>Audience</span>
        <span className={styles.count} role="status">
          {listening === 0 ? 'No one yet' : listening === 1 ? '1 listening' : `${listening} listening`}
        </span>
      </div>
      <div className={styles.shareRow}>
        <input
          className={styles.link}
          value={link}
          readOnly
          aria-label="Audience link"
          onFocus={event => event.currentTarget.select()}
        />
        <button type="button" className={styles.action} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
