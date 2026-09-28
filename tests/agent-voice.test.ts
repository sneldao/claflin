import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TTS_FALLBACK, AGENT_TTS_MODEL, AGENT_TTS_PRIMARY, resolveAgentTtsModel, SPOKEN_STYLE } from '../scripts/agent-voice.mjs';
import { body as hetty, SYSTEM_PROMPT as HETTY_PROMPT } from '../scripts/hetty-agent-config.mjs';
import { body as jesse, SYSTEM_PROMPT as JESSE_PROMPT } from '../scripts/jesse-agent-config.mjs';

describe('broker voice (Eleven v4 Turbo)', () => {
  it('both brokers speak on the one shared agent TTS model', () => {
    if (!process.env.ELEVENLABS_TTS_MODEL) assert.equal(AGENT_TTS_MODEL, 'eleven_v4_turbo');
    assert.equal(hetty.conversation_config.tts.model_id, AGENT_TTS_MODEL);
    assert.equal(jesse.conversation_config.tts.model_id, AGENT_TTS_MODEL);
    assert.notEqual(AGENT_TTS_MODEL, 'eleven_turbo_v2', 'deprecated model is gone');
  });

  it('both prompts carry the spoken-style rules v4 needs: no bracketed cues, spoken numbers', () => {
    for (const prompt of [HETTY_PROMPT, JESSE_PROMPT]) {
      assert.ok(prompt.includes(SPOKEN_STYLE.trim()));
    }
    assert.match(SPOKEN_STYLE, /Never write bracketed stage directions/);
    assert.match(SPOKEN_STYLE, /Write numbers the way a broker says them/);
  });

  it('v4 Turbo is primary, v3 Conversational is the named fallback', () => {
    assert.equal(AGENT_TTS_PRIMARY, 'eleven_v4_turbo');
    assert.equal(AGENT_TTS_FALLBACK, 'eleven_v3_conversational');
    assert.equal(resolveAgentTtsModel(undefined), 'eleven_v4_turbo');
    assert.equal(resolveAgentTtsModel('  '), 'eleven_v4_turbo');
    assert.equal(resolveAgentTtsModel('fallback'), 'eleven_v3_conversational');
    assert.equal(resolveAgentTtsModel('eleven_flash_v2'), 'eleven_flash_v2');
  });

  it('sets no v2-only voice controls v4 does not support', () => {
    for (const tts of [hetty.conversation_config.tts, jesse.conversation_config.tts]) {
      assert.equal('style' in tts, false);
      assert.equal('speed' in tts, false);
    }
  });
});
