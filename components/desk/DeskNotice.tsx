import type { ReactNode } from 'react';
import Link from 'next/link';
import { HouseMark } from './HouseMark';
import styles from './WorkingDesk.module.css';
import scene from "./DeskScene.module.css";

export function DeskNotice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <main id="main-content" className={`${scene.workspace} ${scene.noticePage}`}>
    <div><Link href="/" className={styles.brand}><HouseMark className={styles.houseMark} /><span><strong>CLAFLIN</strong><small>A CONSIDERED APPROACH</small></span></Link>
      <h1>{title}</h1><div className={scene.noticeCopy}>{children}</div>
      <div className={scene.noticeActions}>{action}<Link href="/">Return to the desk</Link></div>
    </div>
  </main>;
}
