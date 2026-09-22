'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  prestockReasonSentence,
  type PreStockDuplex,
} from '@/lib/solana/market/prestocks';
import { PRESTOCKS_ABOUT } from '@/lib/desk/ui-copy';
import { EvidencePanel, EvidenceRow, EvidenceDelta } from '../desk/EvidencePanel';
import styles from '../desk/WorkingDesk.module.css';
import evidence from "../desk/EvidencePanel.module.css";

type ListItem = { symbol: string; name: string; mint: string; externalUrl: string | null };

/**
 * Secondary PreStocks duplex — issuer mark vs issuer token price.
 * Evidence only; never files paper. Degrades to unavailable honestly.
 */
export function PreStocksEvidence() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [duplex, setDuplex] = useState<PreStockDuplex | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/desk/jesse/prestocks', { cache: 'no-store' });
        const body = await res.json() as { products?: ListItem[]; disclaimer?: string };
        if (cancelled) return;
        const list = Array.isArray(body.products) ? body.products : [];
        setItems(list);
        if (list[0]) setSelected(list[0].symbol);
        setErrorNote(list.length ? null : 'PreStocks list unavailable right now.');
      } catch {
        if (!cancelled) setErrorNote('PreStocks list unavailable right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadDuplex = useCallback(async (symbol: string) => {
    if (!symbol) { setDuplex(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/desk/jesse/prestocks?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const body = await res.json() as PreStockDuplex;
      setDuplex(body);
    } catch {
      setDuplex(null);
      setErrorNote('PreStocks evidence unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) void loadDuplex(selected);
  }, [selected, loadDuplex]);

  const status = duplex === null
    ? loading ? 'loading' : errorNote ? 'unavailable' : 'empty'
    : duplex.status === 'comparable' ? 'ready' : 'unavailable';

  return (
    <EvidencePanel
      titleId="prestocks-title"
      eyebrow="PRESTOCKS · REFERENCE VS TOKEN"
      title="Issuer mark vs token"
      status={status}
      about={
        <>
          <p>{PRESTOCKS_ABOUT}</p>
          {duplex?.disclaimer && <p>{duplex.disclaimer}</p>}
        </>
      }
      body={
        duplex?.status === 'comparable' ? (
          <>
            {items.length > 0 && (
              <label className={styles.prestockPick}>
                <span className={styles.voiceSayLead}>Product</span>
                <select
                  value={selected}
                  onChange={e => setSelected(e.target.value)}
                  aria-label="Choose a PreStock"
                >
                  {items.map(item => (
                    <option key={item.symbol} value={item.symbol}>{item.symbol} — {item.name}</option>
                  ))}
                </select>
              </label>
            )}
            <EvidenceRow label="Issuer mark" value={duplex.markPrice ? `${duplex.markPrice} USD` : 'price unavailable'} />
            <EvidenceRow label="Issuer token" value={duplex.tokenPrice ? `${duplex.tokenPrice} USD` : 'price unavailable'} />
            <EvidenceDelta bps={duplex.referenceDifferenceBps} />
            {duplex.externalUrl && (
              <p className={evidence.evidenceMeta}>
                <a href={duplex.externalUrl} target="_blank" rel="noopener noreferrer">Issuer page</a>
                {' · '}mint <code>{duplex.mint.slice(0, 8)}…</code>
              </p>
            )}
          </>
        ) : duplex?.status === 'unavailable' ? (
          <ul className={evidence.evidenceReasons}>
            {duplex.reasonCodes.map(code => (
              <li key={code}>{prestockReasonSentence(code)}</li>
            ))}
          </ul>
        ) : undefined
      }
      meta={
        duplex === null && errorNote
          ? <p className={evidence.evidenceMeta} role="status">{errorNote}</p>
          : duplex?.status === 'comparable'
            ? <p className={evidence.evidenceMeta}>{duplex.symbol} · observed {new Date(duplex.observedAt).toLocaleString()}</p>
            : undefined
      }
    />
  );
}
