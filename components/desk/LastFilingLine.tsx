'use client';

import { filingWhen, type HouseFiling } from '@/lib/trading/house-filing';

/** The sentence the house already kept, and the one control that opens it. */
export function LastFilingLine({
  filing,
  onOpen,
  className,
}: {
  filing: HouseFiling;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <p className={className}>
      <span>{filingWhen(filing.createdAt)} — {filing.sentence}.</span>{' '}
      <button type="button" onClick={onOpen}>Open that record</button>
    </p>
  );
}
