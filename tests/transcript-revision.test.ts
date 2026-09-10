import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { keptTranscriptRevision } from '../lib/hetty/transcript-revision';

describe('transcript checkpoint revisions', () => {
  it('keeps a newer stored revision when an older checkpoint arrives late', () => {
    assert.equal(keptTranscriptRevision(12, 8), 12);
    assert.equal(keptTranscriptRevision(5, 5), null, 'equal revisions may overwrite');
    assert.equal(keptTranscriptRevision(3, 7), null, 'newer incoming writes through');
  });
  it('ignores non-numeric prior revisions', () => {
    assert.equal(keptTranscriptRevision(undefined, 2), null);
    assert.equal(keptTranscriptRevision('nope', 2), null);
  });
});
