'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  prestockReasonSentence,
  type PreStockDuplex,
} from '@/lib/solana/market/prestocks';
import styles from '../desk/WorkingDesk.module.css';

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

  return (
    <section className={styles.marketEvidence} data-source="prestocks" aria-labelledby="prestocks-title">
      <p className={styles.eyebrow}>PRESTOCKS · REFERENCE VERSUS TOKEN</p>
      <h2 id="prestocks-title">Issuer mark versus token.</h2>
      <p className={styles.evidenceBody}>
        Same duplex idea as an equity-versus-xStock comparison — here the issuer mark stands in for a public equity feed.
        SPV-backed PreStocks only. Not an exchange price, not arbitrage, and not part of the xStock paper ticket you can file.
      </p>
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
      {loading && !duplex && <p className={styles.evidenceMeta}>Reading the issuer list…</p>}
      {errorNote && !duplex && <p className={styles.evidenceMeta} role="status">{errorNote}</p>}
      {duplex && duplex.status === 'unavailable' && (
        <>
          <h3 className={styles.evidenceSub}>Comparison unavailable.</h3>
          <ul className={styles.evidenceReasons}>
            {duplex.reasonCodes.map(code => (
              <li key={code}>{prestockReasonSentence(code)}</li>
            ))}
          </ul>
        </>
      )}
      {duplex && duplex.status === 'comparable' && (
        <>
          <p className={styles.evidenceBody} role="status">
            <strong>Issuer mark:</strong> {duplex.markPrice} USD
            {' · '}
            <strong>Issuer token:</strong> {duplex.tokenPrice} USD
          </p>
          {duplex.referenceDifferenceBps !== null && (
            <p className={styles.evidenceBps}>
              Reference difference: <strong>{duplex.referenceDifferenceBps} bps</strong> — issuer figures only, not profit, not executable.
            </p>
          )}
          <p className={styles.evidenceMeta}>{duplex.disclaimer}</p>
          {duplex.externalUrl && (
            <p className={styles.evidenceMeta}>
              <a href={duplex.externalUrl} target="_blank" rel="noopener noreferrer">Issuer page</a>
              {' · '}mint <code>{duplex.mint.slice(0, 8)}…</code>
            </p>
          )}
        </>
      )}
    </section>
  );
}
