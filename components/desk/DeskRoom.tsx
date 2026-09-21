'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { HOUSE, type HouseDesk, type HouseDeskId } from '@/lib/house';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { useRoomTone } from '@/lib/desk-tone';
import { HouseMark } from './HouseMark';
import { BrokerageRoom } from './BrokerageRoom';
import { HouseDirectory } from './HouseDirectory';
import styles from './WorkingDesk.module.css';

export function DeskRoom({
  deskId,
  activeDesk,
  open,
  lineLive = false,
  deskStage,
  onSwitchDesk,
  showPaperImport = false,
  anonymousCount = 0,
  importStatus = 'idle',
  onImportAnonymous,
  navExtras,
  children,
}: {
  deskId: HouseDeskId;
  activeDesk: HouseDesk;
  open: boolean;
  lineLive?: boolean;
  deskStage?: string;
  onSwitchDesk: (id: HouseDeskId) => void;
  showPaperImport?: boolean;
  anonymousCount?: number;
  importStatus?: 'idle' | 'pending' | 'done' | 'failed';
  onImportAnonymous?: () => void;
  navExtras?: ReactNode;
  children: ReactNode;
}) {
  const auth = useDeskAuth();
  const tone = useRoomTone(lineLive);

  const [sealDrawn, setSealDrawn] = useState(false);
  const sealRef = useRef<HTMLDivElement>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const el = sealRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setSealDrawn(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSealDrawn(true); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const parallax = useRef({ px: 0, py: 0, raf: 0 });
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const p = parallax.current;
    p.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    p.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (p.raf) return;
    p.raf = requestAnimationFrame(() => {
      p.raf = 0;
      el.style.setProperty('--px', String(p.px));
      el.style.setProperty('--py', String(p.py));
    });
  }, []);
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(parallax.current.raf);
    parallax.current.raf = 0;
    e.currentTarget.style.setProperty('--px', '0');
    e.currentTarget.style.setProperty('--py', '0');
  }, []);
  useEffect(() => () => cancelAnimationFrame(parallax.current.raf), []);

  return (
    <div
      className={styles.workspace}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-live={lineLive ? 'true' : 'false'}
      data-desk-stage={deskStage}
      data-desk={deskId}
      data-desk-open={open ? 'true' : 'false'}
    >
      <div className={styles.room} aria-hidden="true">
        <div className={styles.window}>
          <i /><i /><i />
          <div className={styles.street}><b /><b /><b /><b /><b /><b /></div>
          <div className={styles.pitGlow} />
        </div>
        <BrokerageRoom />
        <div className={styles.wallPanels} />
        <div className={styles.lightShaft} />
        <div className={styles.lightPool} />
        <div className={styles.tradeLamp} />
      </div>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Claflin home">
          <HouseMark className={styles.houseMark} />
          <span><strong>CLAFLIN</strong><small>{HOUSE.tagline.toUpperCase()}</small></span>
        </Link>
        <nav aria-label="Desk navigation">
          <HouseDirectory activeDeskId={deskId} onVisit={onSwitchDesk} />
          {navExtras}
          <button
            type="button"
            className={styles.toneToggle}
            aria-pressed={tone.enabled}
            onClick={() => tone.setEnabled(!tone.enabled)}
          >
            <span className={styles.soundBars} aria-hidden="true"><i /><i /><i /><i /></span>
            {tone.enabled ? (lineLive ? 'Sound paused' : 'Sound on') : 'Sound'}
          </button>
          {auth.enabled && (auth.authenticated ? (
            <span className={styles.authChip}>
              <span className={styles.authLabel} title={auth.label ?? 'Signed in'}>{auth.label ?? 'Signed in'}</span>
              {showPaperImport && anonymousCount > 0 && onImportAnonymous && (
                <button
                  type="button"
                  className={styles.authLink}
                  disabled={importStatus === 'pending'}
                  onClick={() => { void onImportAnonymous(); }}
                  title={`Import ${anonymousCount} paper ${anonymousCount === 1 ? 'record' : 'records'} left on this browser before you signed in`}
                >
                  {importStatus === 'pending'
                    ? 'Importing…'
                    : `Import ${anonymousCount} paper ${anonymousCount === 1 ? 'record' : 'records'}`}
                </button>
              )}
              {showPaperImport && anonymousCount === 0 && importStatus === 'failed' && onImportAnonymous && (
                <button type="button" className={styles.authLink} onClick={() => { void onImportAnonymous(); }}>
                  Retry import
                </button>
              )}
              {showPaperImport && anonymousCount === 0 && importStatus === 'done' && (
                <span className={styles.authLabel} role="status">Imported</span>
              )}
              <button type="button" onClick={auth.logout}>Sign out</button>
            </span>
          ) : (
            <button
              type="button"
              className={styles.authLink}
              onClick={auth.login}
              title={showPaperImport
                ? "Optional. Keeps your paper record and Hetty's saved lines on your account instead of only this browser."
                : 'Optional account sign-in. Jesse paper records stay in this browser.'}
            >
              Sign in to keep your record
            </button>
          ))}
        </nav>
      </header>
      <main id="main-content" className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <span>Your instruction. Your decision.</span>
        <div ref={sealRef} className={styles.seal} data-drawn={sealDrawn ? 'true' : 'false'} aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 56 56" fill="none">
            <path className={styles.sealOuter} d="M28 4 50 17v22L28 52 6 39V17L28 4Z" stroke="currentColor" pathLength={1} />
            <path className={styles.sealMid} d="M28 10 44 20v16L28 46 12 36V20L28 10Z" stroke="currentColor" opacity=".45" pathLength={1} />
            <path className={styles.sealInner} d="M35 20a11 11 0 1 0 0 16M21 14v28M27 12v8m0 16v8M33 15v5m0 16v5" stroke="currentColor" strokeWidth="1.5" pathLength={1} />
          </svg>
        </div>
        {open && (
          <a
            href="#instruction"
            className={styles.footerCta}
            onClick={(e) => {
              e.preventDefault();
              const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
              document.getElementById('amount')?.focus({ preventScroll: true });
            }}
          >
            Back to your ticket ↑
          </a>
        )}
        <span>THE OFFICE ABOVE THE PIT</span>
      </footer>
    </div>
  );
}
