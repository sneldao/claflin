/**
 * Jesse Call — AssemblyAI streaming conversational surface (WP8).
 *
 * Session lifecycle stays here; the seated ticket and typed bar already
 * drive applyJesseCommand. Until ASSEMBLYAI streaming credentials and a
 * verified ELEVENLABS_VOICE_JESSE are provisioned, the panel stays honest
 * about unavailability and never fabricates a connection.
 */
'use client';

import { useState } from 'react';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import styles from './WorkingDesk.module.css';

export function JesseCall({
  jesse,
  onUserSpoken,
  onAgentSpoken,
}: {
  jesse: JesseDesk;
  onUserSpoken?: (text: string) => void;
  onAgentSpoken?: (text: string) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ring = async () => {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/desk/jesse/voice/token', { method: 'POST', cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        setNote(body.message ?? 'Jesse’s conversational line is not available yet. Use the typed bar or the ticket.');
        return;
      }
      setNote('Line credentials received — streaming transport wires next. Use the typed bar for now.');
      void jesse;
      void onUserSpoken;
      void onAgentSpoken;
    } catch {
      setNote('Could not reach the voice service. Use the typed bar or the ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="jesse-line" className={styles.call} aria-labelledby="jesse-call-title" data-call="idle">
      <div className={styles.brokerPlate}>
        <h2 id="jesse-call-title">Jesse Livermore <small>AI BROKER · SOLANA</small></h2>
        <span className={styles.callLine}>DIRECT LINE</span>
      </div>
      <p className={styles.callNote}>Speak your instruction. Review it on the same ticket.</p>
      <p className={styles.callHint}>
        Typed commands and the ticket already drive the desk. Streaming AssemblyAI conversation opens when the line is provisioned.
      </p>
      <div className={styles.callActions}>
        <button type="button" className={styles.callButton} disabled={busy} onClick={() => { void ring(); }}>
          {busy ? 'Checking the line…' : 'Talk with Jesse'}
        </button>
      </div>
      {note && <p className={styles.callFoot} role="status">{note}</p>}
      {!note && <p className={styles.callFoot}>Mic stays off until you talk — nothing is filed without your review.</p>}
    </section>
  );
}
