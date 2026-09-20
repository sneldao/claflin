'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  venueDuplexReasonSentence,
  type VenueDuplex,
} from '@/lib/solana/market/venue-duplex';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import styles from '../desk/WorkingDesk.module.css';

/**
 * Free xStock duplex — Backed/Jupiter stock reference vs Jupiter venue USD.
 * Evidence only; never files paper; never labelled as Pyth Pro.
 */
export function VenueDuplexEvidence({ instrumentId }: { instrumentId: string | null }) {
  const [duplex, setDuplex] = useState<VenueDuplex | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = instrumentId
    ?? SOLANA_INSTRUMENTS.find(i => i.quoteSupported)?.id
    ?? null;

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/desk/jesse/venue-duplex?instrumentId=${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      const body = await res.json() as VenueDuplex;
      setDuplex(body);
    } catch {
      setDuplex(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) void load(selected);
  }, [selected, load]);

  return (
    <section className={styles.marketEvidence} data-source="venue-duplex" aria-labelledby="venue-duplex-title">
      <p className={styles.eyebrow}>XSTOCK · REFERENCE VERSUS VENUE</p>
      <h2 id="venue-duplex-title">Issuer reference versus Solana venue.</h2>
      <p className={styles.evidenceBody}>
        Free duplex without Pyth Pro: Backed public price-data when available, otherwise Jupiter’s xStocks stock reference,
        versus Jupiter venue USD for the same mint. Not an exchange print, not arbitrage, and not a Pyth reading.
      </p>
      {loading && !duplex && <p className={styles.evidenceMeta}>Reading Backed and Jupiter…</p>}
      {duplex && duplex.status === 'unavailable' && (
        <>
          <h3 className={styles.evidenceSub}>Comparison unavailable.</h3>
          <ul className={styles.evidenceReasons}>
            {duplex.reasonCodes.map(code => (
              <li key={code}>{venueDuplexReasonSentence(code)}</li>
            ))}
          </ul>
        </>
      )}
      {duplex && duplex.status === 'comparable' && (
        <>
          <p className={styles.evidenceBody} role="status">
            <strong>Reference:</strong> {duplex.referencePrice} USD
            {' · '}
            {duplex.referenceSource === 'backed' ? 'Backed issuer indicative' : 'Jupiter xStocks stockData'}
          </p>
          <p className={styles.evidenceBody} role="status">
            <strong>Venue:</strong> {duplex.venuePrice} USD · Jupiter Price v3
          </p>
          {duplex.referenceDifferenceBps !== null && (
            <p className={styles.evidenceBps}>
              Reference difference: <strong>{duplex.referenceDifferenceBps} bps</strong> — a reference reading, not profit.
            </p>
          )}
          <p className={styles.evidenceMeta}>
            {duplex.symbol} · observed {new Date(duplex.observedAt).toLocaleString()}
          </p>
          <p className={styles.evidenceMeta}>{duplex.disclaimer}</p>
        </>
      )}
    </section>
  );
}
