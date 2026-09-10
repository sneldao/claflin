/**
 * Patches the live Hetty agent with the shared config (prompt + tools).
 *
 * Run:  node --env-file=.env.local scripts/update-hetty-agent.mjs
 * Requires ELEVENLABS_API_KEY + ELEVENLABS_AGENT_HETTY in .env.local.
 *
 * The desk overrides the first message per call (hettyOpeningLine), so the
 * agent must allow the first_message override. The permission lives under
 * platform_settings.overrides — which is NOT part of conversation_config —
 * so we read the current agent and merge, never replace: a blind PATCH of
 * conversation_config alone leaves the flag false (or resets it), and the
 * server then closes every call right after initiation with 1008
 * "Override for field 'first_message' is not allowed by config."
 */

import { body } from './hetty-agent-config.mjs';

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_HETTY;
if (!apiKey || !agentId) {
  console.error('ELEVENLABS_API_KEY and ELEVENLABS_AGENT_HETTY are required (load .env.local).');
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
console.log('Updated Hetty agent:', agentId);
console.log('first_message override:', mergedPlatformSettings.overrides.conversation_config_override.agent.first_message);
console.log('Tools now:', body.conversation_config.agent.prompt.tools.map(t => t.name).join(', '));
