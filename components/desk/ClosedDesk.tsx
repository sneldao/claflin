import type { HouseDesk } from '@/lib/house';
import { getBrokerMethod } from '@/lib/education';
import { HouseMark } from './HouseMark';
import styles from './WorkingDesk.module.css';

export function ClosedDesk({ desk, onReturn }: { desk: HouseDesk; onReturn: () => void }) {
  const method = getBrokerMethod(desk.id);
  return <section
    id="instruction"
    className={styles.ticket}
    aria-labelledby="instruction-title"
    data-ticket-view="closed"
    data-desk-open="false"
  >
    <div className={styles.paperTop}>
      <HouseMark small />
      <span>CLAFLIN &amp; CO.<small>PLANNED DESK · NOT OPEN</small></span>
      <span className={styles.paperNumber}>—</span>
    </div>
    <h1 id="instruction-title">This desk is not open.</h1>
    <p className={styles.notice} role="status">{desk.name} / {desk.market} is a planned desk. An instruction from the Base desk cannot come with you.</p>
    <div className={styles.ticketSurface}>
      <p className={styles.closedBoundary}>No quote, no paper file, no live order.</p>
      <p className={styles.product}>{desk.approach}</p>
      <details className={styles.aboutHetty}>
        <summary>How {method.name} examines a question</summary>
        <div className={styles.popoverPanel}>
          <p><strong>{method.lens}</strong> — educational perspective only.</p>
          <ul>
            {method.questions.map(question => <li key={question}>{question}</li>)}
          </ul>
          <p>{method.boundary}</p>
        </div>
      </details>
      <button className={styles.primary} type="button" onClick={onReturn}>Return to the Base desk<span aria-hidden="true">→</span></button>
      <p className={styles.paperFoot}>YOUR INSTRUCTION STAYS WHERE YOU LEFT IT.</p>
    </div>
  </section>;
}
