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

export function HalleyLaunchCard({
  draft, anchorMarkUsd, busy, canDraw, primaryLabel, onEdit, onDraw, onCustomise, voiceLines, onSay,
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
    <div className={styles.card} id="halley-card">
      <label className={styles.nameLabel} htmlFor="halley-card-name">Name your tracker</label>
      <div className={styles.nameRow}>
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
      <div className={styles.tiles} role="group" aria-labelledby="halley-card-tracks">
        {anchors.map(sym => {
          const active = chosen && draft.anchorSymbol === sym;
          return (
            <button key={sym} type="button" className={styles.tile} aria-pressed={active} data-active={active} onClick={() => pick(sym)}>
              <strong>{EQUITY_NAMES[sym] ?? sym}</strong>
              <span>{active && anchorMarkUsd ? `$${anchorMarkUsd.toFixed(2)}` : sym}</span>
            </button>
          );
        })}
        <button type="button" className={styles.tile} aria-pressed={chosen && draft.anchorSymbol === null} data-active={chosen && draft.anchorSymbol === null} onClick={() => pick(null)}>
          <strong>Nothing</strong>
          <span>opens at 1.0</span>
        </button>
      </div>

      {chosen && (
        <div className={styles.preview}>
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
