/**
 * Provisions the Tennie ConvAI agent on ElevenLabs.
 *
 * Run:  node --env-file=.env.local scripts/create-tennie-agent.mjs
 * Then: set ELEVENLABS_AGENT_TENNIE=<printed id> and ELEVENLABS_VOICE_TENNIE
 * in .env.local and your deployment environment.
 *
 * Tennie drives the Robinhood Chain desk through CLIENT tools — same
 * pattern as Hetty and Jesse. She cannot place orders, move funds, or
 * check wallet balances; the desk is paper-only by design.
 */

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY is required (load .env.local).');
  process.exit(1);
}

import { body, TENNIE_VOICE_ID } from './tennie-agent-config.mjs';

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
console.log('Created Tennie agent:', data.agent_id);
console.log('Voice:', TENNIE_VOICE_ID);
console.log('\nSet in .env.local and deployment env:');
console.log('  ELEVENLABS_AGENT_TENNIE=' + data.agent_id);
console.log('  ELEVENLABS_VOICE_TENNIE=' + TENNIE_VOICE_ID);
