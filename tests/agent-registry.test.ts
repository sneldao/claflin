import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// Agent Registry Tests
// ============================================

describe('Broker Registry', () => {
  it('should export AGENT_REGISTRY with 7 brokers', async () => {
    const { AGENT_REGISTRY } = await import('../lib/agent-registry');
    const keys = Object.keys(AGENT_REGISTRY);
    assert.equal(keys.length, 7, 'Should have 7 canonical brokers (6 specialists + 1 router)');
    assert.ok(keys.includes('solana_sage'));
    assert.ok(keys.includes('code_reviewer'));
    assert.ok(keys.includes('general_helper'));
    assert.ok(keys.includes('tour_master'));
    assert.ok(keys.includes('web_researcher'));
    assert.ok(keys.includes('medical_advisor'));
    assert.ok(keys.includes('voice_router'));
  });

  it('each broker should have required fields', async () => {
    const { AGENT_REGISTRY } = await import('../lib/agent-registry');
    for (const [key, agent] of Object.entries(AGENT_REGISTRY)) {
      assert.ok(agent.name, `${key} should have a name`);
      assert.ok(agent.tagline, `${key} should have a tagline`);
      assert.ok(agent.voiceId, `${key} should have a voiceId`);
      assert.ok(agent.systemPrompt, `${key} should have a systemPrompt`);
      assert.ok(Array.isArray(agent.specialties), `${key} should have specialties`);
      assert.ok(Array.isArray(agent.allowedSkills), `${key} should have allowedSkills`);
      assert.ok(agent.allowedSkills.length > 0, `${key} should have at least one allowed skill`);
    }
  });

  it('findBySpecialty should return matching broker', async () => {
    const { findBySpecialty } = await import('../lib/agent-registry');
    const agent = findBySpecialty('stocks');
    assert.ok(agent, 'Should find a broker for stocks');
    assert.equal(agent?.key, 'general_helper');
  });

  it('findBySpecialty should fallback to general_helper for unknown', async () => {
    const { findBySpecialty } = await import('../lib/agent-registry');
    const agent = findBySpecialty('unknown_specialty_xyz');
    assert.equal(agent?.key, 'general_helper', 'Should fallback to general_helper');
  });

  it('agentCanUseSkill should validate permissions correctly', async () => {
    const { agentCanUseSkill } = await import('../lib/agent-registry');
    assert.ok(agentCanUseSkill('general_helper', 'research'), 'Hetty should be able to research');
    assert.ok(!agentCanUseSkill('general_helper', 'book'), 'Hetty should not be able to book');
    assert.ok(!agentCanUseSkill('solana_sage', 'book'), 'Tennie should not be able to book');
    assert.ok(agentCanUseSkill('code_reviewer', 'research'), 'Woodhull should be able to research');
    assert.ok(!agentCanUseSkill('tour_master', 'order'), 'Concierge should not be able to order');
    assert.ok(agentCanUseSkill('web_researcher', 'research'), 'Baruch should be able to research');
    assert.ok(!agentCanUseSkill('web_researcher', 'book'), 'Baruch should not be able to book');
  });
});
