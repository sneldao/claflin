import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectJesseToRoom, projectHettyToRoom } from '../lib/room-view-projection.ts';
import {
  defaultPresentationForDesk,
  loadDeskPresentation,
  parseViewQuery,
  saveDeskPresentation,
} from '../lib/desk-presentation.ts';
import { normalizeDeskPresentation } from '../lib/solana/contracts.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { removeItem(key: string): void } {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

describe('room view projection', () => {
  it('maps Jesse quotation to review view and quote stage', () => {
    const out = projectJesseToRoom({
      stage: 'review',
      presentation: { mode: 'room', focus: 'desk', objectId: null },
      foreground: { kind: 'quotation', quoteId: 'q-1' },
      hasComparison: false,
      inFlight: null,
    });
    assert.deepEqual(out, { stage: 'quote', view: 'review' });
  });

  it('maps Jesse filed receipt to ledger', () => {
    const out = projectJesseToRoom({
      stage: 'saved',
      presentation: { mode: 'room', focus: 'desk', objectId: null },
      foreground: { kind: 'receipt', recordId: 'r-1' },
      hasComparison: false,
      inFlight: null,
    });
    assert.deepEqual(out, { stage: 'filed', view: 'ledger' });
  });

  it('maps Hetty review to quote/review and arrival otherwise', () => {
    assert.deepEqual(
      projectHettyToRoom({ stage: 'review', foregroundKind: 'quotation', reviewing: true }),
      { stage: 'quote', view: 'review' },
    );
    assert.deepEqual(
      projectHettyToRoom({ stage: 'draft', foregroundKind: 'draft', reviewing: false }),
      { stage: 'arrival', view: 'desk' },
    );
  });
});

describe('house desk view preference', () => {
  it('defaults Jesse to room and Hetty to compact', () => {
    assert.equal(defaultPresentationForDesk('jesse'), 'room');
    assert.equal(defaultPresentationForDesk('hetty'), 'compact');
  });

  it('parses canonical and legacy view query tokens', () => {
    assert.equal(parseViewQuery('room'), 'room');
    assert.equal(parseViewQuery('compact'), 'compact');
    assert.equal(parseViewQuery('night'), 'room');
    assert.equal(parseViewQuery('direct'), 'compact');
    assert.equal(parseViewQuery('expert'), null);
    assert.equal(normalizeDeskPresentation('night'), 'room');
  });

  it('persists per desk in canonical tokens', () => {
    const storage = memoryStorage();
    saveDeskPresentation(storage, 'hetty', 'room');
    assert.equal(loadDeskPresentation(storage, 'hetty'), 'room');
    assert.equal(loadDeskPresentation(storage, 'jesse'), 'room');
    storage.setItem('claflin.presentation.v1.hetty', JSON.stringify({ mode: 'direct', focus: 'desk', objectId: null }));
    assert.equal(loadDeskPresentation(storage, 'hetty'), 'compact');
  });
});
