import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playStampThud } from '../lib/sounds';

describe('filing-stamp thud', () => {
  it('is a safe no-op without audio hardware', () => {
    /* jsdom provides no AudioContext — the thud must never throw, so a
       missed sound can never block a filing. */
    assert.doesNotThrow(() => playStampThud());
  });
});
