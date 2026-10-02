/**
 * Provisions the Halley ConvAI agent on ElevenLabs.
 *
 * Run:  node --env-file=.env.local scripts/create-halley-agent.mjs
 * Then: set ELEVENLABS_AGENT_HALLEY=<printed id> and ELEVENLABS_VOICE_HALLEY
 * in .env.local and your deployment environment.
 *
 * Halley drives the Meteora launch desk through CLIENT tools — same
 * pattern as Hetty, Jesse, and Isabel. He cannot place orders, sign a
 * launch, or move funds; the desk is paper-only by design.
 */

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY is required (load .env.local).');
  process.exit(1);
}

import { body, HALLEY_VOICE_ID } from './halley-agent-config.mjs';

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
console.log('Created Halley agent:', data.agent_id);
console.log('Voice:', HALLEY_VOICE_ID);
console.log('\nSet in .env.local and deployment env:');
console.log('  ELEVENLABS_AGENT_HALLEY=' + data.agent_id);
console.log('  ELEVENLABS_VOICE_HALLEY=' + HALLEY_VOICE_ID);
