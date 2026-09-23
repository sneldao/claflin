'use client';

import type { DeskMark } from '@/lib/trading/marks-shared';
import { markPrice, formatMarkAge } from '@/lib/trading/marks-shared';
import { formatBps } from '@/lib/desk/format-bps';
import { useBpsTick } from '@/lib/desk/use-bps-tick';
import type { MarketClock } from '@/lib/market-clock';
import styles from './WorkingDesk.module.css';

/**
 * The room's tape: one row per observed mark, said on the blotter rather
 * than as a widget grid. What the reference price *is* differs per desk —
 * Jesse's is the Jupiter venue price set against a stock reference; Hetty's
 * is the Chainlink valuation itself — so the caller names the legs. Rows
 * only render from observed readings; a stale tape says so.
 */
export function RoomTape({
  marks,
  stale,
  failed,
  asOf,
  clock,
  take,
  brokerName,
  priceLabel,
  missingSecondLeg = null,
  onSelect,
}: {
  marks: DeskMark[];
  stale?: boolean;
  failed?: boolean;
  asOf?: number;
  clock: MarketClock | null;
  take?: string | null;
  /** The broker whose take is attributed under the rows. */
  brokerName: string;
  /** What the primary price is: 'on Solana' (Jesse), 'Chainlink reference' (Hetty). */
  priceLabel: string;
  /** What to say when a mark has no second leg — null shows nothing extra. */
  missingSecondLeg?: string | null;
  onSelect: (instrumentId: string) => void;
}) {
  if (failed) return null;
  const rows = marks.filter(mark => mark.reference.status === 'observed' && markPrice(mark) !== null);
  if (rows.length === 0) return null;
  const heading = clock?.exchange === 'closed' ? 'Tonight’s tape' : 'The tape';
  return (
    <section className={styles.roomTape} aria-label={heading}>
      <h2 className={styles.roomTapeHeading}>{heading}</h2>
      {stale && asOf !== undefined && (
        <p className={styles.roomTapeStale} role="status">last reading {formatMarkAge(asOf)} ago</p>
      )}
      <ul className={styles.roomTapeRows}>
        {rows.map(mark => (
          <RoomTapeRow key={mark.instrumentId} mark={mark} priceLabel={priceLabel} missingSecondLeg={missingSecondLeg} onSelect={onSelect} />
        ))}
      </ul>
      {take && (
        <p className={styles.roomTapeTake}>
          {take}
          <span className={styles.roomTapeTakeBy}>{brokerName}’s take · a way of looking, not advice</span>
        </p>
      )}
    </section>
  );
}

function formatPctFromBps(raw: string | null): string | null {
  const value = Number(raw);
  if (raw === null || !Number.isFinite(value)) return null;
  const pct = Math.abs(value) / 100;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function RoomTapeRow({ mark, priceLabel, missingSecondLeg, onSelect }: {
  mark: DeskMark;
  priceLabel: string;
  missingSecondLeg: string | null;
  onSelect: (instrumentId: string) => void;
}) {
  const price = markPrice(mark);
  const bps = mark.stockReference?.differenceBps ?? null;
  const tick = useBpsTick(mark.instrumentId, bps);
  const ref = mark.stockReference;
  /* Full legs stay in the accessible name + hover title; the visible row is
     one line — price plus percent vs stock — so bps jargon never blocks. */
  const label = ref
    ? `${mark.symbol} $${price} ${priceLabel} · $${ref.priceUsd} stock ref · ${formatBps(bps, 'lower')}`
    : `${mark.symbol} $${price} ${priceLabel}${missingSecondLeg ? ` · ${missingSecondLeg}` : ''}`;
  const pct = formatPctFromBps(bps);
  return (
    <li>
      <button
        type="button"
        className={styles.roomTapeRow}
        data-tick={tick ?? undefined}
        onClick={() => onSelect(mark.instrumentId)}
        aria-label={`${label} — write it on the slip`}
        title={label}
      >
        <strong>{mark.symbol}</strong>
        <span>${price}</span>
        {ref && pct ? (
          <span className={styles.roomTapeBps}>
            {pct} vs stock{tick && <i aria-hidden="true">{tick === 'up' ? ' ▲' : ' ▼'}</i>}
          </span>
        ) : (
          missingSecondLeg && <span className={styles.roomTapeNoRef}>{missingSecondLeg}</span>
        )}
      </button>
    </li>
  );
}
