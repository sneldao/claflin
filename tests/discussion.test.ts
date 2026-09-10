import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCaption,
  boundedDiscussionContext,
  lastCaption,
  openingWithResume,
  summarizeDiscussion,
  type DiscussionCaption,
} from '../lib/hetty/discussion';
import { sortTranscriptList, toTranscriptListItem, transcriptListPreview } from '../lib/hetty/transcript-list';

function caption(role: DiscussionCaption['role'], text: string, at = 1): DiscussionCaption {
  return { role, text, at };
}

describe('discussion survives the voice connection', () => {
  it('appends newest-last and keeps the last exchange readable', () => {
    let captions: DiscussionCaption[] = [];
    captions = appendCaption(captions, caption('user', 'Buy NVIDIA for 25 USDC', 1));
    captions = appendCaption(captions, caption('agent', 'On the ticket.', 2));
    assert.equal(captions.length, 2);
    assert.equal(lastCaption(captions, 'user')?.text, 'Buy NVIDIA for 25 USDC');
    assert.equal(lastCaption(captions, 'agent')?.text, 'On the ticket.');
    const summary = summarizeDiscussion(captions);
    assert.ok(summary?.includes('Buy NVIDIA for 25 USDC'));
    assert.ok(summary?.includes('The ticket holds the instruction'));
  });
  it('returns null sides and summary when nothing has been said', () => {
    assert.equal(lastCaption([], 'user'), null);
    assert.equal(summarizeDiscussion([]), null);
    assert.equal(boundedDiscussionContext([]), null);
  });
  it('bounds the store so a long call cannot grow it without limit', () => {
    let captions: DiscussionCaption[] = [];
    for (let i = 0; i < 60; i++) captions = appendCaption(captions, caption(i % 2 ? 'agent' : 'user', `line ${i}`, i));
    assert.equal(captions.length, 50);
    assert.equal(captions[captions.length - 1].text, 'line 59');
  });
  it('builds a bounded resume context and opening without inventing turns', () => {
    const captions = [
      caption('user', 'Buy Apple for 10 USDC', 1),
      caption('agent', 'On the ticket.', 2),
      caption('user', 'What is slippage?', 3),
    ];
    const context = boundedDiscussionContext(captions, 200);
    assert.ok(context);
    assert.ok(context!.includes('Caller:'));
    assert.ok(context!.length <= 200);
    const opening = openingWithResume('Claflin, Hetty speaking.', captions);
    assert.match(opening, /Continuing our discussion/);
    assert.match(opening, /What is slippage/);
    assert.match(opening, /Claflin, Hetty speaking/);
    assert.equal(openingWithResume('Hello.', []), 'Hello.');
  });
});

describe('transcript list previews', () => {
  it('prefers the latest caller turn and sorts newest first', () => {
    const item = toTranscriptListItem('conv-1', {
      turns: [
        { role: 'agent', text: 'Hello', at: 1 },
        { role: 'user', text: 'Buy NVIDIA for 25 USDC', at: 2 },
      ],
      startedAt: 100,
      endedAt: 200,
    });
    assert.equal(item.preview, 'Buy NVIDIA for 25 USDC');
    assert.equal(item.turnCount, 2);
    assert.equal(transcriptListPreview([{ role: 'agent', text: 'Only Hetty', at: 1 }]), 'Only Hetty');
    const sorted = sortTranscriptList([
      { ...item, conversationId: 'a', endedAt: 1 },
      { ...item, conversationId: 'b', endedAt: 9 },
    ]);
    assert.deepEqual(sorted.map(s => s.conversationId), ['b', 'a']);
  });
});
