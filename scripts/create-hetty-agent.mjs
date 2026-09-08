/**
 * Provisions the Hetty ConvAI agent on ElevenLabs.
 *
 * Run:  node --env-file=.env.local scripts/create-hetty-agent.mjs
 * Then: set ELEVENLABS_AGENT_HETTY=<printed id> in .env.local and your
 * deployment environment.
 *
 * Hetty drives the desk through CLIENT tools — her calls execute in the
 * caller's browser, so she can draft, request estimates and record paper
 * trades while the user watches. She has no webhook tools: she cannot
 * place orders, move funds or check eligibility.
 */

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY is required (load .env.local).');
  process.exit(1);
}

import { body } from './hetty-agent-config.mjs';

const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error('Agent creation failed:', res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
console.log('Created Hetty agent:', data.agent_id);
console.log('\nSet in .env.local and deployment env:\n  ELEVENLABS_AGENT_HETTY=' + data.agent_id);
