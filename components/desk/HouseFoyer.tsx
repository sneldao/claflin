'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HOUSE, HOUSE_DESKS, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { HouseMark } from './HouseMark';
import styles from './WorkingDesk.module.css';

type DemoPhase = 'idle' | 'writing' | 'ready';

type DemoQuote = {
  id: string;
  phrase: string;
  deskId: HouseDeskId;
  spend: string;
  receive: string;
  route: string;
};

/** Illustrative foyer loop — labeled example, not a live venue quote. */
const DEMO_QUOTES: readonly DemoQuote[] = [
  {
    id: 'aapl-jesse',
    phrase: 'Buy 100 USDC of AAPLx',
    deskId: 'jesse',
    spend: '100 USDC',
    receive: 'about 29.4 AAPLx',
    route: 'Jupiter Metis · Solana',
  },
  {
    id: 'nvda-jesse',
    phrase: 'Buy 50 USDC of NVDAx',
    deskId: 'jesse',
    spend: '50 USDC',
    receive: 'about 0.28 NVDAx',
    route: 'Jupiter Metis · Solana',
  },
  {
    id: 'tsla-hetty',
    phrase: 'Buy 25 USDC of TSLA on Base',
    deskId: 'hetty',
    spend: '25 USDC',
    receive: 'about 0.12 TSLA',
    route: 'Aerodrome · Base',
  },
] as const;

/**
 * Claflin foyer — Sylva-shaped: one composition, a touchable central subject
 * (mini slip demo), plain product sentence, Jesse-primary conversion.
 */
export function HouseFoyer({ onEnter }: { onEnter: (id: HouseDeskId) => void }) {
  const openDesks = HOUSE_DESKS
    .filter(desk => isOpenDesk(desk.id))
    .slice()
    .sort((a, b) => {
      if (a.id === 'jesse') return -1;
      if (b.id === 'jesse') return 1;
      return 0;
    });
  const planned = HOUSE_DESKS.filter(desk => !isOpenDesk(desk.id));

  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [active, setActive] = useState<DemoQuote | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const runDemo = useCallback((quote: DemoQuote) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActive(quote);
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setPhase('ready');
      return;
    }
    setPhase('writing');
    timerRef.current = setTimeout(() => setPhase('ready'), 520);
  }, []);

  const primaryDesk: HouseDeskId = active?.deskId
    ?? (openDesks.some(d => d.id === 'jesse') ? 'jesse' : openDesks[0]?.id ?? 'hetty');
  const secondaryDesk: HouseDeskId | null = primaryDesk === 'jesse'
    ? (openDesks.some(d => d.id === 'hetty') ? 'hetty' : null)
    : (openDesks.some(d => d.id === 'jesse') ? 'jesse' : null);

  return (
    <section className={styles.foyer} aria-labelledby="foyer-title">
      <div className={styles.foyerMark}>
        <HouseMark className={styles.houseMark} />
        <p className={styles.eyebrow}>CLAFLIN &amp; CO.</p>
        <p className={styles.foyerWhisper}>{HOUSE.tagline}</p>
        <h1 id="foyer-title">{HOUSE.headline}</h1>
        <p className={styles.foyerPromise}>{HOUSE.promise}</p>
        <p className={styles.foyerNote}>
          Talk or type to a specialist desk. Get a real venue estimate. Review it —
          then file paper, or settle live on Solana. Nothing moves without you.
        </p>
      </div>

      <div className={styles.foyerDemo} aria-label="Try the desk loop">
        <p className={styles.foyerDemoLead}>Try it here — then open a desk.</p>
        <div className={styles.foyerChips} role="group" aria-label="Example instructions">
          {DEMO_QUOTES.map(quote => (
            <button
              key={quote.id}
              type="button"
              className={styles.foyerChip}
              aria-pressed={active?.id === quote.id}
              disabled={phase === 'writing'}
              onClick={() => runDemo(quote)}
            >
              {quote.phrase}
            </button>
          ))}
        </div>

        <div
          className={styles.foyerBlotter}
          data-phase={phase}
          aria-live="polite"
        >
          {phase === 'idle' && (
            <p className={styles.foyerBlotterIdle}>
              Tap an instruction. A sample slip will land for review —
              the same loop as the real desk.
            </p>
          )}
          {phase === 'writing' && (
            <p className={styles.foyerBlotterIdle}>Writing the estimate…</p>
          )}
          {phase === 'ready' && active && (
            <article className={styles.foyerSlip} aria-label="Example quotation slip">
              <p className={styles.foyerSlipKicker}>EXAMPLE · PAPER ESTIMATE · NOT A LIVE QUOTE</p>
              <p className={styles.foyerSlipPhrase}>{active.phrase}</p>
              <p className={styles.foyerSlipLine}>
                Spend <strong>{active.spend}</strong>
                {' → '}
                <strong>{active.receive}</strong>
              </p>
              <p className={styles.foyerSlipMeta}>{active.route}</p>
              <p className={styles.foyerSlipFine}>
                On the real desk this is a fresh venue quote. You review, then file paper
                or — on Solana — connect a wallet and settle live.
              </p>
            </article>
          )}
        </div>

        <div className={styles.foyerCta}>
          <button
            type="button"
            className={styles.foyerPrimary}
            onClick={() => onEnter(primaryDesk)}
          >
            {primaryDesk === 'jesse'
              ? 'Open Jesse’s Solana desk →'
              : 'Open Hetty’s Base desk →'}
          </button>
          {secondaryDesk && (
            <button
              type="button"
              className={styles.foyerSecondary}
              onClick={() => onEnter(secondaryDesk)}
            >
              {secondaryDesk === 'hetty'
                ? 'Or start with Hetty on Base'
                : 'Or open Jesse on Solana'}
            </button>
          )}
        </div>
      </div>

      <ul className={styles.foyerDoors} role="list">
        {openDesks.map(desk => (
          <li key={desk.id}>
            <button
              type="button"
              className={styles.foyerDoor}
              data-desk={desk.id}
              data-featured={desk.id === 'jesse' ? 'true' : undefined}
              onClick={() => onEnter(desk.id)}
            >
              <span className={styles.foyerDoorName}>{desk.name}</span>
              <span className={styles.foyerDoorMarket}>{desk.market}</span>
              <span className={styles.foyerDoorAccess}>{desk.access}</span>
              <span className={styles.foyerDoorCapability}>{desk.capability}</span>
              <span className={styles.foyerDoorCue}>
                {desk.id === 'jesse' ? 'Start with Jesse →' : 'Open the desk →'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {planned.length > 0 && (
        <p className={styles.foyerPlanned}>
          Coming later — {planned.map(d => `${d.shortName} (${d.market})`).join(' · ')}.
        </p>
      )}
    </section>
  );
}
