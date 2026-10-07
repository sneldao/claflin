'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType, type ComponentProps } from 'react';
import type { JesseCall } from './JesseCall';
import { BrokerLinePlate } from './BrokerLine';
import { RingExample } from './RingExample';
import { LINE_FOOT } from '@/lib/desk/ui-copy';
import { LINE_SIGNAL_EVENT, consumeRingOnArrival, requestRingOnArrival } from '@/lib/trading/line-signal';
import styles from './WorkingDesk.module.css';

type CallProps = ComponentProps<typeof JesseCall>;
const loadCall = () => import('./JesseCall').then(module => module.JesseCall);

/** Keep the idle line usable without fetching the carrier's media runtime. */
export function JesseCallGate({ load = loadCall, ...props }: CallProps & {
  load?: () => Promise<ComponentType<CallProps>>;
}) {
  const [Call, setCall] = useState<ComponentType<CallProps> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const ring = useCallback(() => {
    pending.current = true;
    setLoading(true);
    setError(null);
    // A renewed ring reuses the import already in progress after cancellation.
    if (inFlight.current) return;
    inFlight.current = true;
    void load().then(component => {
      if (!alive.current) return;
      if (pending.current) requestRingOnArrival('jesse');
      pending.current = false;
      setCall(() => component);
    }).catch(() => {
      pending.current = false;
      if (alive.current) setError('The line could not load. Try Ring Jesse again; the ticket stays usable.');
    }).finally(() => {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    });
  }, [load]);
  const cancel = useCallback(() => {
    pending.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; pending.current = false; };
  }, []);
  useEffect(() => {
    if (Call) return;
    const signal = (event: Event) => {
      if ((event as CustomEvent).detail !== 'toggle') return;
      if (pending.current && inFlight.current) cancel();
      else ring();
    };
    window.addEventListener(LINE_SIGNAL_EVENT, signal);
    if (consumeRingOnArrival('jesse')) ring();
    return () => window.removeEventListener(LINE_SIGNAL_EVENT, signal);
  }, [Call, ring, cancel]);

  if (Call) return <Call {...props} />;
  return (
    <section id="jesse-line" className={styles.call} aria-labelledby="jesse-call-title" data-live="false" data-call={loading ? 'connecting' : 'idle'} data-state={loading ? 'connecting' : 'idle'}>
      <div className={styles.brokerPlate}>
        <h2 id="jesse-call-title" className={props.compactPlate ? styles.srOnly : undefined}>Jesse Livermore <small>The Boy Plunger · AI broker on Solana</small></h2>
        <span className={styles.callLine}><span className={styles.callDot} aria-hidden="true" />{loading ? 'CONNECTING' : 'DIRECT LINE'}</span>
      </div>
      {!loading && <BrokerLinePlate deskId="jesse" take={props.take} compact={props.compactPlate} />}
      <div className={styles.callActions}>
        {loading ? <>
          <p className={styles.callStatus} role="status">Loading the line… the ticket stays usable.</p>
          <button type="button" className={styles.callButtonSecondary} onClick={cancel}>Cancel</button>
        </> : <>
          <button type="button" className={styles.callButton} data-cue="idle" aria-label="Ring Jesse" onClick={ring}>
            <span className={styles.ringLamp} aria-hidden="true" />{props.compactPlate ? 'Ring' : 'Ring Jesse'}
          </button>
          {props.compactPlate && <RingExample deskId="jesse" />}
        </>}
      </div>
      {error && <p className={styles.callError} role="alert">{error}</p>}
      {!loading && !error && <p className={styles.callFoot}>{LINE_FOOT} Press <kbd>H</kbd> to lift the line.</p>}
    </section>
  );
}
