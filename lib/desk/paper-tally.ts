/**
 * The paper tally — what a desk's filed paper records add up to, per
 * instrument. Pure and rail-agnostic: each desk maps its own record shape
 * into PaperFill, and the tally never guesses a price it was not given.
 *
 * It is a sum of simulations at the prices that were quoted when each
 * record was filed. It is not a holding, not a balance and not a P&L: no
 * current price is read, and nothing here marks anything to market.
 */
import { formatAmount } from '../trading/domain';
import type { PaperRecord } from '../trading/paper-records';
import type { JessePaperRecord } from '../solana/paper';

const USDC_DECIMALS = 6;

export interface PaperFill {
  instrumentId: string;
  symbol: string;
  name: string;
  side: 'buy' | 'sell';
  /** Token quantity in the token's own raw units. */
  tokenRaw: bigint;
  tokenDecimals: number;
  /** USDC spent (buy) or received (sell), 6-decimal raw units. */
  usdcRaw: bigint;
  createdAt: number;
}

export interface TallyRow {
  instrumentId: string;
  symbol: string;
  name: string;
  records: number;
  bought: string;
  sold: string;
  /** Bought minus sold, in tokens; negative when more was sold on paper than bought. */
  net: string;
  netDirection: 'long' | 'flat' | 'short';
  usdcSpent: string;
  usdcReceived: string;
  /** USDC per token across paper buys; null with no buys. */
  averageBuy: string | null;
  /** USDC per token across paper sells; null with no sells. */
  averageSell: string | null;
  lastFiledAt: number;
}

export function baseFill(record: PaperRecord): PaperFill {
  const q = record.quote;
  const buy = q.intent.side === 'buy';
  return {
    instrumentId: q.intent.instrumentId,
    symbol: buy ? q.outputSymbol : q.inputSymbol,
    name: q.instrumentName,
    side: buy ? 'buy' : 'sell',
    tokenRaw: BigInt(buy ? q.amountOutRaw : q.amountInRaw),
    tokenDecimals: q.tokenDecimals,
    usdcRaw: BigInt(buy ? q.amountInRaw : q.amountOutRaw),
    createdAt: record.createdAt,
  };
}

export function jesseFill(record: JessePaperRecord): PaperFill {
  const q = record.quote;
  const buy = q.intent.side === 'buy';
  return {
    instrumentId: q.intent.instrumentId,
    symbol: record.instrumentSnapshot.symbol,
    name: record.instrumentSnapshot.name,
    side: buy ? 'buy' : 'sell',
    tokenRaw: BigInt(buy ? q.amountOutRaw : q.amountInRaw),
    tokenDecimals: record.instrumentSnapshot.decimals,
    usdcRaw: BigInt(buy ? q.amountInRaw : q.amountOutRaw),
    createdAt: record.createdAt,
  };
}

/** A record that cannot be read into a fill is left out, never guessed. */
export function safeFills<T>(records: readonly T[], toFill: (record: T) => PaperFill): PaperFill[] {
  const fills: PaperFill[] = [];
  for (const record of records) {
    try {
      const fill = toFill(record);
      if (fill.tokenRaw > 0n && fill.usdcRaw >= 0n && Number.isInteger(fill.tokenDecimals)) fills.push(fill);
    } catch { /* malformed legacy row: omit rather than miscount */ }
  }
  return fills;
}

const PRICE_DECIMALS = 4;

/** USDC per token, rounded half-up to PRICE_DECIMALS, from exact integers. */
function unitPrice(usdcRaw: bigint, tokenRaw: bigint, tokenDecimals: number): string | null {
  if (tokenRaw === 0n) return null;
  // price = (usdcRaw / 10^6) / (tokenRaw / 10^d), scaled by 10^PRICE_DECIMALS
  const numerator = usdcRaw * 10n ** BigInt(tokenDecimals + PRICE_DECIMALS);
  const denominator = tokenRaw * 10n ** BigInt(USDC_DECIMALS);
  const scaled = (numerator * 2n + denominator) / (denominator * 2n);
  return fixed(formatAmount(scaled, PRICE_DECIMALS), PRICE_DECIMALS);
}

function fixed(value: string, places: number): string {
  const [whole, fraction = ''] = value.split('.');
  return places === 0 ? whole! : `${whole}.${fraction.padEnd(places, '0')}`;
}

/** USDC to the cent, rounded half-up from 6-decimal raw units. */
function cents(raw: bigint): string {
  const scale = 10n ** BigInt(USDC_DECIMALS - 2);
  return fixed(formatAmount((raw + scale / 2n) / scale, 2), 2);
}

function signed(raw: bigint, decimals: number): string {
  return raw < 0n ? `-${formatAmount(-raw, decimals)}` : formatAmount(raw, decimals);
}

export function tallyPaper(fills: readonly PaperFill[]): TallyRow[] {
  const groups = new Map<string, PaperFill[]>();
  for (const fill of fills) {
    const list = groups.get(fill.instrumentId) ?? [];
    list.push(fill);
    groups.set(fill.instrumentId, list);
  }
  const rows: TallyRow[] = [];
  for (const [instrumentId, list] of groups) {
    /* Instrument decimals are fixed per token; take the newest record's
       naming so a renamed display symbol shows its current form. */
    const newest = list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    const decimals = newest.tokenDecimals;
    let bought = 0n, sold = 0n, spent = 0n, received = 0n;
    for (const fill of list) {
      if (fill.tokenDecimals !== decimals) continue; // never add mismatched units
      if (fill.side === 'buy') { bought += fill.tokenRaw; spent += fill.usdcRaw; }
      else { sold += fill.tokenRaw; received += fill.usdcRaw; }
    }
    const net = bought - sold;
    rows.push({
      instrumentId,
      symbol: newest.symbol,
      name: newest.name,
      records: list.filter(fill => fill.tokenDecimals === decimals).length,
      bought: formatAmount(bought, decimals),
      sold: formatAmount(sold, decimals),
      net: signed(net, decimals),
      netDirection: net > 0n ? 'long' : net < 0n ? 'short' : 'flat',
      usdcSpent: cents(spent),
      usdcReceived: cents(received),
      averageBuy: unitPrice(spent, bought, decimals),
      averageSell: unitPrice(received, sold, decimals),
      lastFiledAt: newest.createdAt,
    });
  }
  return rows.sort((a, b) => b.lastFiledAt - a.lastFiledAt);
}
