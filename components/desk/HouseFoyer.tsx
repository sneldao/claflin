'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { DESK_CAPABILITIES, HOUSE_DESKS, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { useMarketBell } from '@/lib/use-market-clock';
import { bellLine } from '@/lib/market-clock';
import { requestRingOnArrival } from '@/lib/trading/line-signal';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { markPrice, type DeskMark, type MarksResult } from '@/lib/trading/marks-shared';
import { offeringForInstrument } from '@/lib/desk/offerings';
import { FOYER_BOUNDARY, FOYER_HEADLINES, FOYER_LEDE, WIRE_GAP_REFERENCE } from '@/lib/desk/ui-copy';
import { entryIntentFromInstruction, entryIntentWithInstruction, type EntryIntent } from '@/lib/house-entry';
import { soleOfferingForDesk } from '@/lib/desk/offerings-presentation';
import { instructionMatch, readInstruction } from '@/lib/desk/turret';
import { trackFunnel, trackInstruction } from '@/lib/funnel/client';
import { useLatestFiling } from '@/lib/trading/useLatestFiling';
import { LastFilingLine } from './LastFilingLine';
import { HouseMark } from './HouseMark';
import { useHouseGraphics, useHouseScene, useHouseSceneApi } from './HouseScene';
import { GraphicsControl } from './GraphicsControl';
import { HouseOfferings } from './HouseOfferings';
import { HouseTurret } from './HouseTurret';
import { HouseDesks } from './HouseDesks';
import { HouseAnswers } from './HouseAnswers';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import foyerStyles from './HouseFoyer.module.css';

type WireMark = { key: string; rail: 'BASE' | 'SOL' | 'RH'; mark: DeskMark };

/** The house-book instruction a wire mark stands for — the plain underlying ticker. */
function instructionForMark(mark: DeskMark): string {
  return offeringForInstrument(mark.instrumentId)?.underlyingSymbol
    ?? mark.symbol.replace(/[a-z]+$/, '');
}

/**
 * Claflin foyer — the market and the brokers' lines are the hero: a live
 * market clock, the tape, and one card per desk whose line is connected.
 */
export function HouseFoyer({ onEnter }: { onEnter: (id: HouseDeskId, offeringId?: string, intent?: EntryIntent | null, recordId?: string | null) => void }) {
  const openDesks = HOUSE_DESKS.filter(desk => isOpenDesk(desk.id));
  const planned = HOUSE_DESKS.filter(desk => !isOpenDesk(desk.id));
  /* Every open desk gets a line — voice desks take calls, typed-only desks
     like Isabel take instructions. The turret renders the affordance each
     desk actually has. */
  const lineDesks = openDesks;

  /* Same landing discipline as the desk rooms — focus the work, not the chrome. */
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || !active?.isConnected) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, []);

  /* The clock's line needs a Date — null on the server so SSR and first
     paint agree on the fallback kicker. */
  const market = useMarketBell();
  const clock = market?.clock ?? null;
  const [headlineTop, headlineBottom] = FOYER_HEADLINES[clock?.exchange ?? 'pending'];
  const jesseOpen = isOpenDesk('jesse');
  const isabelOpen = isOpenDesk('isabel');
  const hettyMarks = useReferenceMarks('hetty');
  const jesseMarksRead = useReferenceMarks(jesseOpen ? 'jesse' : 'hetty');
  const jesseMarks = jesseOpen ? jesseMarksRead : null;
  const isabelMarksRead = useReferenceMarks(isabelOpen ? 'isabel' : 'hetty');
  const isabelMarks = isabelOpen ? isabelMarksRead : null;
  /* The house-book instruction lives here so a wire-mark click can write it. */
  const [wireInstruction, setWireInstruction] = useState('');
  const [instructionSource, setInstructionSource] = useState<'spoken' | 'typed' | 'picked'>('typed');
  const setInstruction = (text: string, source: 'spoken' | 'typed') => {
    setWireInstruction(text);
    setInstructionSource(source);
  };
  const filing = useLatestFiling();

  /* The funnel counts each distinct instruction once, however it arrived.
     Only the house book's answer (none/one/several) is sent, never the words. */
  const committed = useRef<string | null>(null);
  const commitInstruction = (text: string, source: 'spoken' | 'typed' | 'picked') => {
    const key = text.trim().toLowerCase();
    const matched = instructionMatch(readInstruction(text));
    if (!key || !matched || key === committed.current) return;
    committed.current = key;
    trackInstruction(source, matched);
  };
  const pickFromWire = (instruction: string) => {
    setWireInstruction(instruction);
    setInstructionSource('picked');
    commitInstruction(instruction, 'picked');
  };

  const sharedScene = useHouseScene({ visible: true, layout: 'foyer', view: 'desk', stage: 'arrival', still: false });
  const graphics = useHouseGraphics();
  const sceneApi = useHouseSceneApi();

  /* The scroll walk: descending the foyer rides the camera along a curve
     through the room's poses (desk → evidence → review → ledger). Passive,
     rAF-throttled, and a no-op when the scene is still/lightweight. */
  useEffect(() => {
    if (!sceneApi) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      sceneApi.setTour(range > 0 ? window.scrollY / range : 0);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true });
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      sceneApi.setTour(null);
    };
  }, [sceneApi]);

  /* Focus pull — the room nearest the reading plane stays lit while its
     neighbors fall into lamp-low shadow via a --room-dim veil. DOM-only so
     it works in still mode; skipped under reduced motion. */
  useEffect(() => {
    const main = mainRef.current;
    if (!main || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rooms = Array.from(main.children) as HTMLElement[];
    let raf = 0;
    const measure = () => {
      raf = 0;
      const focal = window.innerHeight * 0.5;
      const band = window.innerHeight * 0.3;
      for (const room of rooms) {
        const box = room.getBoundingClientRect();
        const center = box.top + box.height / 2;
        const dist = Math.max(0, Math.abs(center - focal) - band) / window.innerHeight;
        room.style.setProperty('--room-dim', Math.min(0.42, dist * 1.4).toFixed(3));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
      for (const room of rooms) room.style.removeProperty('--room-dim');
    };
  }, []);

  /* Inertial scroll — the page glides and settles at room boundaries
     (proximity snap only, so a gesture far from a boundary is never
     claimed). Reduced motion keeps the browser's native scroll. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let lenis: { destroy(): void } | null = null;
    let snap: { destroy(): void } | null = null;
    let cancelled = false;
    void Promise.all([import('lenis'), import('lenis/snap')])
      .then(([lenisModule, snapModule]) => {
        if (cancelled || !mainRef.current) return;
        const instance = new lenisModule.default({ autoRaf: true, duration: 1.1, smoothWheel: true });
        lenis = instance;
        const snapInstance = new snapModule.default(instance, {
          type: 'proximity',
          distanceThreshold: '65%',
          debounce: 120,
        });
        snapInstance.addElements(Array.from(mainRef.current.children) as HTMLElement[]);
        snap = snapInstance;
      })
      .catch(() => { /* native scroll stands if the module fails to load */ });
    return () => {
      cancelled = true;
      snap?.destroy();
      lenis?.destroy();
    };
  }, []);

  const liveAvailable = openDesks.some(desk => DESK_CAPABILITIES[desk.id].live);

  const carried = (id: HouseDeskId) => {
    const offeringId = soleOfferingForDesk(wireInstruction, id);
    const intent = entryIntentWithInstruction(wireInstruction, instructionSource);
    return { offeringId, intent };
  };

  const deskHref = (id: HouseDeskId, offeringId: string | null, intent: EntryIntent | null) => {
    const params = new URLSearchParams();
    params.set('desk', id);
    if (offeringId) params.set('offering', offeringId);
    if (intent?.side) params.set('side', intent.side);
    if (intent?.amount) params.set('amount', intent.amount);
    return `/?${params.toString()}`;
  };

  const enterDesk = (id: HouseDeskId) => {
    commitInstruction(wireInstruction, instructionSource);
    window.scrollTo({ top: 0, behavior: 'instant' });
    const { offeringId, intent } = carried(id);
    onEnter(id, offeringId ?? undefined, intent);
  };

  const enter = (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enterDesk(id);
  };

  const ring = (id: HouseDeskId) => () => {
    commitInstruction(wireInstruction, instructionSource);
    requestRingOnArrival(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
    const { offeringId, intent } = carried(id);
    onEnter(id, offeringId ?? undefined, intent);
  };

  const chooseOffering = (offeringId: string, deskId: HouseDeskId) => {
    commitInstruction(wireInstruction, instructionSource);
    window.scrollTo({ top: 0, behavior: 'instant' });
    onEnter(deskId, offeringId, entryIntentWithInstruction(wireInstruction, instructionSource));
  };

  return (
    <div className={foyerStyles.foyer}>
      {!sharedScene && <NightDeskScene view="desk" stage="arrival" layout="foyer" still={!graphics.ready || graphics.lightweight} />}

      <header className={foyerStyles.header}>
        <Link href="/" className={foyerStyles.brand} aria-label="Claflin home">
          <HouseMark className={foyerStyles.houseMark} small />
          <span className={foyerStyles.brandText}>
            <strong>CLAFLIN</strong>
            <small>THE OFFICE ABOVE THE PIT</small>
          </span>
        </Link>
        <GraphicsControl className={foyerStyles.graphicsControl} />
      </header>

      <main id="main-content" tabIndex={-1} ref={mainRef} className={foyerStyles.main}>
        <section className={foyerStyles.hero} aria-labelledby="foyer-title">
          <div className={foyerStyles.copy}>
            <p className={foyerStyles.kicker} data-exchange={clock?.exchange ?? 'pending'}>
              <span className={foyerStyles.clockLamp} aria-hidden="true" />
              {market ? bellLine(market.clock, market.bell) : 'THE ONCHAIN BOOK NEVER CLOSES'}
            </p>
            <h1 id="foyer-title" className={foyerStyles.title}>
              {headlineTop}<br />
              {headlineBottom}
            </h1>
            <p className={foyerStyles.lede}>{FOYER_LEDE}</p>
            {filing && (
              <LastFilingLine
                filing={filing}
                className={foyerStyles.returnFiling}
                onOpen={() => {
                  window.scrollTo({ top: 0, behavior: 'instant' });
                  onEnter(filing.deskId, undefined, null, filing.recordId);
                }}
              />
            )}
          </div>

          <p className={foyerStyles.mobilePromise}>Say or type your stock instruction.</p>
          <HouseTurret
            instruction={wireInstruction}
            onInstruction={setInstruction}
            lineDesks={lineDesks}
            planned={planned}
            onRing={id => ring(id)()}
            onType={enterDesk}
            deskHref={id => deskHref(id, soleOfferingForDesk(wireInstruction, id), entryIntentFromInstruction(wireInstruction))}
            onTypeClick={enter}
            boundary={<p className={foyerStyles.reassurance}>{FOYER_BOUNDARY}</p>}
            onCommit={commitInstruction}
            onChooseOffering={chooseOffering}
            onMicUnavailable={reason => trackFunnel({ event: 'mic_blocked', reason })}
          />
        </section>

        <LiveWire hetty={hettyMarks} jesse={jesseMarks} isabel={isabelMarks} onPick={pickFromWire} />

        <HouseOfferings
          onEnter={(...args: Parameters<typeof onEnter>) => {
            commitInstruction(wireInstruction, instructionSource);
            onEnter(...args);
          }}
          instruction={wireInstruction}
          instructionSource={instructionSource}
          marks={{ hetty: hettyMarks, jesse: jesseMarks, isabel: isabelMarks }}
        />

        <section className={foyerStyles.method} id="house-method" aria-labelledby="house-method-title">
          <h2 id="house-method-title">How the line works.</h2>
          <div className={foyerStyles.methodRows}>
            <div className={foyerStyles.methodRow}>
              <span className={foyerStyles.methodIndex}>01 / The call</span>
              <div>
                <h3>Say it like you would to a broker.</h3>
                <p>Ring the desk. The broker writes the slip as you go.</p>
              </div>
            </div>
            <div className={foyerStyles.methodRow}>
              <span className={foyerStyles.methodIndex}>02 / The slip</span>
              <div>
                <h3>A live estimate when you ask.</h3>
                <p>The venue’s estimate lands on the slip — time-stamped, and it expires.</p>
              </div>
            </div>
            <div className={foyerStyles.methodRow}>
              <span className={foyerStyles.methodIndex}>03 / Your signature</span>
              <div>
                <h3>Only you can sign.</h3>
                <p>{liveAvailable
                  ? 'File paper, or live settle where the desk supports it — only with your approval.'
                  : 'File a paper record only when you choose. No real funds move.'}</p>
              </div>
            </div>
          </div>
        </section>

        <HouseDesks
          desks={openDesks}
          deskHref={id => deskHref(id, null, null)}
          onOpen={enter}
        />

        <HouseAnswers />
      </main>

      <footer className={foyerStyles.footer}>
        <HouseMark small className={foyerStyles.footerMark} />
        <span>THE TAPE RUNS ALL NIGHT. EVERY SLIP ON THE RECORD.</span>
        {planned.length > 0 && (
          <span className={foyerStyles.footerPlanned}>
            Coming soon — {planned.map(d => `${d.shortName} (${d.market})`).join(' · ')}
          </span>
        )}
        <nav className={foyerStyles.footerLinks} aria-label="House">
          <a href="#house-answers">Straight answers</a>
          <a href="#house-offerings">Product terms</a>
          <a href="https://github.com/sneldao/claflin" target="_blank" rel="noreferrer">Source ↗</a>
        </nav>
        <p className={foyerStyles.footerRisk}>
          Tokenized stocks carry issuer, custody, liquidity and smart-contract risk, and their prices can
          differ from the listed share. Claflin is not a broker-dealer and gives no investment advice.
          Paper records are simulations.
        </p>
      </footer>
    </div>
  );
}

/**
 * The live wire — reference marks from every desk that publishes them,
 * merged into one band. Indicative observations only: ticks are computed
 * from successive real readings, never invented.
 */
type MarksRead = { result: MarksResult | null; failed: boolean };

function wireMarksOf(hetty: MarksRead, jesse: MarksRead | null, isabel: MarksRead | null): WireMark[] {
  return [
    ...(hetty.result?.marks ?? []).map(mark => ({ key: `base:${mark.instrumentId}`, rail: 'BASE' as const, mark })),
    ...(jesse?.result?.marks ?? []).map(mark => ({ key: `sol:${mark.instrumentId}`, rail: 'SOL' as const, mark })),
    ...(isabel?.result?.marks ?? []).map(mark => ({ key: `rh:${mark.instrumentId}`, rail: 'RH' as const, mark })),
  ];
}

function LiveWire({ hetty, jesse, isabel, onPick }: { hetty: MarksRead; jesse: MarksRead | null; isabel: MarksRead | null; onPick: (symbol: string) => void }) {
  const wireMarks = wireMarksOf(hetty, jesse, isabel);
  const failed = hetty.failed && (jesse?.failed ?? true) && (isabel?.failed ?? true);

  const [ticks, setTicks] = useState<Record<string, 'up' | 'down'>>({});
  const [seen, setSeen] = useState<{ hetty: MarksResult | null; jesse: MarksResult | null; isabel: MarksResult | null }>({ hetty: hetty.result, jesse: jesse?.result ?? null, isabel: isabel?.result ?? null });

  /* Compare successive real readings only — a tick exists only when a refresh
     actually moved the price. */
  if (hetty.result !== seen.hetty || (jesse?.result ?? null) !== seen.jesse || (isabel?.result ?? null) !== seen.isabel) {
    const prior = wireMarksOf({ result: seen.hetty, failed: false }, { result: seen.jesse, failed: false }, { result: seen.isabel, failed: false });
    setSeen({ hetty: hetty.result, jesse: jesse?.result ?? null, isabel: isabel?.result ?? null });
    const nextTicks: Record<string, 'up' | 'down'> = {};
    for (const wire of wireMarks) {
      const old = prior.find(p => p.key === wire.key);
      const price = markPrice(wire.mark);
      const before = old ? markPrice(old.mark) : null;
      if (price && before && price !== before) {
        nextTicks[wire.key] = Number(price) > Number(before) ? 'up' : 'down';
      }
    }
    if (Object.keys(nextTicks).length > 0) setTicks(nextTicks);
  }

  useEffect(() => {
    if (Object.keys(ticks).length === 0) return;
    const timer = setTimeout(() => setTicks({}), 1200);
    return () => clearTimeout(timer);
  }, [ticks]);

  /* The tape reads the room's pace — scroll velocity feeds the drift and a
     slight skew, like a ticker running hot. Pauses under pointer or focus,
     and never runs under reduced motion. */
  const windowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = trackRef.current;
    const win = windowRef.current;
    if (!track || !win) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let x = 0;
    let velocity = 0;
    let lastY = window.scrollY;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const y = window.scrollY;
      velocity += (dt > 0 ? (y - lastY) / dt - velocity : -velocity) * 0.12;
      lastY = y;
      const half = track.scrollWidth / 2;
      if (!win.matches(':hover') && !win.matches(':focus-within') && half > 0) {
        x -= Math.max(-26, 55 + Math.min(velocity * 0.09, 150)) * dt;
        if (x <= -half) x += half;
      }
      const skew = Math.max(-4, Math.min(4, velocity * 0.003));
      track.style.transform = `translateX(${x.toFixed(1)}px) skewX(${skew.toFixed(2)}deg)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className={foyerStyles.wire} aria-label="Live reference marks">
      <span className={foyerStyles.wireLabel}>LIVE REFERENCE MARKS</span>
      {wireMarks.length === 0 ? (
        <p className={foyerStyles.wireNote} role={failed ? 'status' : undefined}>
          {failed ? 'Tape unavailable — estimates unaffected.' : 'Reading the tape…'}
        </p>
      ) : (
        <div ref={windowRef} className={foyerStyles.wireWindow}>
          <div ref={trackRef} className={foyerStyles.wireTrack}>
            {[0, 1].map(copy => (
              <div key={copy} className={foyerStyles.wireCopy} aria-hidden={copy === 1}>
                {wireMarks.map(wire => (
                  <WireItem
                    key={wire.key}
                    wire={wire}
                    tick={ticks[wire.key]}
                    disabled={copy === 1}
                    onPick={onPick}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WireItem({ wire, tick, disabled, onPick }: { wire: WireMark; tick?: 'up' | 'down'; disabled?: boolean; onPick: (symbol: string) => void }) {
  const price = markPrice(wire.mark);
  const stale = wire.mark.reference.status === 'stale';
  const instruction = instructionForMark(wire.mark);
  const gapBps = wire.mark.reference.status === 'observed' ? Number(wire.mark.stockReference?.differenceBps ?? NaN) : NaN;
  const gap = Number.isFinite(gapBps) ? `${gapBps > 0 ? '+' : gapBps < 0 ? '−' : ''}${Math.abs(gapBps).toFixed(1)} bps ${WIRE_GAP_REFERENCE}` : null;
  return (
    <button
      type="button"
      className={foyerStyles.wireItem}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => onPick(instruction)}
      aria-label={`${wire.mark.symbol} ${price ? `$${price}` : 'reference unavailable'} on ${wire.rail === 'BASE' ? 'Base' : wire.rail === 'SOL' ? 'Solana' : 'Robinhood Chain'}`}
    >
      <span className={foyerStyles.wireSymbol}>{wire.mark.symbol}</span>
      <span className={foyerStyles.wirePrice} data-tick={tick}>
        {price ? `$${price}` : '—'}
        {tick && <span className={foyerStyles.wireTickGlyph} aria-hidden="true">{tick === 'up' ? '▲' : '▼'}</span>}
      </span>
      <span className={foyerStyles.wireRail}>{wire.rail}</span>
      {gap && <span className={foyerStyles.wireGap}>{gap}</span>}
      {stale && <span className={foyerStyles.wireStale}>STALE</span>}
    </button>
  );
}
