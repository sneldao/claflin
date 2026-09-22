import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSolanaInstrumentResult,
  jesseClosingLine,
  jesseForegroundGuard,
  jesseOpeningLine,
  nextJesseInstructionDraft,
  resolveExplainTopic,
  resolveSolanaAlias,
} from '../lib/jesse/voice-tools';
import type { JesseDeskState } from '../lib/solana/controller';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';

const emptyState = (): JesseDeskState => ({
  revision: 0,
  sessionGeneration: 1,
  draft: { instrumentId: null, side: null, unit: null, amount: null },
  stage: 'draft',
  quote: null,
  presentedInstrument: null,
  comparison: null,
  presentation: { mode: 'compact', focus: 'desk', objectId: null },
  watches: [],
});

describe('jesse voice tools', () => {
  it('resolves xStock aliases and refuses unknowns', () => {
    assert.equal(resolveSolanaAlias('Apple')?.symbol, 'AAPLx');
    assert.equal(resolveSolanaAlias('nvdax')?.symbol, 'NVDAx');
    assert.equal(resolveSolanaAlias('TSLA')?.symbol, 'TSLAx');
    assert.equal(resolveSolanaAlias('AAPLc'), null);
    assert.match(chooseSolanaInstrumentResult('GOOG'), /not on this desk/);
  });

  it('guards archive and missing foregrounds', () => {
    const doc = (kind: 'archive' | 'missing' | 'draft') => ({
      kind, quoteId: kind === 'draft' ? null : 'x', recordId: kind === 'draft' ? null : 'x',
      instrumentId: null, actionable: kind === 'draft', readonly: kind !== 'draft',
    });
    assert.match(jesseForegroundGuard(doc('archive')) ?? '', /reading/);
    assert.match(jesseForegroundGuard(doc('missing')) ?? '', /no longer/);
    assert.equal(jesseForegroundGuard(doc('draft')), null);
  });

  it('clears amount on side flip', () => {
    const apple = SOLANA_INSTRUMENTS[0];
    const flipped = nextJesseInstructionDraft(
      { instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '100' },
      'sell',
    );
    assert.equal(flipped.amountCleared, true);
    assert.equal(flipped.draft.amount, null);
    assert.equal(flipped.draft.unit, 'scaled-token');
  });

  it('maps explain topics', () => {
    assert.equal(resolveExplainTopic('scaled units'), 'scaled-units');
    assert.equal(resolveExplainTopic('why is the equity different'), 'reference-difference');
    assert.equal(resolveExplainTopic('astrology'), null);
  });

  it('opens from the ticket, not a generic pitch', () => {
    const apple = SOLANA_INSTRUMENTS[0];
    const state = emptyState();
    state.draft = { instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '100' };
    assert.match(jesseOpeningLine(state, { kind: 'draft' }), /Shall we check the estimate/);
    assert.match(jesseOpeningLine(emptyState(), { kind: 'quotation', quoteId: 'q1' }), /quotation is on the slip/);
    assert.match(jesseClosingLine(emptyState(), { kind: 'draft' }, 'ended'), /Nothing was filed/);
  });
});
