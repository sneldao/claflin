'use client';

import { memo } from 'react';
import type { TallyRow } from '@/lib/desk/paper-tally';
import styles from './WorkingDesk.module.css';

/**
 * "What have I done on paper?" — the desk's filed records summed per
 * instrument at the prices quoted when each was filed. Collapsed by default
 * so it never competes with the ticket, and labelled at the head as what it
 * is: a tally of simulations, not a holding, a balance or a P&L.
 */
export const PaperTally = memo(function PaperTally({ rows, place }: { rows: readonly TallyRow[]; place: string }) {
  if (rows.length === 0) return null;
  return (
    <details className={styles.ledgerArchive} data-paper-tally="true">
      <summary>Paper tally · {rows.length} {rows.length === 1 ? 'instrument' : 'instruments'}</summary>
      <p className={styles.ledgerTrust}>
        Your filed paper records added up, at the prices quoted when each was filed. Simulations kept {place} — not wallet holdings, not a balance, and no profit or loss is implied. Nothing was bought or sold.
      </p>
      <div className={styles.paperTallyScroll}>
        <table className={styles.paperTally}>
          <caption className={styles.srOnly}>Paper tally by instrument</caption>
          <thead>
            <tr>
              <th scope="col">Instrument</th>
              <th scope="col">Net on paper</th>
              <th scope="col">Bought · avg</th>
              <th scope="col">Sold · avg</th>
              <th scope="col">Records</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.instrumentId} data-net={row.netDirection}>
                <th scope="row"><abbr title={row.name}>{row.symbol}</abbr></th>
                <td>
                  {row.netDirection === 'flat' ? 'Flat' : `${row.net} ${row.symbol}`}
                  {row.netDirection === 'short' && <small> sold beyond paper buys</small>}
                </td>
                <td>
                  {row.averageBuy
                    ? <>{row.bought} for {row.usdcSpent} USDC<small> · {row.averageBuy} each</small></>
                    : '—'}
                </td>
                <td>
                  {row.averageSell
                    ? <>{row.sold} for {row.usdcReceived} USDC<small> · {row.averageSell} each</small></>
                    : '—'}
                </td>
                <td>{row.records}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});
