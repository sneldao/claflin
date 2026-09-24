'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { DESK_CAPABILITIES, HOUSE_DESKS, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { useMarketBell } from '@/lib/use-market-clock';
import { bellLine } from '@/lib/market-clock';
import { BROKER_VOICE } from '@/lib/desk/broker-voice';
import { requestRingOnArrival } from '@/lib/trading/line-signal';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { markPrice, type DeskMark, type MarksResult } from '@/lib/trading/marks-shared';
import { offeringForInstrument } from '@/lib/desk/offerings';
import { FOYER_BOUNDARY, FOYER_HEADLINES, FOYER_LEDE, LINE_IDENTITY, WIRE_GAP_REFERENCE } from '@/lib/desk/ui-copy';
import { entryIntentFromInstruction, type EntryIntent } from '@/lib/house-entry';
import { soleOfferingForDesk } from '@/lib/desk/offerings-presentation';
import { useLatestFiling } from '@/lib/trading/useLatestFiling';
import { LastFilingLine } from './LastFilingLine';
import { HouseMark } from './HouseMark';
import { useHouseScene } from './HouseScene';
import { HouseOfferings } from './HouseOfferings';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import foyerStyles from './HouseFoyer.module.css';

type WireMark = { key: string; rail: 'BASE' | 'SOL'; mark: DeskMark };

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
  const lineDesks = openDesks.filter(desk => DESK_CAPABILITIES[desk.id].voice && BROKER_VOICE[desk.id]);

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
  const hettyMarks = useReferenceMarks('hetty');
  const jesseMarksRead = useReferenceMarks(jesseOpen ? 'jesse' : 'hetty');
  const jesseMarks = jesseOpen ? jesseMarksRead : null;
  /* The house-book instruction lives here so a wire-mark click can write it. */
  const [wireInstruction, setWireInstruction] = useState('');
  const filing = useLatestFiling();

  const sharedScene = useHouseScene({ visible: true, layout: 'foyer', view: 'desk', stage: 'arrival', still: false });

  const liveAvailable = openDesks.some(desk => DESK_CAPABILITIES[desk.id].live);

  const carried = (id: HouseDeskId) => {
    const offeringId = soleOfferingForDesk(wireInstruction, id);
    const intent = entryIntentFromInstruction(wireInstruction);
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

  const enter = (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'instant' });
    const { offeringId, intent } = carried(id);
    onEnter(id, offeringId ?? undefined, intent);
  };

  const ring = (id: HouseDeskId) => () => {
    requestRingOnArrival(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
    const { offeringId, intent } = carried(id);
    onEnter(id, offeringId ?? undefined, intent);
  };

  return (
    <div className={foyerStyles.foyer}>
      {!sharedScene && <NightDeskScene view="desk" stage="arrival" layout="foyer" />}

      <header className={foyerStyles.header}>
        <Link href="/" className={foyerStyles.brand} aria-label="Claflin home">
          <HouseMark className={foyerStyles.houseMark} small />
          <span className={foyerStyles.brandText}>
            <strong>CLAFLIN</strong>
            <small>THE OFFICE ABOVE THE PIT</small>
          </span>
        </Link>
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
            <label className={foyerStyles.instructionSearch}>
              <input
                value={wireInstruction}
                onChange={event => setWireInstruction(event.target.value)}
                placeholder="Try “buy Apple for 100 USDC”"
                autoComplete="off"
                aria-label="Instruction for the house"
              />
            </label>
            <p className={foyerStyles.reassurance}>
              {FOYER_BOUNDARY}
            </p>
          </div>

          {lineDesks.length > 0 && (
            <div className={foyerStyles.lines}>
              {lineDesks.map(desk => {
                return (
                  <article key={desk.id} className={foyerStyles.lineCard}>
                    <header className={foyerStyles.lineCardHeader}>
                      <h2 className={foyerStyles.lineName}>{desk.shortName}</h2>
                      <p className={foyerStyles.lineRail}>{desk.market} · {LINE_IDENTITY}</p>
                    </header>
                    <div className={foyerStyles.lineActions}>
                      <button type="button" className={foyerStyles.ringButton} onClick={ring(desk.id)}>
                        <span className={foyerStyles.lineLamp} aria-hidden="true" />
                        Ring {desk.shortName}{soleOfferingForDesk(wireInstruction, desk.id) ? ' with this' : ''}
                      </button>
                      <a
                        href={deskHref(desk.id, soleOfferingForDesk(wireInstruction, desk.id), entryIntentFromInstruction(wireInstruction))}
                        className={foyerStyles.typeInstead}
                        onClick={enter(desk.id)}
                      >
                        Type instead
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <LiveWire hetty={hettyMarks} jesse={jesseMarks} onPick={setWireInstruction} />

        <HouseOfferings
          onEnter={onEnter}
          instruction={wireInstruction}
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
      </main>

      <footer className={foyerStyles.footer}>
        <HouseMark small className={foyerStyles.footerMark} />
        <span>THE TAPE RUNS ALL NIGHT. EVERY SLIP ON THE RECORD.</span>
        {planned.length > 0 && (
          <span className={foyerStyles.footerPlanned}>
            Coming soon — {planned.map(d => `${d.shortName} (${d.market})`).join(' · ')}
          </span>
        )}
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

function wireMarksOf(hetty: MarksRead, jesse: MarksRead | null): WireMark[] {
  return [
    ...(hetty.result?.marks ?? []).map(mark => ({ key: `base:${mark.instrumentId}`, rail: 'BASE' as const, mark })),
    ...(jesse?.result?.marks ?? []).map(mark => ({ key: `sol:${mark.instrumentId}`, rail: 'SOL' as const, mark })),
  ];
}

function LiveWire({ hetty, jesse, onPick }: { hetty: MarksRead; jesse: MarksRead | null; onPick: (symbol: string) => void }) {
  const wireMarks = wireMarksOf(hetty, jesse);
  const failed = hetty.failed && (jesse?.failed ?? true);

  const [ticks, setTicks] = useState<Record<string, 'up' | 'down'>>({});
  const [seen, setSeen] = useState<{ hetty: MarksResult | null; jesse: MarksResult | null }>({ hetty: hetty.result, jesse: jesse?.result ?? null });

  /* Compare successive real readings only — a tick exists only when a refresh
     actually moved the price. */
  if (hetty.result !== seen.hetty || (jesse?.result ?? null) !== seen.jesse) {
    const prior = wireMarksOf({ result: seen.hetty, failed: false }, { result: seen.jesse, failed: false });
    setSeen({ hetty: hetty.result, jesse: jesse?.result ?? null });
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

  return (
    <section className={foyerStyles.wire} aria-label="Live reference marks">
      <span className={foyerStyles.wireLabel}>LIVE REFERENCE MARKS</span>
      {wireMarks.length === 0 ? (
        <p className={foyerStyles.wireNote} role={failed ? 'status' : undefined}>
          {failed ? 'Tape unavailable — estimates unaffected.' : 'Reading the tape…'}
        </p>
      ) : (
        <div className={foyerStyles.wireWindow}>
          <div className={foyerStyles.wireTrack}>
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
      aria-label={`${wire.mark.symbol} ${price ? `$${price}` : 'reference unavailable'} on ${wire.rail === 'BASE' ? 'Base' : 'Solana'}`}
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
