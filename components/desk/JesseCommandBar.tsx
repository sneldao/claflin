'use client';

import { useState } from 'react';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import type { CommandResult, JesseDraft } from '@/lib/solana/contracts';
import { parseJesseUtterance, type JesseSpeechParse } from '@/lib/jesse/speech';
import styles from './WorkingDesk.module.css';

/**
 * Typed command line — same grammar as spoken input, same applyJesseCommand path.
 */
export function JesseCommandBar({
  jesse,
  onHeard,
  onParsed,
}: {
  jesse: JesseDesk;
  onHeard?: (text: string) => void;
  /** Called with the parse, its result, and the draft the phrase was parsed
      against — the slip uses it to mark which words wrote which values. */
  onParsed?: (parse: JesseSpeechParse, result: CommandResult, priorDraft: JesseDraft) => void;
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
      const priorDraft = jesse.state.draft;
      const parsed = parseJesseUtterance(heard, priorDraft, jesse.state.quote?.id ?? null);
      if (!parsed.command) {
        setNote('I didn’t catch a supported instruction. Try “buy 100 USDC of AAPLx” or “compare NVIDIA xStock”.');
        return;
      }
      const result = await jesse.run(parsed.command);
      onParsed?.(parsed, result, priorDraft);
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
          placeholder='e.g. buy 100 USDC of AAPLx'
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
