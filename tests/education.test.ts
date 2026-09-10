import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDUCATION_CATALOG_VERSION,
  listEducationTopics,
  getEducationTopic,
  resolveEducationTopic,
  educationTopicSpokenLine,
  topicIdForHouseTerm,
  getBrokerMethod,
  listBrokerMethods,
  resolveBrokerMethod,
  DELAYED_TAPE_STEPS,
  DELAYED_TAPE_REVEAL,
  initialDelayedTapeProgress,
  applyDelayedTapeChoice,
  delayedTapeDebrief,
  practiceReturnHref,
} from '../lib/education';
import { explainConceptResult, deskNoteSpokenLine } from '../lib/trading/voice-tools';
import { HOUSE_DESKS } from '../lib/house';
import { deskNoteOfTheDay } from '../lib/desk-notes';

describe('education catalog', () => {
  it('versions the catalog and ships the four decision topics', () => {
    assert.equal(EDUCATION_CATALOG_VERSION, 1);
    const decision = listEducationTopics();
    assert.deepEqual(
      decision.map(topic => topic.id),
      ['the-tape', 'the-certificate', 'the-bucket-shop', 'the-travelling-instruction'],
    );
    assert.ok(listEducationTopics({ includeOptionalHouse: true }).some(t => t.id === 'participation'));
  });

  it('requires reviewed status, sources, and short-then-deep copy', () => {
    for (const topic of listEducationTopics({ includeOptionalHouse: true })) {
      assert.equal(topic.reviewStatus, 'reviewed', topic.id);
      assert.ok(topic.sources.length > 0, topic.id);
      assert.ok(topic.shortExplanation.length > 40, topic.id);
      assert.ok(topic.deeperReading.length > topic.shortExplanation.length, topic.id);
      assert.doesNotMatch(topic.shortExplanation, /\b(you should buy|guaranteed|risk-free)\b/i);
      assert.doesNotMatch(topic.deeperReading, /\b(you should buy|guaranteed|risk-free)\b/i);
    }
  });

  it('links the delayed-tape practice only from the tape topic', () => {
    assert.equal(getEducationTopic('the-tape')?.practicePath, '/practice/delayed-tape');
    for (const topic of listEducationTopics({ includeOptionalHouse: true })) {
      if (topic.id === 'the-tape') continue;
      assert.equal(topic.practicePath, undefined, topic.id);
    }
    assert.match(practiceReturnHref, /returned=practice/);
    assert.match(practiceReturnHref, /#instruction/);
  });

  it('bridges house words to catalog topics without inventing links', () => {
    assert.equal(topicIdForHouseTerm('tape'), 'the-tape');
    assert.equal(topicIdForHouseTerm('bucket shop'), 'the-bucket-shop');
    assert.equal(topicIdForHouseTerm('seat'), 'participation');
    assert.equal(topicIdForHouseTerm('fill'), undefined);
    assert.equal(topicIdForHouseTerm('margin'), undefined);
  });

  it('resolves caller phrases to catalog topics', () => {
    assert.equal(resolveEducationTopic('slippage')?.id, 'the-travelling-instruction');
    assert.equal(resolveEducationTopic('bucket shop')?.id, 'the-bucket-shop');
    assert.equal(resolveEducationTopic('what is the tape')?.id, 'the-tape');
    assert.equal(resolveEducationTopic('certificate')?.id, 'the-certificate');
    assert.equal(resolveEducationTopic('Woodhull')?.id, 'participation');
    assert.equal(resolveEducationTopic('nope'), undefined);
  });

  it('speaks catalog material without inventing advice', () => {
    const topic = getEducationTopic('the-tape')!;
    const spoken = educationTopicSpokenLine(topic);
    assert.match(spoken, /The tape/);
    assert.match(spoken, /not advice/);
    assert.match(spoken, /practice exercise/);
  });
});

describe('explain_concept voice tool', () => {
  it('returns reviewed copy for known topics and lists options otherwise', () => {
    assert.match(explainConceptResult('tape'), /reference/);
    assert.match(explainConceptResult(''), /I can explain/);
    assert.match(explainConceptResult('martingale'), /I do not have a reviewed explanation/);
  });

  it('speaks broker examination lenses when asked how a desk thinks', () => {
    assert.match(explainConceptResult('how would Jesse examine this'), /Timing and uncertainty/);
    assert.match(explainConceptResult('Isabel’s lens'), /Enterprise and infrastructure/);
    assert.equal(resolveBrokerMethod('liquidity and downside')?.deskId, 'hetty');
  });

  it('points word-of-the-day speech at explain_concept when a catalog bridge exists', () => {
    const base = new Date('2026-09-09T12:00:00');
    let bridged: Date | undefined;
    for (let offset = 0; offset < 90; offset++) {
      const day = new Date(base.getTime() + offset * 86_400_000);
      if (topicIdForHouseTerm(deskNoteOfTheDay('jesse', day).term)) {
        bridged = day;
        break;
      }
    }
    assert.ok(bridged, 'expected a bridged word day for jesse');
    assert.match(deskNoteSpokenLine('jesse', bridged!), /explain_concept/);
  });
});

describe('broker examination methods', () => {
  it('covers every house desk and stays non-executable', () => {
    assert.equal(listBrokerMethods().length, HOUSE_DESKS.length);
    for (const desk of HOUSE_DESKS) {
      const method = getBrokerMethod(desk.id);
      assert.ok(method.questions.length >= 3, desk.id);
      assert.match(method.boundary, /Educational perspective only/i);
      assert.doesNotMatch(method.boundary, /\bexecute|sign the|submit\b/i);
    }
  });

  it('corrects the Benham / Siebert conflation on Isabel’s method', () => {
    const isabel = getBrokerMethod('isabel');
    assert.match(isabel.boundary, /Muriel Siebert/);
    assert.match(isabel.boundary, /not as the first woman with an NYSE seat/i);
  });
});

describe('desk note historical accuracy', () => {
  it('does not claim Isabel Benham held the first NYSE seat', () => {
    const base = new Date('2026-09-09T12:00:00');
    for (let offset = 0; offset < 60; offset++) {
      const note = deskNoteOfTheDay('isabel', new Date(base.getTime() + offset * 86_400_000));
      assert.doesNotMatch(note.text, /Isabel Benham was the first woman to hold one/i);
      if (note.term === 'seat') assert.match(note.text, /Muriel Siebert/);
    }
  });
});

describe('delayed tape practice', () => {
  it('advances only on choice and reveals without a score', () => {
    let progress = initialDelayedTapeProgress();
    assert.equal(progress.complete, false);
    for (let i = 0; i < DELAYED_TAPE_STEPS.length; i++) {
      progress = applyDelayedTapeChoice(progress, i === 1 ? 'buy' : 'stand_aside');
    }
    assert.equal(progress.complete, true);
    assert.equal(progress.choices.length, DELAYED_TAPE_STEPS.length);
    assert.match(DELAYED_TAPE_REVEAL.lesson, /Paper mode/);
    assert.match(delayedTapeDebrief(progress.choices), /stood aside at least once/i);
    assert.match(delayedTapeDebrief(['stand_aside', 'stand_aside', 'stand_aside']), /information, not permission/);
  });

  it('ignores further choices after completion', () => {
    let progress = initialDelayedTapeProgress();
    for (const step of DELAYED_TAPE_STEPS) {
      void step;
      progress = applyDelayedTapeChoice(progress, 'stand_aside');
    }
    const frozen = applyDelayedTapeChoice(progress, 'buy');
    assert.deepEqual(frozen, progress);
  });
});
