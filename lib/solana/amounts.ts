/**
 * Scaled UI Amount math (plan §4.3) — pure bigint/rational, no dependencies,
 * no floats anywhere on the path.
 *
 * Let r be an integer atomic token amount, d the mint decimals, and m > 0
 * the effective Scaled UI multiplier:
 *
 *   raw decimal token quantity   = r / 10^d
 *   displayed xStock quantity    = (r / 10^d) × m
 *   sell request of displayed q  → r = floor((q / m) × 10^d)
 *
 * The multiplier arrives as a decimal string ("1.1") parsed to a rational —
 * its denominator is a pure power of ten, so every conversion renders as an
 * exact decimal. Rounding only ever truncates the raw sell amount; a spend
 * is never rounded upward.
 */

const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;
const MAX_INPUT_LENGTH = 40;
const MAX_DECIMALS = 18;
/** Solana token amounts are u64 — anything beyond 2^64 − 1 cannot exist onchain. */
const U64_MAX = 2n ** 64n - 1n;

/** multiplier = numerator / 10^exponent — "1.1" parses to 11 / 10^1. */
type DecimalRational = { numerator: bigint; exponent: number };

function parsePositiveDecimal(text: string, what: string): DecimalRational {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_INPUT_LENGTH || !DECIMAL_PATTERN.test(text)) {
    throw new Error(`${what} must be a positive decimal string.`);
  }
  const [whole, fraction = ''] = text.split('.');
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new Error(`${what} must be greater than zero.`);
  return { numerator, exponent: fraction.length };
}

/** Parse the effective Scaled UI multiplier ("1.1" → 11/10). Zero, negative,
 *  and non-decimal multipliers are rejected — a missing multiplier is never
 *  defaulted to one. */
export function parseMultiplier(multiplier: string): DecimalRational {
  return parsePositiveDecimal(multiplier, 'The scaling multiplier');
}

function checkDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new Error('Unsupported mint decimals.');
  }
}

/** Render an exact decimal for value / 10^places, trailing zeros trimmed. */
function renderScaled(value: bigint, places: number): string {
  const scale = 10n ** BigInt(places);
  const fraction = (value % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return `${value / scale}${fraction ? `.${fraction}` : ''}`;
}

/** Displayed xStock quantity for a raw atomic amount: (r / 10^d) × m. */
export function rawToDisplayed(rawAtoms: bigint, decimals: number, multiplier: string): string {
  checkDecimals(decimals);
  if (typeof rawAtoms !== 'bigint' || rawAtoms < 0n) throw new Error('Raw atoms must be a non-negative integer.');
  if (rawAtoms > U64_MAX) throw new Error('Raw atoms overflow a Solana u64.');
  const m = parseMultiplier(multiplier);
  if (rawAtoms === 0n) return '0';
  return renderScaled(rawAtoms * m.numerator, decimals + m.exponent);
}

/** Raw atoms for a sell of displayed quantity q: r = floor((q / m) × 10^d).
 *  Rejects zero (before or after flooring), negative or non-decimal input,
 *  and any result beyond the Solana u64 range. */
export function displayedToRaw(quantity: string, decimals: number, multiplier: string): bigint {
  checkDecimals(decimals);
  const q = parsePositiveDecimal(quantity, 'The displayed quantity');
  const m = parseMultiplier(multiplier);
  const numerator = q.numerator * 10n ** BigInt(decimals + m.exponent);
  const denominator = 10n ** BigInt(q.exponent) * m.numerator;
  const raw = numerator / denominator;
  if (raw === 0n) throw new Error('The displayed quantity rounds to zero atoms — too small to sell.');
  if (raw > U64_MAX) throw new Error('The displayed quantity overflows a Solana u64 token amount.');
  return raw;
}

/** The displayed quantity after sell rounding — what the wallet will actually
 *  move, shown next to the requested quantity when they differ. */
export function effectiveDisplayed(rawAtoms: bigint, decimals: number, multiplier: string): string {
  return rawToDisplayed(rawAtoms, decimals, multiplier);
}

/** Exact decimal comparison (-1 | 0 | 1) without floats — for limit checks
 *  on displayed quantities, where atom-floor rounding must not smuggle a
 *  fraction past a cap. */
export function compareDecimals(a: string, b: string): -1 | 0 | 1 {
  const parse = (text: string) => {
    if (!DECIMAL_PATTERN.test(text)) throw new Error('Expected a positive decimal string.');
    const [whole, fraction = ''] = text.split('.');
    return { whole, fraction };
  };
  const x = parse(a);
  const y = parse(b);
  if (x.whole.length !== y.whole.length) return x.whole.length < y.whole.length ? -1 : 1;
  if (x.whole !== y.whole) return x.whole < y.whole ? -1 : 1;
  const places = Math.max(x.fraction.length, y.fraction.length);
  const fx = x.fraction.padEnd(places, '0');
  const fy = y.fraction.padEnd(places, '0');
  if (fx === fy) return 0;
  return fx < fy ? -1 : 1;
}
