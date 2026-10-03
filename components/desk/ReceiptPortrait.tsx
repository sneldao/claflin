'use client';

import { type ReactNode } from 'react';
import type { HouseDesk, HouseDeskId } from '@/lib/house';
import { DESK_CANON, getDeskCanon } from '@/lib/desktop.canon';
import { getBaseExplorerTxUrl } from '@/lib/base-chain';
import { formatRecordedTime } from '@/lib/trading/desk-documents';
import deskStyles from './WorkingDesk.module.css';
import receiptStyles from './ReceiptPortrait.module.css';

/**
 * The receipt as a portrait — the single most important object in the
 * product. The user has just done a thing. The slip they were working on
 * is now *filed*: it sits inside a portrait paper object with the
 * date in display type, a stamp, a brass corner, and a small row of
 * honest affordances.
 *
 * The slip itself is unchanged — the receipt is the same document the
 * user was working on, just in a new state. The portrait gives that
 * state the design weight it deserves. The existing slip's
 * `mode: 'receipt'` rendering lives inside this envelope.
 *
 * The portrait does not invent any text. It only re-frames what the
 * slip already says, plus a few real facts the slip already carries:
 * the desk, the market, the venue, the timestamp, and (for live Base
 * fills) the transaction hash.
 */

export interface ReceiptPortraitProps {
  /** The active desk. The portrait carries the desk nameplate. */
  desk: HouseDesk;
  /** The receipt is filed — passes the slip's own timestamp. */
  filedAt: number | null;
  /** The receipt is a *live* settlement, not paper. The portrait renders
   *  the transaction hash link to Basescan when present. */
  txHash?: string | null;
  /** Affordances rendered in the receipt's small footer row. Callers
   *  own the buttons (e.g. "Back to desk", "Read it in your record",
   *  "Open another instruction"). */
  actions?: ReactNode;
  /** The slip itself, in `mode: 'receipt'`. */
  children: ReactNode;
  /** Optional override of the date label — defaults to the local
   *  representation of `filedAt`. */
  dateLabel?: string;
  /** Optional extra copy rendered in the portrait's footer (e.g. a
   *  receipt acknowledgement, a broker take, an evidence note). */
  trailing?: ReactNode;
}

/** A small kicker rendered above the slip: desk + market + venue. */
function ReceiptKicker({ desk }: { desk: HouseDesk }) {
  const canon = getDeskCanon(desk.id) ?? DESK_CANON.find(d => d.id === desk.id);
  const venue = canon?.venue ? ` · ${canon.venue}` : '';
  return (
    <p className={receiptStyles.kicker}>
      <span className={receiptStyles.kickerDesk}>{desk.name.toUpperCase()}</span>
      <span className={receiptStyles.kickerDot} aria-hidden="true">·</span>
      <span className={receiptStyles.kickerMarket}>{desk.market}</span>
      <span className={receiptStyles.kickerVenue}>{venue}</span>
    </p>
  );
}

/** The portrait's date in display type, with the day in longhand. */
function ReceiptDate({ filedAt, dateLabel }: { filedAt: number | null; dateLabel?: string }) {
  if (!filedAt && !dateLabel) {
    return <p className={receiptStyles.date} aria-hidden="true">&nbsp;</p>;
  }
  const label = dateLabel ?? (filedAt ? formatRecordedTime(filedAt) : '—');
  // Long form: "Saturday, the 3rd of October" — only on the portrait, never
  // in the slip itself. The slip's compact timestamp is the source of truth.
  const ts = filedAt ?? Date.now();
  const d = new Date(ts);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const day = d.getDate();
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  const year = d.getFullYear();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st'
    : day === 2 || day === 22 ? 'nd'
    : day === 3 || day === 23 ? 'rd'
    : 'th';
  return (
    <p className={receiptStyles.date}>
      <span className={receiptStyles.dateLonghand}>
        {weekday}, the {day}{suffix} of {month} {year}
      </span>
      <span className={receiptStyles.dateCompact}>{label}</span>
    </p>
  );
}

/**
 * The portrait's "filed" stamp — a circular brass mark that rotates
 * slightly so it doesn't look stamped from a screen. The text is the
 * desk's own mode ("FILED ON PAPER" or "FILED · LIVE SETTLED"). The
 * stamp is decorative copy, not a status banner; the slip's own
 * mode stamp is the source of truth.
 */
function ReceiptStamp({ mode, desk }: { mode: 'paper' | 'live'; desk: HouseDesk }) {
  const text = mode === 'live' ? 'FILED · LIVE SETTLED' : 'FILED ON PAPER';
  return (
    <div className={receiptStyles.stamp} data-mode={mode} aria-hidden="true">
      <span className={receiptStyles.stampText}>{text}</span>
    </div>
  );
}

/**
 * The transaction-hash chip — for live Base fills, a small monospace
 * link to Basescan. For paper filings, null. The chip is part of the
 * portrait so the receipt *looks* bound to a real onchain event when
 * it actually is.
 */
function TxHashChip({ txHash, network }: { txHash: string | null | undefined; network: 'base' | 'solana' }) {
  if (!txHash) return null;
  const url = network === 'base' ? getBaseExplorerTxUrl(txHash) : `https://solscan.io/tx/${txHash}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={receiptStyles.txHash}
    >
      <span className={receiptStyles.txHashLabel}>TX</span>
      <span className={receiptStyles.txHashValue}>
        {txHash.slice(0, 6)}…{txHash.slice(-4)}
      </span>
      <span className={receiptStyles.txHashGo} aria-hidden="true">↗</span>
    </a>
  );
}

/** A brass corner mark — the portrait's outer geometry, no more. */
function BrassCorner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  return <span className={receiptStyles.corner} data-position={position} aria-hidden="true" />;
}

/** The portrait — paper object, slip inside, honest footer. */
export function ReceiptPortrait({
  desk,
  filedAt,
  txHash,
  actions,
  children,
  dateLabel,
  trailing,
}: ReceiptPortraitProps) {
  const mode: 'paper' | 'live' = txHash ? 'live' : 'paper';
  const txNetwork: 'base' | 'solana' = desk.id === 'jesse' ? 'solana' : 'base';
  return (
    <article
      className={receiptStyles.portrait}
      data-desk={desk.id}
      data-mode={mode}
      role="region"
      aria-label="Filed receipt"
    >
      <BrassCorner position="tl" />
      <BrassCorner position="tr" />
      <BrassCorner position="bl" />
      <BrassCorner position="br" />

      <header className={receiptStyles.header}>
        <ReceiptKicker desk={desk} />
        <ReceiptDate filedAt={filedAt} dateLabel={dateLabel} />
        <ReceiptStamp mode={mode} desk={desk} />
      </header>

      <div className={receiptStyles.slipSlot}>
        {children}
      </div>

      <footer className={receiptStyles.footer}>
        <div className={receiptStyles.footerRow}>
          {txHash && <TxHashChip txHash={txHash} network={txNetwork} />}
          {!txHash && (
            <span className={receiptStyles.modeFootnote}>
              Paper filing · no funds moved · kept in this browser
              {desk.id === 'hetty' && ' · backed up to your account when signed in'}
            </span>
          )}
        </div>
        {trailing && <div className={receiptStyles.trailing}>{trailing}</div>}
        {actions && <div className={receiptStyles.actions}>{actions}</div>}
      </footer>
    </article>
  );
}

// Re-export the desk's local styles for callers that want to compose
// the receipt inside a ticket surface.
export const receiptStylesExport = receiptStyles;