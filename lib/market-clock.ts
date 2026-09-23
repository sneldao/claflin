/**
 * The market clock — whether the listing exchange's regular session is
 * running right now, stated in plain words next to the fact that the
 * onchain book trades regardless. Pure: no React, no fetch.
 *
 * NYSE regular session is 09:30–16:00 ET, Monday–Friday, less full
 * holidays and the published early closes. The holiday calendar is known
 * for 2026–2027; outside that range the weekday/hours rule applies alone.
 */

export type ExchangeState = 'open' | 'closed';

export interface MarketClock {
  exchange: ExchangeState;
  /** e.g. "Wed 11:42 AM ET" */
  etLabel: string;
  line: string;
  calendarKnown: boolean;
}

const ET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const WEEKDAYS: Readonly<Record<string, number>> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Full NYSE holidays (ET dates), 2026–2027. */
const FULL_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

/** Dates where the session ends at 13:00 ET instead of 16:00. */
const EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);

const SESSION_OPEN_MINUTES = 9 * 60 + 30;
const SESSION_CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

export function marketClock(now: Date): MarketClock {
  const parts = ET_FORMAT.formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';

  const weekday = WEEKDAYS[get('weekday')] ?? 0;
  const year = Number(get('year'));
  const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
  const hour24 = (() => {
    const hour = Number(get('hour')) % 12;
    return get('dayPeriod').toUpperCase() === 'PM' ? hour + 12 : hour;
  })();
  const minutes = hour24 * 60 + Number(get('minute'));

  const calendarKnown = year === 2026 || year === 2027;
  const holiday = calendarKnown && FULL_HOLIDAYS.has(dateKey);
  const closeAt = calendarKnown && EARLY_CLOSES.has(dateKey) ? EARLY_CLOSE_MINUTES : SESSION_CLOSE_MINUTES;

  const exchange: ExchangeState =
    !holiday && weekday >= 1 && weekday <= 5 && minutes >= SESSION_OPEN_MINUTES && minutes < closeAt
      ? 'open'
      : 'closed';

  const etLabel = `${get('weekday')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()} ET`;
  const line = exchange === 'open'
    ? `NYSE open · ${etLabel} — the onchain book trades alongside.`
    : `NYSE closed · ${etLabel} — the onchain book is open.`;

  return { exchange, etLabel, line, calendarKnown };
}
