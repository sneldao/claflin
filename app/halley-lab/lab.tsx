'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { estimateLaunch } from '@/lib/meteora/dbc';
import type { HalleyAnchor, LaunchCurvePreset } from '@/lib/meteora/contracts';
import type { HalleyPaperRecord } from '@/lib/meteora/paper';

const HalleyWatch = dynamic(() => import('@/components/desk/HalleyWatch').then(m => m.HalleyWatch), { ssr: false });
const HalleyShareCard = dynamic(() => import('@/components/desk/HalleyShareCard').then(m => m.HalleyShareCard), { ssr: false });
const HalleyCurvePreview = dynamic(() => import('@/components/desk/HalleyCurvePreview').then(m => m.HalleyCurvePreview), { ssr: false });
const HalleyLaunchCelebration = dynamic(() => import('@/components/desk/HalleyLaunchCelebration').then(m => m.HalleyLaunchCelebration), { ssr: false });

const HOUR = 3_600_000;

function sampleRecord(hoursOld: number): HalleyPaperRecord {
  const at = Date.now() - hoursOld * HOUR;
  const anchor: HalleyAnchor = {
    symbol: 'NVDA', source: 'pyth-pro', equityUsd: '227.10',
    pairRatio: null, quoteEquityUsd: null,
    observedAt: at, status: 'observed',
  };
  const intent = {
    name: 'Comet Ledger', symbol: 'CMNVDA', anchorSymbol: 'NVDA',
    quoteSymbol: 'USDC', curve: 'equity-pair' as const,
    supply: '1000000', graduationQuote: '150',
  };
  const estimate = estimateLaunch(intent, anchor, at);
  return {
    version: 2, id: estimate.id, mode: 'paper', deskId: 'halley',
    owner: 'anonymous', createdAt: at, estimate,
  } as unknown as HalleyPaperRecord;
}

export function HalleyLab() {
  const [graduationQuote, setGraduationQuote] = useState(150);
  const [preset, setPreset] = useState<LaunchCurvePreset>('equity-pair');
  const [celebrations, setCelebrations] = useState<number[]>([]);

  const fresh = useMemo(() => sampleRecord(4), []);
  const nearlyDone = useMemo(() => sampleRecord(80), []);

  return (
    <main style={{ display: 'grid', gap: 36, padding: 24, maxWidth: 760, margin: '0 auto', background: 'var(--desk-felt)', minHeight: '100vh' }}>
      <h1 style={{ font: '600 22px/1.2 var(--font-display), serif', color: 'var(--desk-paper-ink)' }}>Halley lab — watch, share, curve, celebration</h1>

      <section style={{ position: 'relative' }}>
        <h2 style={{ font: '9px/1 var(--font-mono), monospace', letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--desk-brass-dim)' }}>Live curve preview — drag vertically, or focus and use arrows</h2>
        <HalleyCurvePreview
          openingPrice={227.1}
          supply={1_000_000}
          preset={preset}
          quoteSymbol="USDC"
          graduationQuote={graduationQuote}
          minGraduationQuote={10}
          maxGraduationQuote={5000}
          onGraduationChange={setGraduationQuote}
          label="Shape the launch"
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {(['flat', 'equity-pair', 'long', 'exponential'] as const).map(p => (
            <button key={p} type="button" onClick={() => setPreset(p)} style={{ font: '11px var(--font-mono), monospace', padding: '4px 8px', background: preset === p ? 'var(--desk-brass)' : 'transparent', color: preset === p ? 'var(--desk-paper)' : 'var(--desk-paper-ink)', border: '1px solid var(--desk-paper-rule)' }}>{p}</button>
          ))}
        </div>
      </section>

      <HalleyWatch record={fresh} />
      <HalleyWatch record={nearlyDone} />
      <HalleyShareCard record={fresh} />

      <section>
        <button type="button" onClick={() => setCelebrations(c => [...c, Date.now()])} style={{ font: '600 12px/1 var(--font-mono), monospace', padding: '10px 16px', background: 'var(--desk-brass)', border: 'none', color: 'var(--desk-paper)', cursor: 'pointer' }}>
          Fire a launch celebration
        </button>
        <div style={{ position: 'relative', height: 160, marginTop: 12, background: 'var(--desk-paper)', border: '1px solid var(--desk-paper-edge)' }}>
          {celebrations.length > 0 && (
            <HalleyLaunchCelebration key={celebrations[celebrations.length - 1]} symbol="CMNVDA" />
          )}
        </div>
      </section>
    </main>
  );
}
