'use client';

import Link from 'next/link';
import { HOUSE_DESKS } from '@/lib/house';
import { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { HouseMark } from './HouseMark';
import { DeskInstrument } from './DeskInstrument';
import { TradeTicket } from './TradeTicket';
import { PaperHistory } from './PaperHistory';
import { VoiceIntent } from './VoiceIntent';
import { HettyStatus } from './HettyStatus';
import { DeskBoard } from './DeskBoard';
import { TickerTape } from './TickerTape';
import { DESK_INSTRUMENTS } from '@/lib/trading/catalog';
import styles from './WorkingDesk.module.css';

export function WorkingDesk() {
  const desk = useTradingDesk();
  const hetty = HOUSE_DESKS[0];
  const selected = DESK_INSTRUMENTS.find(s => s.id === desk.state.draft.instrumentId);
  const reviewActive = desk.state.stage === 'review' || desk.state.stage === 'loading' || desk.state.stage === 'saved';
  const instrumentStage = desk.state.stage === 'review' || desk.state.stage === 'saved'
    ? 'confirmation'
    : desk.state.stage === 'loading'
      ? 'conversation'
      : 'arrival';
  const instrumentLabel = selected
    ? `${selected.symbol.toUpperCase()} · ${desk.state.stage === 'loading' ? 'CALLING THE VENUE' : desk.state.stage === 'review' ? 'ESTIMATE ON THE SLIP' : 'PAPER TRADING / NO LIVE ORDERS'}`
    : 'PAPER TRADING / NO LIVE ORDERS';

  const loadInstrument = (instrumentId: string) => {
    desk.edit({ ...desk.state.draft, instrumentId });
    document.getElementById('instruction')?.scrollIntoView({ block: 'start' });
    document.getElementById('amount')?.focus();
  };

  return <div className={styles.workspace}>
    <div className={styles.room} aria-hidden="true"><div className={styles.window}><i /><i /><i /></div><div className={styles.lightPool} /></div>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Claflin, your trading desk"><HouseMark className={styles.houseMark} /><span><strong>CLAFLIN</strong><small>A CONSIDERED APPROACH</small></span></Link>
      <nav aria-label="Desk navigation"><a href="#instruction">The desk</a><a href="#on-desk">On your desk</a><a href="#paper-history">Your record</a><a href="#hetty">About Hetty</a></nav>
    </header>
    <main id="main-content" className={styles.main}>
      <TickerTape onSelect={loadInstrument} disabled={desk.state.stage === 'loading'} />
      <div className={styles.mode}><span>HETTY / BASE</span><strong>PAPER TRADING</strong><span>Live estimates. No real funds move.</span></div>
      <div className={styles.grid} data-review={reviewActive ? 'true' : 'false'}>
        <section className={styles.introduction} aria-labelledby="desk-title">
          <p className={styles.eyebrow}>WELCOME TO CLAFLIN</p>
          <h1 id="desk-title">Your trading<br /><em>desk.</em></h1>
          <p>A clear view of the trade before you make it. Explore Coinbase Tokenized Stocks on Base, review the terms, and decide for yourself.</p>
          <p className={styles.welcomeNote}>Hetty’s desk is open for paper trading. Start with a stock.</p>
          <div className={styles.instrumentShell} data-stage={instrumentStage}>
            <div className={styles.instrument} data-stage={instrumentStage}><DeskInstrument stage={instrumentStage} label={instrumentLabel} /></div>
            <p className={styles.instrumentCaption} aria-hidden="true"><span>CLAFLIN / DESK INSTRUMENT</span>ENAMEL · BRASS · LIGHT</p>
          </div>
          <HettyStatus desk={desk} />
        </section>
        <TradeTicket desk={desk} />
        <aside className={styles.support} aria-label="Your broker and instruction input">
          <div id="hetty" className={styles.brokerNote}>
            <span>YOUR AI BROKER</span><h2>{hetty.name}.</h2><p>{hetty.approach}</p>
            <details><summary>About Hetty</summary><p>Hetty is an AI character inspired by historical finance, not a historical person or a licensed human broker. Her role is to help make trading decisions clear, not to make them for you.</p><p>Live conversations are not connected in this release. You can prepare an instruction directly or use optional dictation below.</p></details>
          </div>
          <div id="on-desk"><DeskBoard desk={desk} /></div>
          <VoiceIntent onApply={desk.edit} disabled={desk.state.stage === 'loading'} />
        </aside>
      </div>
      <PaperHistory desk={desk} />
      <section id="house" className={styles.house} aria-labelledby="house-title">
        <p className={styles.eyebrow}>ONE HOUSE. DISTINCT PERSPECTIVES.</p>
        <h2 id="house-title">Hetty first. A house over time.</h2>
        <p>Research and specialist judgment belong beside the trade—not in the way of it.</p>
        <details><summary>Other desks, in time</summary><ul>{HOUSE_DESKS.slice(1).map(broker => <li key={broker.id}><strong>{broker.name}</strong><span>{broker.market} · Planned</span><p>{broker.approach}</p></li>)}</ul><p>These desks are not yet available. Their markets, accounts and permissions will be explicit before they open.</p></details>
      </section>
    </main>
    <footer className={styles.footer}><span>CLAFLIN &amp; CO. / THE BROKERAGE HOUSE</span><span>Independent thinking. Explicit decisions.</span></footer>
  </div>;
}
