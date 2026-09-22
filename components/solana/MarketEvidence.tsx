'use client';

import type { MarketComparison } from '@/lib/solana/contracts';
import { reasonCodeSentence } from '@/lib/solana/market/reasons';
import { MARKET_EMPTY_HINT, PYTH_PRO_ABOUT } from '@/lib/desk/ui-copy';
import { EvidencePanel, EvidenceRow, EvidenceDelta } from '../desk/EvidencePanel';
import styles from '../desk/WorkingDesk.module.css';

/**
 * Jesse's Pyth Pro market-evidence panel. Always mounted as a collapsible
 * card so the desk shows every source at a glance; comparable,
 * last-observation, and unavailable are finished states — never a spinner
 * waiting on a number that may never arrive, and never a fabricated
 * basis-point figure. The empty state carries an action when the ticket
 * offers one, so it reports and invites rather than dead-ending.
 */
export function MarketEvidence({
  comparison,
  loading = false,
  onCompare,
  compareDisabled = false,
}: {
  comparison: MarketComparison | null;
  loading?: boolean;
  /** Supplied by the ticket so the empty state can act, not just report. */
  onCompare?: () => void;
  compareDisabled?: boolean;
}) {
  const about = (
    <>
      <p>{PYTH_PRO_ABOUT}</p>
      <p>Ask Jesse to compare an xStock, or request a quote first. A missing comparison never blocks a paper filing.</p>
    </>
  );

  if (!comparison) {
    return (
      <EvidencePanel
        titleId="evidence-title"
        eyebrow="PYTH PRO · MARKET EVIDENCE"
        title="Market evidence"
        status={loading ? 'loading' : 'empty'}
        about={about}
        body={
          !loading && onCompare ? (
            <>
              <p className={styles.evidenceMeta}>{MARKET_EMPTY_HINT}</p>
              <button
                type="button"
                className={styles.secondary}
                onClick={onCompare}
                disabled={compareDisabled}
              >
                Compare market
              </button>
            </>
          ) : undefined
        }
      />
    );
  }

  const observed = new Date(comparison.observedAt).toLocaleString();

  if (comparison.status === 'unavailable') {
    return (
      <EvidencePanel
        titleId="evidence-title"
        eyebrow="PYTH PRO · MARKET EVIDENCE"
        title="Comparison unavailable"
        status="unavailable"
        about={about}
        body={
          <ul className={styles.evidenceReasons}>
            {comparison.reasonCodes.map(code => (
              <li key={code}>{reasonCodeSentence(code)}</li>
            ))}
          </ul>
        }
        meta={<p className={styles.evidenceMeta}>Observed {observed}. No numerical difference is shown.</p>}
      />
    );
  }

  const lastObservation = comparison.status === 'last-observation';
  return (
    <EvidencePanel
      titleId="evidence-title"
      eyebrow="PYTH PRO · MARKET EVIDENCE"
      title={lastObservation ? 'Last observation' : 'Comparable reading'}
      status="ready"
      about={about}
      body={
        <>
          {lastObservation && (
            <p className={styles.evidenceMeta} role="status">
              Equity market out of regular session — labelled last observation, not live.
            </p>
          )}
          <ObservationRow label="Token" observation={comparison.token} />
          <ObservationRow label="Equity" observation={comparison.equity} />
          <EvidenceDelta bps={comparison.referenceDifferenceBps} />
        </>
      }
      meta={<p className={styles.evidenceMeta}>Observed {observed}.</p>}
    />
  );
}

function ObservationRow({
  label,
  observation,
}: {
  label: string;
  observation: MarketComparison['token'];
}) {
  return (
    <EvidenceRow
      label={label}
      value={observation.price ? `$${observation.price}` : 'price unavailable'}
      source={`${observation.session} · ${observation.status}`}
    />
  );
}
