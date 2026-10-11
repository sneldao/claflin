'use client';

import { useEffect, useState } from 'react';
import { getHouseDesk, type HouseDeskId } from '@/lib/house';
import { deskNoteOfTheDay, houseSheetDesk, houseSheetDesks } from '@/lib/desk-notes';
import foyerStyles from '../desk/HouseFoyer.module.css';

function sheetDateLabel(date: Date): string {
  const printed = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  return `${printed} · UTC`;
}

/**
 * The house sheet — the day's desk note set as a small printed excerpt in
 * the example room's open field. Masthead and rules are furniture; the
 * note is real content from `deskNoteOfTheDay`, attributed only when it
 * carries a speaker's words, and dated with the real day. No clock reads
 * on the server: without an explicit `date` the sheet first paints as
 * masthead alone and fills in on mount, so SSR and hydration agree.
 */
export function HouseSheet({ date, desks, className }: { date?: Date; desks?: readonly HouseDeskId[]; className?: string }) {
  const [day, setDay] = useState<Date | null>(date ?? null);
  useEffect(() => {
    if (date) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = new Date();
      setDay(now);
      const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      timer = setTimeout(tick, Math.max(0, midnight - now.getTime()));
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [date]);

  const ids = desks ?? houseSheetDesks();
  const deskId = day ? houseSheetDesk(ids, day) : null;
  const note = day && deskId ? deskNoteOfTheDay(deskId, day) : null;
  const desk = deskId ? getHouseDesk(deskId) : undefined;

  return (
    <aside className={`${foyerStyles.houseSheet}${className ? ` ${className}` : ''}`} aria-label="The house sheet">
      <p className={foyerStyles.houseSheetMasthead}>The House Sheet</p>
      {day && <p className={foyerStyles.houseSheetDate}>{sheetDateLabel(day)}</p>}
      {note?.term ? (
        <div className={foyerStyles.houseSheetWordBox}>
          <p className={foyerStyles.houseSheetWordKicker}>A word of the trade</p>
          <p className={foyerStyles.houseSheetWordTerm}>{note.term}</p>
          <p className={foyerStyles.houseSheetWordText}>{note.text}</p>
        </div>
      ) : note ? (
        <p className={foyerStyles.houseSheetNote}>{note.text}</p>
      ) : null}
      {note && (
        <p className={foyerStyles.houseSheetByline}>
          {note.attribution ?? (note.term
            ? `From ${desk?.shortName ?? 'the'}’s desk`
            : `From ${desk?.shortName ?? 'the'}’s desk — a desk note, not a quotation`)}
        </p>
      )}
      {note && (
        <p className={foyerStyles.houseSheetFoot}>
          The house takes its name from the firm whose Weekly printed what the Street would not.
        </p>
      )}
    </aside>
  );
}
