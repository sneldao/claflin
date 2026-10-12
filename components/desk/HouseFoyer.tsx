'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { DESK_CAPABILITIES, HOUSE_DESKS, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { useMarketBell } from '@/lib/use-market-clock';
import { bellLine, formatBellCountdown, type MarketClock, type NextBell } from '@/lib/market-clock';
import { requestRingOnArrival } from '@/lib/trading/line-signal';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { markPrice, type DeskMark, type MarksResult } from '@/lib/trading/marks-shared';
import { offeringForInstrument } from '@/lib/desk/offerings';
import { FOYER_BOUNDARY, FOYER_HEADLINES, FOYER_LEDE, WIRE_GAP_REFERENCE } from '@/lib/desk/ui-copy';
import { entryIntentFromInstruction, entryIntentWithInstruction, type EntryIntent } from '@/lib/house-entry';
import { soleOfferingForDesk } from '@/lib/desk/offerings-presentation';
import { instructionMatch, readInstruction } from '@/lib/desk/turret';
import { trackFunnel, trackInstruction } from '@/lib/funnel/client';
import { useHouseFilings } from '@/lib/trading/useLatestFiling';
import { LastFilingLine } from './LastFilingLine';
import { SessionEpilogue } from './SessionEpilogue';
import { HouseMark } from './HouseMark';
import { useHouseGraphics, useHouseScene, useHouseSceneApi } from './HouseScene';
import { GraphicsControl } from './GraphicsControl';
import { HouseOfferings } from './HouseOfferings';
import { HouseTurret } from './HouseTurret';
import { HouseDesks } from './HouseDesks';
import { HouseAnswers } from './HouseAnswers';
import { AnnotatedExampleCall } from '../foyer/AnnotatedExampleCall';
import { type WireMark } from '../foyer/QuoteColumn';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import { FOYER_RECEIPTS } from './foyer-receipts';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { truncateAddress, walletKind } from '@/lib/auth/identity';
import foyerStyles from './HouseFoyer.module.css';

/** The house's account affordance in the conventional top-right spot.
   Sign-in stays optional — a trade asks for the wallet, not the header —
   but the affordance exists so the product reads as what it is. */
function FoyerAuthChip() {
  const auth = useDeskAuth();
  const wrapRef = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  if (!auth.enabled) return null;
  if (!auth.authenticated) {
    return (
      <button
        type="button"
        className={foyerStyles.authChip}
        onClick={auth.login}
        title="Optional — you sign only when a trade asks for your wallet."
      >
        Sign in
      </button>
    );
  }

  const close = () => { if (wrapRef.current) wrapRef.current.open = false; };
  const kind = auth.walletAddress ? walletKind(auth.walletAddress) : null;
  const explorer = auth.walletAddress
    ? kind === 'sol'
      ? `https://solscan.io/account/${auth.walletAddress}`
      : `https://${auth.walletChainId === 8453 ? 'basescan.org' : 'etherscan.io'}/address/${auth.walletAddress}`
    : null;
  const seed = auth.walletAddress ?? auth.userId ?? auth.label ?? 'account';
  const hue = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const dot = `hsl(${hue} 55% 58%)`;

  const copyWallet = () => {
    if (!auth.walletAddress || !navigator.clipboard) return;
    void navigator.clipboard.writeText(auth.walletAddress).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  return (
    <details ref={wrapRef} className={foyerStyles.authWrap}
      onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <summary className={foyerStyles.authChip} data-signed="true" title={auth.label ?? 'Signed in'}>
        <span className={foyerStyles.authDot} style={{ backgroundColor: dot }} aria-hidden="true" />
        {auth.label ?? 'Signed in'}
        <span className={foyerStyles.authCaret} aria-hidden="true">▾</span>
      </summary>
      <div className={foyerStyles.authBackdrop} aria-hidden="true" onClick={close} />
      <div className={foyerStyles.authPanel} role="group" aria-label="Account">
        <p className={foyerStyles.authPanelLead}>Signed in as</p>
        <p className={foyerStyles.authPanelId} title={auth.userId ?? undefined}>
          <span className={foyerStyles.authDot} style={{ backgroundColor: dot }} aria-hidden="true" />
          {auth.label ?? 'Account'}
        </p>
        {auth.walletAddress ? (
          <div className={foyerStyles.authWalletRow}>
            <button
              type="button"
              className={foyerStyles.authPanelButton}
              onClick={copyWallet}
              title={copied ? 'Address copied' : `Copy ${auth.walletAddress}`}
            >
              {copied ? 'Copied ✓' : `${truncateAddress(auth.walletAddress)} ⧉`}
            </button>
            {explorer && (
              <a className={foyerStyles.authPanelButton} href={explorer} target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            )}
          </div>
        ) : (
          <button type="button" className={foyerStyles.authPanelButton} onClick={() => { close(); auth.linkWallet(); }}>
            Link a wallet
          </button>
        )}
        <button type="button" className={foyerStyles.authPanelButton} onClick={auth.logout}>Sign out</button>
      </div>
    </details>
  );
}

/* The brass register — one stop per room, in document order. The measure
   loop keys both rail and lamp pool off main.children, so keep aligned. */
const ROOMS = [
  { id: 'the-line', label: 'Line' },
  { id: 'the-tape', label: 'Wire' },
  { id: 'house-example', label: 'Example' },
  { id: 'house-offerings', label: 'Board' },
  { id: 'house-method', label: 'Method' },
  { id: 'house-desks', label: 'Desks' },
  { id: 'house-answers', label: 'Answers' },
] as const;

/** The house-book instruction a wire mark stands for — the plain underlying ticker. */
function instructionForMark(mark: DeskMark): string {
  return offeringForInstrument(mark.instrumentId)?.underlyingSymbol
    ?? mark.symbol.replace(/[a-z]+$/, '');
}

/* The prove-it drawer — disclosure as proof. Every claim the house makes is a
   receipt with a link to the thing that proves it: the source, the CI run, an
   onchain transaction, the env names. Crypto judges read don't-trust-verify as
   the interface, so the disclosure is the furniture, not a disclaimer. The
   receipt data (public repository links and a published devnet transaction)
   lives in ./foyer-receipts so the pre-commit secret scanner can allowlist
   that public-identifier module without blinding this component's wallet chip. */

/**
 * Claflin foyer — the market and the brokers' lines are the hero: a live
 * market clock, the tape, and one card per desk whose line is connected.
 */
export function HouseFoyer({ onEnter, sceneLive = true }: { onEnter: (id: HouseDeskId, offeringId?: string, intent?: EntryIntent | null, recordId?: string | null) => void; /** False while entry is still pending — the shared scene stays still so a desk URL never boots WebGL in the pass-through. */ sceneLive?: boolean }) {
  const openDesks = HOUSE_DESKS.filter(desk => isOpenDesk(desk.id));
  const planned = HOUSE_DESKS.filter(desk => !isOpenDesk(desk.id));
  /* Every open desk gets a line — voice desks take calls, typed-only desks
     like Tennie take instructions. The turret renders the affordance each
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
  const tennieOpen = isOpenDesk('tennie');
  const hettyMarks = useReferenceMarks('hetty');
  const jesseMarksRead = useReferenceMarks(jesseOpen ? 'jesse' : 'hetty');
  const jesseMarks = jesseOpen ? jesseMarksRead : null;
  const tennieMarksRead = useReferenceMarks(tennieOpen ? 'tennie' : 'hetty');
  const tennieMarks = tennieOpen ? tennieMarksRead : null;
  /* The house-book instruction lives here so a wire-mark click can write it. */
  const [wireInstruction, setWireInstruction] = useState('');
  const [instructionSource, setInstructionSource] = useState<'spoken' | 'typed' | 'picked'>('typed');
  const setInstruction = (text: string, source: 'spoken' | 'typed') => {
    setWireInstruction(text);
    setInstructionSource(source);
  };
  const filings = useHouseFilings();
  const filing = filings[0] ?? null;

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

  const sharedScene = useHouseScene({ visible: true, layout: 'foyer', view: 'desk', stage: 'arrival', still: !sceneLive });
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

  /* Room measure — one scroll loop drives three signals:
       · the lamp pool warms the room under the reading plane (--room-glow)
       · the brass register marks the current room (aria-current)
       · the pinned hero yields the frame (--hero-exit → data-away) as the
         book slides in
     The register and hero exit run in every mode — they're layout, not
     motion; only the glow is skipped under reduced motion. */
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rooms = Array.from(main.children) as HTMLElement[];
    const hero = rooms[0];
    const stops = railRef.current ? Array.from(railRef.current.querySelectorAll('a')) : [];
    let raf = 0;
    const measure = () => {
      raf = 0;
      const focal = window.innerHeight * 0.5;
      const band = window.innerHeight * 0.3;
      let active = 0;
      let best = -1;
      rooms.forEach((room, i) => {
        const box = room.getBoundingClientRect();
        const center = box.top + box.height / 2;
        const dist = Math.max(0, Math.abs(center - focal) - band) / (window.innerHeight * 0.5);
        const glow = Math.max(0, 1 - dist);
        if (!reduced) room.style.setProperty('--room-glow', glow.toFixed(3));
        if (glow > best) { best = glow; active = i; }
      });
      stops.forEach((stop, i) => {
        if (i === active) stop.setAttribute('aria-current', 'true');
        else stop.removeAttribute('aria-current');
      });
      /* The pin exists only on wide, motion-allowed viewports — the same
         gate the CSS uses, so the exit signal never fires where it can't. */
      const pinned = !reduced && window.innerWidth > 760;
      const exit = hero && pinned && hero.offsetHeight > 0
        ? Math.min(1, Math.max(0, window.scrollY / (hero.offsetHeight * 0.8)))
        : 0;
      if (hero) {
        hero.style.setProperty('--hero-exit', exit.toFixed(3));
        hero.toggleAttribute('data-away', exit > 0.75);
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
      for (const room of rooms) room.style.removeProperty('--room-glow');
    };
  }, []);

  /* Inertial scroll — the page glides but never repositions the reader.
     Snap was removed: the rooms load live marks, lazy portraits and the
     deal animation after mount, so the claim zones kept moving under the
     reader and pulling the scroll back to a boundary. Reduced motion
     keeps the browser's native scroll. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let lenis: { destroy(): void } | null = null;
    let cancelled = false;
    void import('lenis')
      .then(lenisModule => {
        if (cancelled || !mainRef.current) return;
        lenis = new lenisModule.default({ autoRaf: true, duration: 1.1, smoothWheel: true });
      })
      .catch(() => { /* native scroll stands if the module fails to load */ });
    return () => {
      cancelled = true;
      lenis?.destroy();
    };
  }, []);

  const liveAvailable = openDesks.some(desk => DESK_CAPABILITIES[desk.id].live);
  /* The merged wire marks are computed once — the tape and the quotation
     column in the answers room read the same list, no second derivation. */
  const wireMarks = wireMarksOf(hettyMarks, jesseMarks, tennieMarks);

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
        <FoyerAuthChip />
      </header>

      <main id="main-content" tabIndex={-1} ref={mainRef} className={foyerStyles.main}>
        <section className={foyerStyles.hero} id="the-line" aria-labelledby="foyer-title">
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
            {filings.length >= 2 ? (
              <SessionEpilogue
                filings={filings}
                onOpen={record => {
                  window.scrollTo({ top: 0, behavior: 'instant' });
                  onEnter(record.deskId, undefined, null, record.recordId);
                }}
              />
            ) : filing ? (
              <LastFilingLine
                filing={filing}
                className={foyerStyles.returnFiling}
                onOpen={() => {
                  window.scrollTo({ top: 0, behavior: 'instant' });
                  onEnter(filing.deskId, undefined, null, filing.recordId);
                }}
              />
            ) : null}
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

        <LiveWire hetty={hettyMarks} jesse={jesseMarks} tennie={tennieMarks} marks={wireMarks} market={market} onPick={pickFromWire} />

        <AnnotatedExampleCall />

        <div className={`${foyerStyles.vista} ${foyerStyles.vistaRead}`} aria-hidden="true">
          <p className={foyerStyles.vistaCaption}>every instruction starts as a voice</p>
        </div>

        <HouseOfferings
          onEnter={(...args: Parameters<typeof onEnter>) => {
            commitInstruction(wireInstruction, instructionSource);
            onEnter(...args);
          }}
          instruction={wireInstruction}
          instructionSource={instructionSource}
          marks={{ hetty: hettyMarks, jesse: jesseMarks, tennie: tennieMarks }}
        />

        <section className={foyerStyles.method} id="house-method" aria-labelledby="house-method-title">
          <h2 id="house-method-title">How the line works.</h2>
          <div className={foyerStyles.methodBody}>
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
            {/* The posted notice — the office's pinned rules, restating the
                house's actual boundaries in plain type. Real rules, period
                framing; never fabricated notices. */}
            <aside className={foyerStyles.postedNotice} aria-label="Posted house rules">
              <p className={foyerStyles.postedKicker}>Posted</p>
              <ul className={foyerStyles.postedRules}>
                <li>Only you can sign.</li>
                <li>Voice never moves funds.</li>
                <li>Paper by default.</li>
                <li>Estimates expire. Records are paper.</li>
              </ul>
            </aside>
          </div>
        </section>

        <div className={`${foyerStyles.vista} ${foyerStyles.vistaOpen}`} aria-hidden="true">
          <p className={foyerStyles.vistaCaption}>each desk owes you an estimate</p>
        </div>

        <HouseDesks
          desks={openDesks}
          deskHref={id => deskHref(id, null, null)}
          onOpen={enter}
        />

        <HouseAnswers marks={wireMarks} />

        <div className={`${foyerStyles.vista} ${foyerStyles.vistaClose}`} aria-hidden="true">
          <p className={foyerStyles.vistaCaption}>the last inch is yours</p>
        </div>
      </main>

      {/* The brass register — which room you're in, and a way to jump. */}
      <nav ref={railRef} className={foyerStyles.roomRail} aria-label="The rooms">
        {ROOMS.map(room => (
          <a key={room.id} href={`#${room.id}`}>
            <span>{room.label}</span>
            <i aria-hidden="true" />
          </a>
        ))}
      </nav>

      <footer className={foyerStyles.footer}>
        <p className={foyerStyles.colophonRule} aria-hidden="true"><span>❦</span></p>
        <HouseMark small className={foyerStyles.footerMark} />
        <span>THE TAPE RUNS ALL NIGHT. EVERY SLIP ON THE RECORD.</span>
        {planned.length > 0 && (
          <span className={foyerStyles.footerPlanned}>
            Not yet seated — {planned.map(d => `${d.shortName} (${d.market})`).join(' · ')}
          </span>
        )}
        <nav className={foyerStyles.footerLinks} aria-label="House">
          <a href="#house-answers">Straight answers</a>
          <a href="#house-offerings">Product terms</a>
          <a href="https://github.com/sneldao/claflin" target="_blank" rel="noreferrer">Source ↗</a>
          <GraphicsControl className={foyerStyles.footerGraphics} panelUp />
        </nav>
        <p className={foyerStyles.colophon}>SET IN FRAUNCES &amp; IBM PLEX · CLAFLIN · EST. MMXXVI</p>
        <p className={foyerStyles.footerRisk}>
          Tokenized stocks carry issuer, custody, liquidity and smart-contract risk, and their prices can
          differ from the listed share. Claflin is not a broker-dealer and gives no investment advice.
          Paper records are simulations.
        </p>
        <details className={foyerStyles.receipts}>
          <summary className={foyerStyles.receiptsSummary}>
            Every claim on this page has a receipt <span aria-hidden="true">→</span>
          </summary>
          <ul className={foyerStyles.receiptsList}>
            {FOYER_RECEIPTS.map(receipt => (
              <li key={receipt.claim}>
                <a href={receipt.href} target="_blank" rel="noreferrer">
                  <strong>{receipt.claim}</strong>
                  <span>{receipt.note}</span>
                  <code>{receipt.label}</code>
                </a>
              </li>
            ))}
          </ul>
        </details>
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

function wireMarksOf(hetty: MarksRead, jesse: MarksRead | null, tennie: MarksRead | null): WireMark[] {
  return [
    ...(hetty.result?.marks ?? []).map(mark => ({ key: `base:${mark.instrumentId}`, rail: 'BASE' as const, mark, asOf: hetty.result?.asOf })),
    ...(jesse?.result?.marks ?? []).map(mark => ({ key: `sol:${mark.instrumentId}`, rail: 'SOL' as const, mark, asOf: jesse?.result?.asOf })),
    ...(tennie?.result?.marks ?? []).map(mark => ({ key: `rh:${mark.instrumentId}`, rail: 'RH' as const, mark, asOf: tennie?.result?.asOf })),
  ];
}

function LiveWire({ hetty, jesse, tennie, marks: wireMarks, market, onPick }: { hetty: MarksRead; jesse: MarksRead | null; tennie: MarksRead | null; marks: WireMark[]; market: { clock: MarketClock; bell: NextBell | null } | null; onPick: (symbol: string) => void }) {
  const failed = hetty.failed && (jesse?.failed ?? true) && (tennie?.failed ?? true);

  const [ticks, setTicks] = useState<Record<string, 'up' | 'down'>>({});
  const [seen, setSeen] = useState<{ hetty: MarksResult | null; jesse: MarksResult | null; tennie: MarksResult | null }>({ hetty: hetty.result, jesse: jesse?.result ?? null, tennie: tennie?.result ?? null });

  /* Compare successive real readings only — a tick exists only when a refresh
     actually moved the price. */
  if (hetty.result !== seen.hetty || (jesse?.result ?? null) !== seen.jesse || (tennie?.result ?? null) !== seen.tennie) {
    const prior = wireMarksOf({ result: seen.hetty, failed: false }, { result: seen.jesse, failed: false }, { result: seen.tennie, failed: false });
    setSeen({ hetty: hetty.result, jesse: jesse?.result ?? null, tennie: tennie?.result ?? null });
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
    /* The tape mounts only once marks land — rerun when the track appears. */
  }, [wireMarks.length]);

  return (
    <section className={foyerStyles.wire} id="the-tape" aria-label="Live reference marks">
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
      {/* The house hours — the thesis in one strip: the listing exchange
          keeps a session; every onchain rail under this roof does not. */}
      <p className={foyerStyles.wireHours} aria-label="House hours">
        <span className={foyerStyles.wireHoursLabel}>House hours</span>
        <span data-state={market?.clock.exchange ?? 'pending'}>
          NYSE {market ? market.clock.exchange : '—'}
          {market?.bell ? ` · ${market.bell.kind} in ${formatBellCountdown(market.bell.minutes)}` : ''}
        </span>
        <span data-state="open">SOLANA open</span>
        <span data-state="open">BASE open</span>
        <span data-state="open">RH CHAIN open</span>
      </p>
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
