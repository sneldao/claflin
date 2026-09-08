/**
 * Patches the live Hetty agent with the shared config (prompt + tools).
 *
 * Run:  node --env-file=.env.local scripts/update-hetty-agent.mjs
 * Requires ELEVENLABS_API_KEY + ELEVENLABS_AGENT_HETTY in .env.local.
 */

import { body } from './hetty-agent-config.mjs';

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_HETTY;
if (!apiKey || !agentId) {
  console.error('ELEVENLABS_API_KEY and ELEVENLABS_AGENT_HETTY are required (load .env.local).');
  process.exit(1);
}

const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
  body: JSON.stringify({ name: body.name, conversation_config: body.conversation_config }),
});

if (!res.ok) {
  console.error('Agent update failed:', res.status, await res.text());
  process.exit(1);
}
console.log('Updated Hetty agent:', agentId);
console.log('Tools now:', body.conversation_config.agent.prompt.tools.map(t => t.name).join(', '));
