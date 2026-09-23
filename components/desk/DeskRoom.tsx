'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { HOUSE, type HouseDesk, type HouseDeskId } from '@/lib/house';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { useRoomTone } from '@/lib/desk-tone';
import { scrollToDeskTarget } from '@/lib/desk/scroll-to';
import { HouseMark } from './HouseMark';
import { BrokerageRoom } from './BrokerageRoom';
import { HouseDirectory } from './HouseDirectory';
import { useHouseScene } from './HouseScene';
import styles from './WorkingDesk.module.css';
import scene from "./DeskScene.module.css";

export function DeskRoom({
  deskId,
  activeDesk,
  open,
  lineLive = false,
  deskStage,
  onSwitchDesk,
  onLeaveDesk,
  showPaperImport = false,
  anonymousCount = 0,
  importStatus = 'idle',
  onImportAnonymous,
  tape,
  tapeAt = null,
  children,
}: {
  deskId: HouseDeskId;
  activeDesk: HouseDesk;
  open: boolean;
  lineLive?: boolean;
  deskStage?: string;
  onSwitchDesk: (id: HouseDeskId) => void;
  onLeaveDesk: () => void;
  showPaperImport?: boolean;
  anonymousCount?: number;
  importStatus?: 'idle' | 'pending' | 'done' | 'failed';
  onImportAnonymous?: () => void;
  /** Reference-tape freshness from the active desk — warms the shared lamp. */
  tape?: 'fresh' | 'stale';
  /** Reading timestamp — a new value re-prints the lamp's fresh glow. */
  tapeAt?: number | null;
  children: ReactNode;
}) {
  const auth = useDeskAuth();
  const tone = useRoomTone(lineLive);
  const sharedScene = useHouseScene({ visible: true, layout: 'compact', view: 'desk', stage: 'arrival', still: true, tape, tapeAt });

  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || !active?.isConnected) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, []);

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
      className={scene.workspace}
      onPointerMove={sharedScene ? undefined : handlePointerMove}
      onPointerLeave={sharedScene ? undefined : handlePointerLeave}
      data-live={lineLive ? 'true' : 'false'}
      data-desk-stage={deskStage}
      data-desk={deskId}
      data-desk-open={open ? 'true' : 'false'}
      data-presentation="compact"
      data-shared-still={sharedScene ? 'true' : undefined}
      data-tape={tape}
    >
      {!sharedScene && (
        <div className={scene.room} aria-hidden="true">
          <div className={scene.window}>
            <i /><i /><i />
            <div className={scene.street}><b /><b /><b /><b /><b /><b /></div>
            <div className={scene.pitGlow} />
          </div>
          <BrokerageRoom />
          <div className={scene.wallPanels} />
          <div className={scene.lightShaft} />
          <div className={scene.lightPool} />
          <div className={scene.tradeLamp} />
        </div>
      )}
      <header className={scene.header}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Claflin home"
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onLeaveDesk();
          }}
        >
          <HouseMark className={styles.houseMark} />
          <span><strong>CLAFLIN</strong><small>{HOUSE.tagline.toUpperCase()}</small></span>
        </Link>
        <nav aria-label="Desk navigation">
          <HouseDirectory activeDeskId={deskId} onVisit={onSwitchDesk} onHome={onLeaveDesk} />
          <button
            type="button"
            className={scene.toneToggle}
            aria-pressed={tone.enabled}
            onClick={() => tone.setEnabled(!tone.enabled)}
          >
            <span className={scene.soundBars} aria-hidden="true"><i /><i /><i /><i /></span>
            {tone.enabled ? (lineLive ? 'Sound paused' : 'Sound on') : 'Sound'}
          </button>
          {auth.enabled && (auth.authenticated ? (
            <span className={scene.authChip}>
              <span className={scene.authLabel} title={auth.label ?? 'Signed in'}>{auth.label ?? 'Signed in'}</span>
              {showPaperImport && anonymousCount > 0 && onImportAnonymous && (
                <button
                  type="button"
                  className={scene.authLink}
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
                <button type="button" className={scene.authLink} onClick={() => { void onImportAnonymous(); }}>
                  Retry import
                </button>
              )}
              {showPaperImport && anonymousCount === 0 && importStatus === 'done' && (
                <span className={scene.authLabel} role="status">Imported</span>
              )}
              <button type="button" onClick={auth.logout}>Sign out</button>
            </span>
          ) : (
            <button
              type="button"
              className={scene.authLink}
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
      <main id="main-content" tabIndex={-1} ref={mainRef} className={scene.main}>
        {children}
      </main>
      <footer className={scene.footer}>
        <span>Your instruction. Your decision.</span>
        <div ref={sealRef} className={scene.seal} data-drawn={sealDrawn ? 'true' : 'false'} aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 56 56" fill="none">
            <path className={scene.sealOuter} d="M28 4 50 17v22L28 52 6 39V17L28 4Z" stroke="currentColor" pathLength={1} />
            <path className={scene.sealMid} d="M28 10 44 20v16L28 46 12 36V20L28 10Z" stroke="currentColor" opacity=".45" pathLength={1} />
            <path className={scene.sealInner} d="M35 20a11 11 0 1 0 0 16M21 14v28M27 12v8m0 16v8M33 15v5m0 16v5" stroke="currentColor" strokeWidth="1.5" pathLength={1} />
          </svg>
        </div>
        {open && (
          <a
            href="#instruction"
            className={scene.footerCta}
            onClick={(e) => {
              e.preventDefault();
              scrollToDeskTarget('instruction', { focusId: 'amount' });
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
