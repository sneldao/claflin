import { markPrice, type DeskMark } from '@/lib/trading/marks-shared';
import foyerStyles from '../desk/HouseFoyer.module.css';

/** One wire mark as the quotation column sees it — the rail tag and the
   source result's `asOf` carried alongside the mark itself. */
export interface WireMark {
  key: string;
  rail: 'BASE' | 'SOL' | 'RH';
  mark: DeskMark;
  asOf?: number;
}

/* A newspaper column doesn't scroll forever — a handful of lines and it
   rests. Deterministic: the first N valid rows, in wire order. */
const MAX_ROWS = 7;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function validTime(t: number | undefined): t is number {
  return typeof t === 'number' && Number.isSafeInteger(t) && t > 0 && t <= 8.64e15;
}

function toMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

function stampOf(row: WireMark): string {
  const fmt = (t: number) => {
    const s = new Date(toMs(t)).toISOString();
    return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)} · ${s.slice(11, 16)} UTC`;
  };
  if (validTime(row.mark.reference.updatedAt)) return `Observed ${fmt(row.mark.reference.updatedAt)}`;
  if (validTime(row.asOf)) return `Snapshot ${fmt(row.asOf)}`;
  return 'Time unavailable';
}

/**
 * The quotation column — a slim ruled table of the same reference marks
 * the wire already carries, set in the answers room's open field. It is
 * decorative duplication: the live wire is the accessible source, so the
 * column is aria-hidden and takes no pointer. If no real priced marks
 * exist the column prints nothing — it never pads.
 */
export function QuoteColumn({ marks }: { marks: WireMark[] }) {
  const rows = marks
    .filter(wire => wire.mark.reference.status !== 'unavailable' && markPrice(wire.mark) !== null)
    .slice(0, MAX_ROWS);
  if (rows.length === 0) return null;
  return (
    <aside className={foyerStyles.quoteColumn} aria-hidden="true">
      <p className={foyerStyles.quoteColumnTitle}>Reference marks</p>
      <ul className={foyerStyles.quoteList}>
        {rows.map(row => (
          <li key={row.key} className={foyerStyles.quoteRow}>
            <span className={foyerStyles.quoteSymbol}>
              {row.mark.symbol}
              {row.mark.reference.status === 'stale' && (
                <span className={foyerStyles.quoteStale}>STALE</span>
              )}
            </span>
            <span className={foyerStyles.quoteNums}>
              <span className={foyerStyles.quotePrice}>${markPrice(row.mark)}</span>
              <span className={foyerStyles.quoteRail}>{row.rail}</span>
            </span>
            <span className={foyerStyles.quoteTime}>{stampOf(row)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
