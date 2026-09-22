'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  venueDuplexReasonSentence,
  type VenueDuplex,
} from '@/lib/solana/market/venue-duplex';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { VENUE_DUPLEX_ABOUT } from '@/lib/desk/ui-copy';
import { EvidencePanel, EvidenceRow, EvidenceDelta } from '../desk/EvidencePanel';
import styles from '../desk/WorkingDesk.module.css';

/**
 * Free xStock duplex — Backed/Jupiter stock reference vs Jupiter venue USD.
 * Evidence only; never files paper; never labelled as Pyth Pro.
 */
export function VenueDuplexEvidence({ instrumentId }: { instrumentId: string | null }) {
  const [duplex, setDuplex] = useState<VenueDuplex | null>(null);
  const [loading, setLoading] = useState(true);

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

  const status = duplex === null
    ? loading ? 'loading' : 'empty'
    : duplex.status === 'comparable' ? 'ready' : 'unavailable';

  return (
    <EvidencePanel
      titleId="venue-duplex-title"
      eyebrow="XSTOCK · REFERENCE VS VENUE"
      title="Issuer vs venue"
      status={status}
      about={
        <>
          <p>{VENUE_DUPLEX_ABOUT}</p>
          {duplex?.disclaimer && <p>{duplex.disclaimer}</p>}
        </>
      }
      body={
        duplex?.status === 'comparable' ? (
          <>
            <EvidenceRow
              label="Reference"
              value={duplex.referencePrice ? `${duplex.referencePrice} USD` : 'price unavailable'}
              source={duplex.referenceSource === 'backed' ? 'Backed issuer indicative' : 'Jupiter xStocks stockData'}
            />
            <EvidenceRow
              label="Venue"
              value={duplex.venuePrice ? `${duplex.venuePrice} USD` : 'price unavailable'}
              source="Jupiter Price v3"
            />
            <EvidenceDelta bps={duplex.referenceDifferenceBps} />
          </>
        ) : duplex?.status === 'unavailable' ? (
          <ul className={styles.evidenceReasons}>
            {duplex.reasonCodes.map(code => (
              <li key={code}>{venueDuplexReasonSentence(code)}</li>
            ))}
          </ul>
        ) : undefined
      }
      meta={duplex?.status === 'comparable' ? (
        <p className={styles.evidenceMeta}>
          {duplex.symbol} · observed {new Date(duplex.observedAt).toLocaleString()}
        </p>
      ) : undefined}
    />
  );
}
