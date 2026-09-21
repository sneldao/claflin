'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { DESK_CAPABILITIES, HOUSE_DESKS, isOpenDesk, type HouseDesk, type HouseDeskId } from '@/lib/house';
import { NIGHT_DESK_FIXTURES, type NightDeskAmount, type NightDeskStage } from '@/lib/night-desk-fixtures';
import { HouseMark } from './HouseMark';
import { useHouseScene } from './HouseScene';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import foyerStyles from './HouseFoyer.module.css';

type DemoPhase = 'idle' | 'writing' | 'ready';

/** Illustrative foyer loop — labeled example, not a live venue quote. */
const EXAMPLE_QUOTES = NIGHT_DESK_FIXTURES.quotes;

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
  const [amount, setAmount] = useState<NightDeskAmount>('100');
  const [priorAmount, setPriorAmount] = useState<NightDeskAmount | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (phase !== 'writing') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => {
      if (!media.matches) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setPhase('ready');
    };
    media.addEventListener('change', finish);
    return () => media.removeEventListener('change', finish);
  }, [phase]);

  const runDemo = (next: NightDeskAmount) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPriorAmount(phase === 'ready' && amount !== next ? amount : null);
    setAmount(next);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPhase('ready'); return; }
    setPhase('writing');
    timerRef.current = setTimeout(() => { timerRef.current = null; setPhase('ready'); }, 460);
  };

  const resetDemo = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setAmount('100');
    setPriorAmount(null);
    setPhase('idle');
  };

  const stage: NightDeskStage = phase === 'idle'
    ? 'arrival'
    : phase === 'writing'
      ? 'conversation'
      : priorAmount !== null ? 'revised' : 'quote';
  const sharedScene = useHouseScene({ visible: true, layout: 'foyer', view: 'desk', stage, still: false });

  const primaryDesk: HouseDesk | undefined = openDesks.find(d => d.id === 'jesse') ?? openDesks[0];
  const alternateDesk: HouseDesk | undefined = openDesks.find(d => d.id !== primaryDesk?.id);
  const liveAvailable = isOpenDesk('jesse') && DESK_CAPABILITIES.jesse.live;

  const enter = (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    onEnter(id);
  };

  const quote = EXAMPLE_QUOTES[amount];
  const priorQuote = priorAmount ? EXAMPLE_QUOTES[priorAmount] : null;
  const writing = phase === 'writing';
  const statusText = phase === 'writing'
    ? 'Writing the estimate…'
    : phase === 'ready'
      ? `Example estimate ready — ${quote.spend} for ${quote.receive}.`
      : 'No example running.';

  return (
    <div className={foyerStyles.foyer} data-demo-phase={phase}>
      {!sharedScene && <NightDeskScene view="desk" stage={stage} layout="foyer" />}

      <header className={foyerStyles.header}>
        <Link href="/" className={foyerStyles.brand} aria-label="Claflin home">
          <HouseMark className={foyerStyles.houseMark} small />
          <span className={foyerStyles.brandText}>
            <strong>CLAFLIN</strong>
            <small>THE OFFICE ABOVE THE PIT</small>
          </span>
        </Link>
        <nav className={foyerStyles.headerNav} aria-label="Foyer">
          <a href="#house-method">The house method</a>
          {openDesks.length > 0 && (
            <details className={foyerStyles.deskMenu}>
              <summary>Open a desk</summary>
              <div className={foyerStyles.deskMenuList}>
                {openDesks.map(desk => (
                  <a key={desk.id} href={`/?desk=${desk.id}`} onClick={enter(desk.id)}>
                    {desk.shortName} · {desk.market}
                  </a>
                ))}
              </div>
            </details>
          )}
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className={foyerStyles.main}>
        <section className={foyerStyles.hero} aria-labelledby="foyer-title">
          <div className={foyerStyles.copy}>
            <p className={foyerStyles.kicker}>A LITTLE DISTANCE FROM THE MARKET</p>
            <h1 id="foyer-title" className={foyerStyles.title}>
              A clearer view.<br />
              Before you trade.
            </h1>
            <p className={foyerStyles.lede}>
              Talk or type a tokenized-stock instruction. Get a real venue estimate.
              Review it before you decide.
            </p>
            <div className={foyerStyles.actions}>
              {primaryDesk && (
                <a
                  href={`/?desk=${primaryDesk.id}`}
                  className={foyerStyles.primary}
                  onClick={enter(primaryDesk.id)}
                >
                  Open {primaryDesk.shortName}’s desk
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              )}
              <button
                type="button"
                className={foyerStyles.tryExample}
                aria-controls="foyer-example"
                disabled={writing}
                onClick={() => runDemo('100')}
              >
                Try an example
              </button>
              {alternateDesk && (
                <a
                  href={`/?desk=${alternateDesk.id}`}
                  className={foyerStyles.alternate}
                  onClick={enter(alternateDesk.id)}
                >
                  {alternateDesk.shortName} · {alternateDesk.market}
                </a>
              )}
            </div>
            <p className={foyerStyles.reassurance}>
              Paper by default. Nothing moves without your approval.
              {liveAvailable ? ' Live settle is available on Jesse’s desk when you choose it.' : ''}
            </p>
          </div>

          <div className={foyerStyles.demo}>
            <p className={foyerStyles.sceneCaption}>
              THE DESK IS YOURS.
              <span>An instruction. An estimate. A moment to decide.</span>
            </p>
            <div className={foyerStyles.example} id="foyer-example">
              <p className={foyerStyles.exampleKicker}>ILLUSTRATIVE EXAMPLE · NOT A LIVE QUOTE</p>
              <p className={foyerStyles.exampleStatus} role="status">{statusText}</p>
              {phase === 'idle' && (
                <div className={foyerStyles.exampleIdle}>
                  <p>Try an instruction. Watch the desk write it down.</p>
                  <button type="button" onClick={() => runDemo('100')} disabled={writing}>
                    Quote 100 USDC of AAPLx
                  </button>
                </div>
              )}
              {phase !== 'idle' && (
                <div className={foyerStyles.slips} data-revised={priorQuote ? 'true' : undefined}>
                  {priorQuote && (
                    <article className={foyerStyles.slipPrior} aria-label="Superseded example slip">
                      <p className={foyerStyles.slipPriorStamp}>SUPERSEDED EXAMPLE</p>
                      <p className={foyerStyles.slipPriorLine}>
                        <s>{priorQuote.spend} → {priorQuote.receive}</s>
                      </p>
                    </article>
                  )}
                  <article className={foyerStyles.slip} data-phase={phase} aria-label="Example quotation slip">
                    {phase === 'writing' ? (
                      <p className={foyerStyles.slipWriting}>Writing the estimate…</p>
                    ) : (
                      <>
                        <p className={foyerStyles.slipInstrument}>
                          {NIGHT_DESK_FIXTURES.instrument.symbol} — {NIGHT_DESK_FIXTURES.instrument.name}
                        </p>
                        <dl className={foyerStyles.slipBody}>
                          <div>
                            <dt>Spend</dt>
                            <dd>{quote.spend}</dd>
                          </div>
                          <div>
                            <dt>Receive</dt>
                            <dd>{quote.receive}</dd>
                          </div>
                          <div>
                            <dt>Reference</dt>
                            <dd>{quote.id}</dd>
                          </div>
                        </dl>
                        <p className={foyerStyles.slipRoute}>{quote.route}</p>
                        <p className={foyerStyles.slipFine}>{NIGHT_DESK_FIXTURES.quoteDisclosure}</p>
                        <div className={foyerStyles.slipActions}>
                          {amount === '100' && (
                            <button type="button" onClick={() => runDemo('50')} disabled={writing}>
                              Make that 50 USDC
                            </button>
                          )}
                          <button type="button" onClick={resetDemo} disabled={writing}>
                            Clear example
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                </div>
              )}
            </div>
          </div>

          <div className={foyerStyles.heroRail}>
            <span>01 / THE ARRIVAL</span>
            <a href="#house-method">
              How the desk works
              <ArrowDown size={12} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className={foyerStyles.method} id="house-method" aria-labelledby="house-method-title">
          <h2 id="house-method-title">Your instruction. Your decision.</h2>
          <div className={foyerStyles.methodRows}>
            <div className={foyerStyles.methodRow}>
              <span className={foyerStyles.methodIndex}>01 / The instruction</span>
              <div>
                <h3>Say it in your own words.</h3>
                <p>Talk or type a supported tokenized-stock instruction in plain language. The desk puts the details in front of you for review.</p>
              </div>
            </div>
            <div className={foyerStyles.methodRow}>
              <span className={foyerStyles.methodIndex}>02 / The estimate</span>
              <div>
                <h3>Put the numbers on paper.</h3>
                <p>A real venue estimate lands on the slip — priced at the moment you ask, time-sensitive like any quote. Nothing is placed.</p>
              </div>
            </div>
            <div className={foyerStyles.methodRow}>
              <span className={foyerStyles.methodIndex}>03 / The decision</span>
              <div>
                <h3>Nothing moves without you.</h3>
                <p>Review the paper first. {liveAvailable
                  ? 'File a paper record, or choose live settlement on Solana — only with your approval.'
                  : 'File a paper record only when you choose. No real funds move.'}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={foyerStyles.footer}>
        <HouseMark small className={foyerStyles.footerMark} />
        <span>THE PIT IS DOWNSTAIRS. THIS DESK IS FOR DECIDING.</span>
        {planned.length > 0 && (
          <span className={foyerStyles.footerPlanned}>
            Later — {planned.map(d => `${d.shortName} (${d.market})`).join(' · ')}
          </span>
        )}
      </footer>
    </div>
  );
}
