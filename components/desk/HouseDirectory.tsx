import { HOUSE_DESKS } from '@/lib/house';
import styles from './WorkingDesk.module.css';

export function HouseDirectory() {
  return <details className={styles.houseDirectory}>
    <summary>The house</summary>
    <div className={styles.directoryPaper}>
      <p className={styles.directoryTitle}>Claflin &amp; Co.</p>
      <p className={styles.directoryNote}>One house. Specialist desks.</p>
      <ul>
        {HOUSE_DESKS.map(desk => <li key={desk.id}>
          <div><strong>{desk.name}</strong><span>{desk.market}</span></div>
          <small>{desk.status === 'paper' ? 'Current · paper' : 'Planned'}</small>
        </li>)}
      </ul>
      <p className={styles.directoryFoot}>Launching with Hetty on Base. Other desks are not yet available.</p>
    </div>
  </details>;
}
