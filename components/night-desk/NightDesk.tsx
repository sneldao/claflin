'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, FileText, LineChart, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { NIGHT_DESK_FIXTURES, type NightDeskAmount, type NightDeskView } from '@/lib/night-desk-fixtures';
import {
  initialNightDeskState,
  nightDeskReducer,
  parseNightDeskCommand,
  canKeepNightDesk,
  KEEP_FAILED_LINE,
  CLEAR_FAILED_LINE,
  NIGHT_DESK_STORAGE_KEY,
  type NightDeskAction,
} from '@/lib/night-desk-state';
import type { NightDeskAnchors } from '@/lib/night-desk-scene';
import { HouseMark } from '../desk/HouseMark';
import { NightDeskScene } from './NightDeskScene';
import styles from './NightDesk.module.css';

const F = NIGHT_DESK_FIXTURES;

const VIEW_NAV: { view: NightDeskView; label: string }[] = [
  { view: 'desk', label: 'The desk' },
  { view: 'evidence', label: 'The two markets' },
  { view: 'review', label: 'Your instruction' },
  { view: 'ledger', label: 'The ledger' },
];

function isKeptAmount(value: unknown): value is NightDeskAmount {
  return value === '100' || value === '50';
}

export function NightDesk() {
  const [state, dispatch] = useReducer(nightDeskReducer, initialNightDeskState);
  const [soundOn, setSoundOn] = useState(false);
  const [replayNonce, setReplayNonce] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const speechGeneration = useRef(0);
  const focusRequested = useRef(false);
  const [lineOverride, setLineOverride] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [showKept, setShowKept] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const evidenceLabelRef = useRef<HTMLButtonElement>(null);
  const reviewLabelRef = useRef<HTMLButtonElement>(null);
  const ledgerLabelRef = useRef<HTMLButtonElement>(null);
  const activeViewRef = useRef<NightDeskView>('desk');
  const { stage, view, amount, keptAmount } = state;
  const line = lineOverride ?? state.line;

  useEffect(() => {
    setSpeechSupported('speechSynthesis' in window);
  }, []);

  useEffect(() => {
    activeViewRef.current = view;
  }, [view]);

  const cancelSpeech = useCallback(() => {
    speechGeneration.current += 1;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const act = useCallback((action: NightDeskAction) => {
    cancelSpeech();
    setLineOverride(null);
    setVoiceNote(null);
    dispatch(action);
  }, [cancelSpeech]);

  const keepWithPersistence = useCallback(() => {
    cancelSpeech();
    setLineOverride(null);
    if (canKeepNightDesk(state)) {
      const payload = JSON.stringify({ version: 1, amount: state.amount });
      try {
        window.sessionStorage.setItem(NIGHT_DESK_STORAGE_KEY, payload);
        if (window.sessionStorage.getItem(NIGHT_DESK_STORAGE_KEY) !== payload) {
          setLineOverride(KEEP_FAILED_LINE);
          return;
        }
      } catch {
        setLineOverride(KEEP_FAILED_LINE);
        return;
      }
    }
    dispatch({ type: 'keep' });
  }, [cancelSpeech, state]);

  const resetStudy = useCallback(() => {
    cancelSpeech();
    setSoundOn(false);
    setTyped('');
    setShowKept(false);
    try {
      window.sessionStorage.removeItem(NIGHT_DESK_STORAGE_KEY);
      setLineOverride(null);
    } catch {
      setLineOverride(CLEAR_FAILED_LINE);
    }
    dispatch({ type: 'reset' });
  }, [cancelSpeech]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(NIGHT_DESK_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as { version?: unknown }).version === 1 &&
        isKeptAmount((parsed as { amount?: unknown }).amount)
      ) {
        dispatch({ type: 'restore', amount: (parsed as { amount: NightDeskAmount }).amount });
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => () => cancelSpeech(), [cancelSpeech]);

  useEffect(() => {
    if (focusRequested.current && stage !== 'arrival') {
      focusRequested.current = false;
      inputRef.current?.focus();
    }
  }, [stage]);

  useEffect(() => {
    if (!soundOn || !speechSupported) return;
    cancelSpeech();
    const generation = speechGeneration.current;
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.onerror = event => {
      if (generation !== speechGeneration.current) return;
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      setVoiceNote('Browser voice preview unavailable — the line stays on screen.');
    };
    window.speechSynthesis.speak(utterance);
  }, [soundOn, line, replayNonce, speechSupported, cancelSpeech]);

  const hearLine = useCallback(() => {
    if (!speechSupported) {
      setVoiceNote('Browser voice preview unavailable — the line stays on screen.');
      return;
    }
    setVoiceNote(null);
    setSoundOn(true);
    setReplayNonce(n => n + 1);
  }, [speechSupported]);

  const onAnchors = useCallback((anchors: NightDeskAnchors) => {
    const targets: [keyof NightDeskAnchors, HTMLButtonElement | null][] = [
      ['evidence', evidenceLabelRef.current],
      ['review', reviewLabelRef.current],
      ['ledger', ledgerLabelRef.current],
    ];
    for (const [key, el] of targets) {
      if (!el) continue;
      const anchor = anchors[key];
      const hidden =
        !anchor.visible ||
        key === activeViewRef.current ||
        anchor.y < 80 ||
        anchor.y > window.innerHeight - 80;
      el.style.left = `${anchor.x}px`;
      el.style.top = `${anchor.y}px`;
      el.style.visibility = hidden ? 'hidden' : 'visible';
    }
  }, []);

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    const action = parseNightDeskCommand(typed);
    setTyped('');
    if (action.type === 'keep') {
      keepWithPersistence();
      return;
    }
    act(action);
  }

  const canKeep = canKeepNightDesk(state);
  const sampleButtons: { label: string; run: () => void }[] = [];
  if (stage === 'conversation' || stage === 'evidence') {
    sampleButtons.push({ label: F.sampleLines.compare, run: () => act({ type: 'compare' }) });
  }
  if (stage !== 'arrival' && stage !== 'filed') {
    sampleButtons.push({ label: F.sampleLines.quote, run: () => act({ type: 'quote', amount: '100' }) });
  }
  if (amount === '100' && (stage === 'quote' || stage === 'revised')) {
    sampleButtons.push({ label: F.sampleLines.revise, run: () => act({ type: 'quote', amount: '50' }) });
  }
  if (canKeep) {
    sampleButtons.push({ label: F.sampleLines.file, run: keepWithPersistence });
  }
  if (stage !== 'arrival' && stage !== 'filed') {
    sampleButtons.push({ label: F.sampleLines.cancel, run: () => act({ type: 'cancel' }) });
  }

  const quote = amount ? F.quotes[amount] : null;
  const priorQuote = stage === 'revised' ? F.quotes['100'] : null;
  const kept = keptAmount ? F.quotes[keptAmount] : null;
  const folioShown = view === 'evidence';
  const slipShown = view === 'review';
  const ledgerShown = view === 'ledger';

  const contextualTitle =
    view === 'evidence' ? 'Two readings, two moments.' :
    view === 'ledger' ? (keptAmount ? 'Kept in the ledger.' : 'The ledger awaits a kept slip.') :
    view === 'review' ? (stage === 'revised' ? 'Revised. The earlier slip is set aside.' : 'Your instruction, on paper.') :
    'Jesse is at the desk.';

  return (
    <div className={styles.study} data-stage={stage} data-view={view}>
      <NightDeskScene view={view} stage={stage} onAnchors={onAnchors} />

      <header className={styles.masthead}>
        <div className={styles.brandBlock}>
          <HouseMark small className={styles.mark} />
          <span className={styles.brandText}><strong>CLAFLIN</strong><small>THE NIGHT DESK · JESSE · SOLANA</small></span>
        </div>
        <p className={styles.disclosure}>{F.disclosure}</p>
        <div className={styles.mastActions}>
          <button
            type="button"
            className={styles.soundToggle}
            aria-pressed={soundOn}
            disabled={!speechSupported}
            title={speechSupported ? 'Toggle scripted voice preview' : 'Browser voice preview unavailable'}
            onClick={() => {
              setSoundOn(on => !on);
              cancelSpeech();
            }}
          >
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {!speechSupported ? 'Voice unavailable' : soundOn ? 'Sound on' : 'Sound off'}
          </button>
          <button type="button" className={styles.mastLink} onClick={resetStudy}><RotateCcw size={14} />Reset study</button>
          <Link href="/" prefetch={false} className={styles.mastLink}><ArrowLeft size={14} />Working desk</Link>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <p className={styles.srOnly} role="status" aria-live="polite">{line}</p>

        <nav className={styles.roomLabels} aria-label="Objects in the room">
          <button type="button" ref={evidenceLabelRef} className={styles.objectLabel} onClick={() => act({ type: 'compare' })}>
            <LineChart size={13} />The two markets
          </button>
          <button type="button" ref={reviewLabelRef} className={styles.objectLabel} onClick={() => act({ type: 'view', view: 'review' })}>
            <FileText size={13} />Your instruction
          </button>
          <button type="button" ref={ledgerLabelRef} className={styles.objectLabel} onClick={() => act({ type: 'view', view: 'ledger' })}>
            <BookOpen size={13} />The ledger
          </button>
        </nav>

        {stage === 'arrival' ? (
          <section className={styles.intro} aria-labelledby="night-heading">
            <p className={styles.eyebrow}>A PRIVATE BROKERAGE · AFTER HOURS</p>
            <h1 id="night-heading" className={styles.headline}>A little distance.<br />A clearer view.</h1>
            <div className={styles.introActions}>
              <button type="button" className={styles.primary} onClick={() => act({ type: 'begin' })}>
                Take the line <ArrowRight size={16} />
              </button>
              <p className={styles.caption}>{F.conversationDisclosure}</p>
              <button type="button" className={styles.secondary} onClick={() => { focusRequested.current = true; act({ type: 'begin' }); }}>
                Write an instruction
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.context} aria-label="Current step">
            <p className={styles.contextTitle}>{contextualTitle}</p>
          </section>
        )}

        {folioShown && (
          <aside className={styles.folio} aria-label="The two market readings">
            <p className={styles.folioKicker}>THE TWO MARKETS</p>
            <div className={styles.reading}>
              <span className={styles.trackLabel}>I · {F.equity.label}</span>
              <strong className={styles.price}>{F.equity.price}</strong>
              <span className={styles.stamp}><u>{F.equity.time}</u> — {F.equity.state}</span>
            </div>
            <div className={styles.reading}>
              <span className={styles.trackLabel}>II · {F.token.label}</span>
              <strong className={styles.price}>{F.token.price}</strong>
              <span className={styles.stamp}><u>{F.token.time}</u> — {F.token.state}</span>
            </div>
            <dl className={styles.difference}>
              <div><dt>{F.comparison.label}</dt><dd>{F.comparison.difference}</dd></div>
            </dl>
            <p className={styles.caveat}>{F.comparison.caveat}</p>
            <p className={styles.folioFine}>{F.comparison.disclosure}</p>
          </aside>
        )}

        {slipShown && (
          <aside className={styles.slip} aria-label="Example quotation slip" key={amount ?? 'empty'}>
            {quote ? (
              <>
                {priorQuote && (
                  <div className={styles.superseded} aria-label="Superseded slip">
                    <s>{priorQuote.spend} → {priorQuote.receive}</s>
                    <span>SUPERSEDED</span>
                  </div>
                )}
                <p className={styles.slipKicker}>{quote.route} · {quote.id}</p>
                <div className={styles.slipBody}>
                  <div><span>Spend</span><strong>{quote.spend}</strong></div>
                  <div><span>Illustrative receipt</span><strong>{quote.receive}</strong></div>
                  <div><span>Instrument</span><strong>{F.instrument.symbol} — {F.instrument.name}</strong></div>
                </div>
                <p className={styles.slipFine}>{F.quoteDisclosure}</p>
              </>
            ) : (
              <>
                <p className={styles.slipKicker}>YOUR INSTRUCTION</p>
                <p className={styles.slipEmpty}>The blotter is clear. No slip has been written yet — ask Jesse for an example quotation and it will rest here for review.</p>
                <button type="button" className={styles.slipAction} onClick={() => act({ type: 'quote', amount: '100' })}>
                  Quote an example <ArrowRight size={14} />
                </button>
              </>
            )}
          </aside>
        )}

        {ledgerShown && (
          <aside className={styles.ledgerCard} aria-label="The study ledger">
            <p className={styles.folioKicker}>THE LEDGER</p>
            {kept ? (
              <>
                <div className={styles.entry}>
                  <div>
                    <strong>{kept.spend} → {kept.receive}</strong>
                    <span>{kept.id} · example record · read only</span>
                  </div>
                </div>
                <button type="button" className={styles.slipAction} aria-expanded={showKept} onClick={() => setShowKept(open => !open)}>
                  Bring the kept slip forward
                </button>
                {showKept && (
                  <div className={styles.keptDetail}>
                    <div><span>Spend</span><strong>{kept.spend}</strong></div>
                    <div><span>Illustrative receipt</span><strong>{kept.receive}</strong></div>
                    <div><span>Route</span><strong>{kept.route}</strong></div>
                    <div><span>Reference</span><strong>{kept.id}</strong></div>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.folioFine}>Nothing kept yet. A filed example slip appears here.</p>
            )}
            <p className={styles.folioFine}>Example records stay in this tab. Reset clears this study only.</p>
          </aside>
        )}

        {stage !== 'arrival' && (
          <section className={styles.conversation} aria-label="Scripted conversation">
            <div className={styles.jesseLine}>
              <span className={styles.jesseLabel}>JESSE / SCRIPTED</span>
              <p>{line}</p>
              <button type="button" className={styles.hearLine} onClick={hearLine}>
                <Volume2 size={13} />Hear this line
              </button>
              {voiceNote && <span className={styles.voiceNote}>{voiceNote}</span>}
            </div>
            <div className={styles.samples} role="group" aria-label="Say a scripted line">
              {sampleButtons.map(button => (
                <button key={button.label} type="button" onClick={button.run}>{button.label}</button>
              ))}
            </div>
            <form className={styles.typed} onSubmit={submitTyped}>
              <label className={styles.srOnly} htmlFor="night-instruction">Type an instruction</label>
              <input
                id="night-instruction"
                ref={inputRef}
                type="text"
                value={typed}
                onChange={event => setTyped(event.target.value)}
                placeholder="Write an instruction — e.g. “Quote 100 USDC of Apple.”"
                autoComplete="off"
              />
              <button type="submit" aria-label="Send instruction"><ArrowRight size={15} /></button>
            </form>
          </section>
        )}

        <nav className={styles.viewNav} aria-label="Room views">
          {VIEW_NAV.map(item => (
            <button
              key={item.view}
              type="button"
              aria-pressed={view === item.view}
              onClick={() => act({ type: 'view', view: item.view })}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </main>

      <footer className={styles.footer}>
        <details className={styles.about}>
          <summary>About this study</summary>
          <p>
            An experiential prototype of Jesse’s Solana desk. Every price, quote, and line is a labelled fixture —
            no market data, no mint, no provider, no microphone, no wallet. The room is rendered with WebGL when
            available; every action is a plain HTML control. {F.instrument.identity}
          </p>
        </details>
        <span className={styles.footerMark}>EVENING, NOT URGENCY.</span>
      </footer>
    </div>
  );
}
