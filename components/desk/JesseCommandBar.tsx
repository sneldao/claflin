'use client';

import { useState } from 'react';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import { bindFilePaperCommand, parseJesseSpeech } from '@/lib/jesse/speech';
import styles from './WorkingDesk.module.css';

/**
 * Typed command line — same grammar as spoken input, same applyJesseCommand path.
 */
export function JesseCommandBar({
  jesse,
  onHeard,
}: {
  jesse: JesseDesk;
  onHeard?: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = async () => {
    const heard = text.trim();
    if (!heard || busy) return;
    setBusy(true);
    setNote(null);
    onHeard?.(heard);
    try {
      let parsed = parseJesseSpeech(heard, jesse.state.draft);
      parsed = bindFilePaperCommand(parsed, jesse.state.quote?.id ?? null);
      if (!parsed.command) {
        setNote('I didn’t catch a supported instruction. Try “buy 100 USDC of Apple” or “compare NVIDIA”.');
        return;
      }
      const result = await jesse.run(parsed.command);
      setNote(result.spokenText);
      if (result.status === 'applied' || result.status === 'clarify') setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={styles.jesseCommandBar}
      onSubmit={e => { e.preventDefault(); void submit(); }}
      aria-label="Typed instruction to Jesse"
    >
      <label>
        Tell Jesse
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder='e.g. buy 100 USDC of Apple'
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <button type="submit" className={styles.callButtonSecondary} disabled={busy || !text.trim()}>
        {busy ? 'Working…' : 'Send'}
      </button>
      {note && <p className={styles.callNote} role="status">{note}</p>}
    </form>
  );
}
