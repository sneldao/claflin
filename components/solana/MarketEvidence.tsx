'use client';

import type { MarketComparison } from '@/lib/solana/contracts';
import { reasonCodeSentence } from '@/lib/solana/market/reasons';
import styles from '../desk/WorkingDesk.module.css';

/**
 * Jesse's market-evidence panel. Comparable, last-observation, and
 * unavailable are finished states — never a spinner waiting on a number
 * that may never arrive, and never a fabricated basis-point figure.
 */
export function MarketEvidence({
  comparison,
  loading = false,
}: {
  comparison: MarketComparison | null;
  loading?: boolean;
}) {
  if (loading && !comparison) {
    return (
      <section className={styles.marketEvidence} aria-labelledby="evidence-title" aria-busy="true">
        <p className={styles.eyebrow}>MARKET EVIDENCE</p>
        <h2 id="evidence-title">Checking the tape.</h2>
        <p className={styles.evidenceBody}>Reading Pyth observations when they are available. Filing does not wait on this panel.</p>
      </section>
    );
  }

  if (!comparison) {
    return (
      <section className={styles.marketEvidence} aria-labelledby="evidence-title">
        <p className={styles.eyebrow}>MARKET EVIDENCE</p>
        <h2 id="evidence-title">No evidence on the desk.</h2>
        <p className={styles.evidenceBody}>
          Ask Jesse to compare an xStock, or request a quote first. A missing comparison never blocks a paper filing.
        </p>
      </section>
    );
  }

  const observed = new Date(comparison.observedAt).toLocaleString();

  if (comparison.status === 'unavailable') {
    return (
      <section className={styles.marketEvidence} data-status="unavailable" aria-labelledby="evidence-title">
        <p className={styles.eyebrow}>MARKET EVIDENCE</p>
        <h2 id="evidence-title">Comparison unavailable.</h2>
        <ul className={styles.evidenceReasons}>
          {comparison.reasonCodes.map(code => (
            <li key={code}>{reasonCodeSentence(code)}</li>
          ))}
        </ul>
        <p className={styles.evidenceMeta}>Observed {observed}. No numerical difference is shown.</p>
      </section>
    );
  }

  if (comparison.status === 'last-observation') {
    return (
      <section className={styles.marketEvidence} data-status="last-observation" aria-labelledby="evidence-title">
        <p className={styles.eyebrow}>MARKET EVIDENCE</p>
        <h2 id="evidence-title">Last observation.</h2>
        <p className={styles.evidenceBody} role="status">
          The equity market is not in regular session, so this is a labelled last observation — not a live comparison.
        </p>
        <ObservationRow label="Token" observation={comparison.token} />
        <ObservationRow label="Equity" observation={comparison.equity} />
        {comparison.referenceDifferenceBps !== null && (
          <p className={styles.evidenceBps}>
            Reference difference: {comparison.referenceDifferenceBps} bps — a reference reading, not profit, and not an executable arbitrage.
          </p>
        )}
        <p className={styles.evidenceMeta}>Observed {observed}.</p>
      </section>
    );
  }

  return (
    <section className={styles.marketEvidence} data-status="comparable" aria-labelledby="evidence-title">
      <p className={styles.eyebrow}>MARKET EVIDENCE</p>
      <h2 id="evidence-title">Comparable reading.</h2>
      <ObservationRow label="Token" observation={comparison.token} />
      <ObservationRow label="Equity" observation={comparison.equity} />
      {comparison.referenceDifferenceBps !== null ? (
        <p className={styles.evidenceBps}>
          Reference difference: <strong>{comparison.referenceDifferenceBps} bps</strong> — a reference reading, not profit, and not an executable arbitrage.
        </p>
      ) : (
        <p className={styles.evidenceBody}>The feeds are comparable, but no basis-point difference is available.</p>
      )}
      <p className={styles.evidenceMeta}>Observed {observed}.</p>
    </section>
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
    <p className={styles.evidenceObs}>
      <strong>{label}</strong>
      {' · '}
      {observation.price ? `$${observation.price}` : 'price unavailable'}
      {' · '}
      {observation.session}
      {' · '}
      {observation.status}
      {observation.generatedAt != null && (
        <> · gen {new Date(observation.generatedAt).toLocaleString()}</>
      )}
    </p>
  );
}
