'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import type { TranscriptListItem } from '@/lib/hetty/transcript-list';
import styles from './WorkingDesk.module.css';

/** Minimal retrieve/delete for account-bound call records — not a chat archive. */
export function SavedCallsPanel() {
  const auth = useDeskAuth();
  const [items, setItems] = useState<TranscriptListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await auth.getAccessToken();
      if (!token) { setItems([]); return; }
      const res = await fetch('/api/hetty/transcript', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('Saved calls could not be loaded.');
        setItems([]);
        return;
      }
      const body = (await res.json()) as { transcripts?: TranscriptListItem[] };
      setItems(Array.isArray(body.transcripts) ? body.transcripts : []);
    } catch {
      setError('Saved calls could not be loaded.');
      setItems([]);
    }
  }, [auth]);

  useEffect(() => {
    if (!open || items !== null) return;
    void load();
  }, [open, items, load]);

  const remove = async (conversationId: string) => {
    setBusyId(conversationId);
    setError(null);
    try {
      const token = await auth.getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/hetty/transcript?conversationId=${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('That call could not be deleted.');
        return;
      }
      setItems(prev => (prev ?? []).filter(item => item.conversationId !== conversationId));
    } catch {
      setError('That call could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <details
      className={styles.captionHistory}
      open={open}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>Saved calls</summary>
      <p className={styles.captionApplied}>Account transcripts · 30 days · retrieve or delete. Not agent memory.</p>
      {error && <p role="alert" className={styles.callError}>{error}</p>}
      {items === null && open && <p className={styles.captionApplied}>Loading…</p>}
      {items && items.length === 0 && <p className={styles.captionApplied}>No saved calls.</p>}
      {items && items.length > 0 && (
        <ol>
          {items.map(item => (
            <li key={item.conversationId}>
              <span>{new Date(item.endedAt).toLocaleString()}</span>
              {' · '}
              {item.turnCount} {item.turnCount === 1 ? 'turn' : 'turns'}
              {' — '}
              {item.preview}
              {' '}
              <button
                type="button"
                className={styles.callButtonSecondary}
                disabled={busyId === item.conversationId}
                onClick={() => { void remove(item.conversationId); }}
              >
                Delete
              </button>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
