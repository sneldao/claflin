'use client';

import { SIGNAL_CAPTIONS, type SignalCaptionKey } from '@/lib/desk/ui-copy';
import { useSignalCaption } from '@/lib/desk/use-signal-caption';
import styles from './WorkingDesk.module.css';

/**
 * A signal's first-exposure caption — teaches an ambient state once, then
 * retires per browser. The ambient signal plus its permanent on-tap text
 * carry on without it.
 */
export function SignalCaption({ captionKey, text }: { captionKey: SignalCaptionKey; text?: string }) {
  const { show, dismiss } = useSignalCaption(captionKey);
  if (!show) return null;
  return (
    <p className={styles.signalCaption} role="status">
      <span>{text ?? SIGNAL_CAPTIONS[captionKey]}</span>
      <button type="button" className={styles.signalDismiss} onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </p>
  );
}
