/**
 * Provisions the Isabel ConvAI agent on ElevenLabs.
 *
 * Run:  node --env-file=.env.local scripts/create-isabel-agent.mjs
 * Then: set ELEVENLABS_AGENT_ISABEL=<printed id> and ELEVENLABS_VOICE_ISABEL
 * in .env.local and your deployment environment.
 *
 * Isabel drives the Robinhood Chain desk through CLIENT tools — same
 * pattern as Hetty and Jesse. She cannot place orders, move funds, or
 * check wallet balances; the desk is paper-only by design.
 */

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY is required (load .env.local).');
  process.exit(1);
}

import { body, ISABEL_VOICE_ID } from './isabel-agent-config.mjs';

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
console.log('Created Isabel agent:', data.agent_id);
console.log('Voice:', ISABEL_VOICE_ID);
console.log('\nSet in .env.local and deployment env:');
console.log('  ELEVENLABS_AGENT_ISABEL=' + data.agent_id);
console.log('  ELEVENLABS_VOICE_ISABEL=' + ISABEL_VOICE_ID);
