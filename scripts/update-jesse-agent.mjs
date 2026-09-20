/**
 * Patches the live Jesse agent with the shared config (prompt + tools).
 *
 * Run:  node --env-file=.env.local scripts/update-jesse-agent.mjs
 * Requires ELEVENLABS_API_KEY + ELEVENLABS_AGENT_JESSE in .env.local.
 *
 * Merges platform_settings.overrides so first_message override stays allowed
 * (same pitfall as update-hetty-agent.mjs).
 */

import { body } from './jesse-agent-config.mjs';

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_JESSE;
if (!apiKey || !agentId) {
  console.error('ELEVENLABS_API_KEY and ELEVENLABS_AGENT_JESSE are required (load .env.local).');
  process.exit(1);
}

const url = `https://api.elevenlabs.io/v1/convai/agents/${agentId}`;
const headers = { 'Content-Type': 'application/json', 'xi-api-key': apiKey };

const currentRes = await fetch(url, { headers });
if (!currentRes.ok) {
  console.error('Agent fetch failed:', currentRes.status, await currentRes.text());
  process.exit(1);
}
const current = await currentRes.json();
const platformSettings = current.platform_settings ?? {};
const currentOverrides = platformSettings.overrides ?? {};
const currentConfigOverride = currentOverrides.conversation_config_override ?? {};

const mergedPlatformSettings = {
  ...platformSettings,
  overrides: {
    ...currentOverrides,
    conversation_config_override: {
      ...currentConfigOverride,
      agent: { ...(currentConfigOverride.agent ?? {}), first_message: true },
    },
  },
};

const res = await fetch(url, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    name: body.name,
    conversation_config: body.conversation_config,
    platform_settings: mergedPlatformSettings,
  }),
});

if (!res.ok) {
  console.error('Agent update failed:', res.status, await res.text());
  process.exit(1);
}
console.log('Updated Jesse agent:', agentId);
console.log('first_message override:', mergedPlatformSettings.overrides.conversation_config_override.agent.first_message);
console.log('Tools now:', body.conversation_config.agent.prompt.tools.map((t) => t.name).join(', '));
console.log('Voice:', body.conversation_config.tts.voice_id);
