/**
 * Provisions the Jesse ConvAI agent on ElevenLabs.
 *
 * Run:  node --env-file=.env.local scripts/create-jesse-agent.mjs
 * Then: set ELEVENLABS_AGENT_JESSE=<printed id> and ELEVENLABS_VOICE_JESSE
 * in .env.local and your deployment environment.
 *
 * Jesse drives the Solana desk through CLIENT tools — same pattern as Hetty.
 * He cannot place orders, move funds, or check wallet balances.
 */

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY is required (load .env.local).');
  process.exit(1);
}

import { body, JESSE_VOICE_ID } from './jesse-agent-config.mjs';

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
console.log('Created Jesse agent:', data.agent_id);
console.log('Voice:', JESSE_VOICE_ID, '(Brian)');
console.log('\nSet in .env.local and deployment env:');
console.log('  ELEVENLABS_AGENT_JESSE=' + data.agent_id);
console.log('  ELEVENLABS_VOICE_JESSE=' + JESSE_VOICE_ID);
