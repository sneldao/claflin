'use client';

/**
 * The launch card — Halley's default surface. One screen, one big thing, one
 * button: a name, what it tracks, a curve you can play with, and Launch.
 * Every economic term is pencilled by the house and lives one tap away in
 * Customise (the full slip); nothing here asks the caller to know what a
 * quote asset or a graduation line is.
 *
 * Presentational: the desk owns the draft and the estimate; the card only
 * reads it and proposes edits through the same `onEdit` every other path uses.
 */

import { useEffect, useRef, useState } from 'react';
import type { HalleyDraft } from '@/lib/meteora/contracts';
import { HOUSE_SUPPLY, houseGraduation } from '@/lib/meteora/plate';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { BlotterHearables } from './BlotterHearables';
import { HalleyCurvePreview } from './HalleyCurvePreview';
import styles from './HalleyLaunchCard.module.css';

const EQUITY_NAMES: Record<string, string> = { AAPL: 'Apple', NVDA: 'NVIDIA', TSLA: 'Tesla' };

/** A ticker the house can pencil from a name: letters and digits, 2–10. */
export function tickerFromName(name: string): string | null {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0].slice(0, 10);
  const ticker = first.length >= 3 || words.length === 1 ? first : words.join('').slice(0, 10);
  return ticker.length >= 2 ? ticker : null;
}

/** A graduation amount that reads like a number a person would say. */
export function roundGraduation(quote: number): string {
  if (quote >= 100) return String(Math.round(quote));
  if (quote >= 1) return String(Number(quote.toFixed(1)));
  return String(Number(quote.toFixed(2)));
}

/** How far the price travels from opening to the open market, as a fraction:
    in this projection it is exactly raised ÷ (opening price × supply). */
export function priceMoveFor(openingPrice: number | null, supply: number, graduationQuote: number): number | null {
  if (openingPrice === null || !(openingPrice > 0) || !(supply > 0) || !(graduationQuote > 0)) return null;
  return graduationQuote / (openingPrice * supply);
}

/** A small move in words a person can read: "+0.07%", "under 0.01%". */
export function formatMove(move: number): string {
  const pct = move * 100;
  if (pct < 0.01) return 'under 0.01%';
  return `+${pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}

/** The one thing still between the caller and the launch, in plain words. */
export function nudgeFor(draft: HalleyDraft, chosen: boolean): string {
  const needName = !draft.name?.trim() || !draft.symbol;
  if (needName && !chosen) return 'Name it and pick what it tracks to see the launch.';
  if (needName) return 'Give it a name — two letters or more.';
  if (!chosen) return 'Pick what it tracks to see the launch.';
  return 'Almost there — open Customise to finish the figures.';
}

export type CardRegion = 'name' | 'tiles' | 'preview';

/** What the line just did that the card should answer: a write (the fields
    Halley said), a refusal (heard, and answered with a no), or an
    explanation (a slip target). `at` restarts the pulse. */
export interface CardHeard {
  kind?: 'write' | 'refused';
  said?: readonly (keyof HalleyDraft)[];
  /** A refused ask: the plain sentence the card's echo carries. */
  note?: string;
  target?: string;
  at: number;
}

const REGION_FOR_FIELD: Record<keyof HalleyDraft, CardRegion> = {
  name: 'name', symbol: 'name',
  anchorSymbol: 'tiles', quoteSymbol: 'tiles',
  curve: 'preview', supply: 'preview', graduationQuote: 'preview',
};
/* The slip's explanation targets, read on the card. Anything else (the
   orientation fold, the path, the plate) exists on both surfaces already. */
const REGION_FOR_TARGET: Record<string, CardRegion> = {
  'halley-step-1': 'name',
  'halley-step-2': 'tiles',
  'halley-step-3': 'preview',
  'halley-fine-tune': 'preview',
  'halley-grad': 'preview',
  'halley-supply': 'preview',
};

/** The part of the card that answers what was heard. The curve only exists
    once the launch tracks something, so until then the tiles answer for it. */
export function regionFor(heard: CardHeard | null, chosen: boolean): CardRegion | null {
  if (!heard) return null;
  const region = heard.said?.length ? REGION_FOR_FIELD[heard.said[0]] : heard.target ? REGION_FOR_TARGET[heard.target] ?? null : null;
  return region === 'preview' && !chosen ? 'tiles' : region;
}

/** One plain sentence for what Halley just wrote — the card's echo line. */
export function echoFor(said: readonly (keyof HalleyDraft)[] | undefined, draft: HalleyDraft): string | null {
  const field = said?.[0];
  if (!field) return null;
  const quote = draft.quoteSymbol ?? 'USDC';
  switch (field) {
    case 'name':
    case 'symbol':
      return draft.name ? `Halley named it ${draft.name}${draft.symbol ? ` ($${draft.symbol})` : ''}.` : null;
    case 'anchorSymbol':
      return draft.anchorSymbol
        ? `Halley set it to track ${EQUITY_NAMES[draft.anchorSymbol] ?? draft.anchorSymbol}.`
        : 'Halley set it to track nothing — it opens at 1.0.';
    case 'quoteSymbol':
      return `Halley set it to be paid in ${quote}.`;
    case 'curve':
      return draft.curve ? `Halley chose the ${draft.curve === 'equity-pair' ? 'equity pair' : draft.curve} curve.` : null;
    case 'supply':
      return draft.supply ? `Halley set ${Number(draft.supply).toLocaleString('en-US')} tokens.` : null;
    case 'graduationQuote':
      return draft.graduationQuote ? `Halley moved the open-market line to ${draft.graduationQuote} ${quote}.` : null;
    default:
      return null;
  }
}

export function HalleyLaunchCard({
  draft, anchorMarkUsd, busy, canDraw, primaryLabel, onEdit, onDraw, onCustomise, voiceLines, onSay, heard = null, awaiting = false, anticipating = false,
}: {
  draft: HalleyDraft;
  /** The selected anchor's live USD mark, when the desk has read one. */
  anchorMarkUsd: number | null;
  busy: boolean;
  canDraw: boolean;
  primaryLabel: string;
  onEdit: (partial: Partial<HalleyDraft>) => void;
  onDraw: () => void;
  onCustomise: () => void;
  voiceLines: readonly string[];
  onSay: (line: string) => void;
  /** The line's latest write or explanation — the card answers it visibly. */
  heard?: CardHeard | null;
  /** The caller just spoke and the line has not answered yet — the card
      waits, visibly, so the silence between sentences feels inhabited. */
  awaiting?: boolean;
  /** The estimate ceremony is in motion — the preview anticipates it. */
  anticipating?: boolean;
}) {
  const anchors = SOLANA_INSTRUMENTS.map(i => i.underlyingSymbol);
  const chosen = draft.quoteSymbol !== null;
  const quote = draft.quoteSymbol ?? 'USDC';
  const supply = Number(draft.supply ?? HOUSE_SUPPLY);
  const graduation = Number(draft.graduationQuote ?? houseGraduation(quote) ?? '150');
  /* The sketch needs an opening price in quote units. USDC: the equity's
     dollar mark, or 1.0 unanchored. An xStock quote is a ratio of two marks
     the card does not hold — the preview rests and review shows the truth. */
  const openingPrice = quote !== 'USDC' ? null : draft.anchorSymbol ? anchorMarkUsd : 1;

  /* The card answers the conversation: the part Halley just touched takes a
     brief ink pulse, one line says what changed, and on a phone — where the
     docked call sits above — that part is brought into view. A refusal is
     answered in a softer, warmer voice than a write. */
  const region = regionFor(heard, chosen);
  const refused = heard?.kind === 'refused';
  const echo = refused ? (heard?.note ?? null) : echoFor(heard?.said, draft);
  const regionRefs = useRef<Partial<Record<CardRegion, HTMLDivElement | null>>>({});
  const heardAt = heard?.at ?? null;
  useEffect(() => {
    if (heardAt === null || !region) return;
    if (!window.matchMedia?.('(max-width: 760px)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    regionRefs.current[region]?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [heardAt, region]);

  /* The echo breathes. A fresh write shows it; after five seconds of quiet
     it fades, so the next wave does not pile on the last. Restarts whenever
     a new write arrives (heardAt is the dependency). */
  const [echoStale, setEchoStale] = useState(false);
  useEffect(() => {
    if (!echo || heardAt === null) { setEchoStale(false); return; }
    setEchoStale(false);
    const id = window.setTimeout(() => setEchoStale(true), 5200);
    return () => window.clearTimeout(id);
  }, [echo, heardAt]);
  const pulse = (r: CardRegion) => (region === r && heardAt !== null
    ? <span key={heardAt} className={refused ? `${styles.heard} ${styles.heardRefused}` : styles.heard} aria-hidden="true" />
    : null);

  const setName = (value: string) => {
    const name = value || null;
    /* The ticker follows the name until the caller makes it their own. */
    const pencilled = !draft.symbol || draft.symbol === tickerFromName(draft.name ?? '');
    onEdit(pencilled ? { name, symbol: tickerFromName(value) } : { name });
  };
  const pick = (anchorSymbol: string | null) => {
    onEdit({ anchorSymbol, quoteSymbol: draft.quoteSymbol ?? 'USDC' });
  };

  return (
    <div className={styles.card} id="halley-card" data-awaiting={awaiting && !echo && !refused ? 'true' : 'false'}>
      <label className={styles.nameLabel} htmlFor="halley-card-name">Name your tracker</label>
      <div className={styles.nameRow} data-region="name" ref={el => { regionRefs.current.name = el; }}>
        {pulse('name')}
        <input
          id="halley-card-name"
          className={styles.name}
          autoComplete="off"
          value={draft.name ?? ''}
          placeholder="e.g. Comet Tracker"
          maxLength={40}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && canDraw && !busy) { event.preventDefault(); onDraw(); } }}
        />
        {draft.symbol && <span className={styles.ticker} aria-label={`Ticker ${draft.symbol}`}>${draft.symbol}</span>}
      </div>

      <p className={styles.askLabel} id="halley-card-tracks">What does it track?</p>
      <div className={styles.tiles} role="group" aria-labelledby="halley-card-tracks" data-region="tiles" ref={el => { regionRefs.current.tiles = el; }}>
        {pulse('tiles')}
        {anchors.map(sym => {
          const active = chosen && draft.anchorSymbol === sym;
          return (
            <button
              key={sym}
              type="button"
              className={styles.tile}
              aria-pressed={active}
              data-active={active}
              data-flipped={active && heard?.at && region === 'tiles' ? heard.at : undefined}
              onClick={() => pick(sym)}
            >
              <strong>{EQUITY_NAMES[sym] ?? sym}</strong>
              <span>{active && anchorMarkUsd ? `$${anchorMarkUsd.toFixed(2)}` : sym}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={styles.tile}
          aria-pressed={chosen && draft.anchorSymbol === null}
          data-active={chosen && draft.anchorSymbol === null}
          data-flipped={chosen && draft.anchorSymbol === null && heard?.at && region === 'tiles' ? heard.at : undefined}
          onClick={() => pick(null)}
        >
          <strong>Nothing</strong>
          <span>opens at 1.0</span>
        </button>
      </div>

      {chosen && (
        <div className={styles.preview} data-region="preview" data-anticipate={anticipating ? 'true' : 'false'} ref={el => { regionRefs.current.preview = el; }}>
          {pulse('preview')}
          <HalleyCurvePreview
            openingPrice={openingPrice}
            supply={Number.isFinite(supply) && supply > 0 ? supply : null}
            preset={draft.curve ?? 'equity-pair'}
            quoteSymbol={quote}
            graduationQuote={Number.isFinite(graduation) && graduation > 0 ? graduation : 150}
            minGraduationQuote={quote === 'USDC' ? 10 : 0.1}
            onGraduationChange={q => onEdit({ graduationQuote: roundGraduation(q) })}
            label="Drag the marker to set when it moves to the open market"
          />
          <p className={styles.terms}>
            Paid in {quote} · {supply.toLocaleString('en-US')} tokens
            {draft.anchorSymbol ? ` · starts at ${EQUITY_NAMES[draft.anchorSymbol] ?? draft.anchorSymbol}’s price` : ''}
          </p>
          {(() => {
            const move = priceMoveFor(openingPrice, supply, graduation);
            return move !== null && move < 0.01 ? (
              <p className={styles.terms} data-flat="true">
                At this size the price barely moves ({formatMove(move)}) — a tracker that opens at a share’s price needs a large raise to shift it.
              </p>
            ) : null;
          })()}
        </div>
      )}

      <p className={styles.echo} role="status" aria-live="polite" data-heard={echo ? 'true' : 'false'} data-refused={refused ? 'true' : 'false'} data-stale={echoStale ? 'true' : 'false'}>
        {echo
          ? <span key={heardAt ?? 0}>{echo}</span>
          : awaiting
            ? <span key="awaiting" className={styles.awaiting} aria-hidden="true">· · ·</span>
            : null}
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.launch} disabled={!canDraw || busy} onClick={onDraw}>
          {primaryLabel}
        </button>
        <button type="button" className={styles.customise} onClick={onCustomise}>Customise</button>
      </div>
      {!canDraw && !busy && (
        <p className={styles.nudge} id="halley-card-nudge">{nudgeFor(draft, chosen)}</p>
      )}

      <div className={styles.voice}>
        <BlotterHearables lines={voiceLines} onSay={onSay} />
      </div>
    </div>
  );
}
