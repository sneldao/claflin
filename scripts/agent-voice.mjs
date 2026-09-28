/**
 * Shared voice settings for the house brokers (Hetty, Jesse).
 *
 * TTS model: Eleven v4 Turbo is primary — the v4 real-time variant built for
 * agents (~100 ms median inference). Eleven v3 Conversational is the
 * fallback — the previous real-time generation, the same expressive tag
 * handling. Both replace eleven_turbo_v2, which ElevenLabs lists as
 * deprecated.
 *
 *   ELEVENLABS_TTS_MODEL unset       → eleven_v4_turbo
 *   ELEVENLABS_TTS_MODEL=fallback    → eleven_v3_conversational
 *   ELEVENLABS_TTS_MODEL=<model id>  → that model
 *
 * Roll back with no code change:
 *   ELEVENLABS_TTS_MODEL=fallback node --env-file=.env.local scripts/update-hetty-agent.mjs
 *   ELEVENLABS_TTS_MODEL=fallback node --env-file=.env.local scripts/update-jesse-agent.mjs
 * Docs: https://elevenlabs.io/docs/models
 *       https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4
 *
 * v4 has no Style/Speed sliders and no SSML; it treats bracketed text such
 * as [laughs] as delivery or sound-effect direction. The brokers' replies are
 * written by an LLM in real time, so the prompt forbids brackets and asks for
 * numbers written the way they should be said.
 */

export const AGENT_TTS_PRIMARY = 'eleven_v4_turbo';
export const AGENT_TTS_FALLBACK = 'eleven_v3_conversational';

export function resolveAgentTtsModel(requested = process.env.ELEVENLABS_TTS_MODEL) {
  const value = (requested ?? '').trim();
  if (!value) return AGENT_TTS_PRIMARY;
  if (value === 'fallback') return AGENT_TTS_FALLBACK;
  return value;
}

export const AGENT_TTS_MODEL = resolveAgentTtsModel();

/**
 * After a PATCH, read the agent back and confirm the TTS model the server
 * actually kept — an agent can accept an update and still keep another
 * model. Exits non-zero on a mismatch so a rollout never reports success
 * it did not get.
 */
export async function confirmAgentTtsModel(url, headers, expected, label) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`${label}: could not read the agent back (${res.status}).`);
    process.exit(1);
  }
  const agent = await res.json();
  const kept = agent?.conversation_config?.tts?.model_id ?? null;
  if (kept !== expected) {
    console.error(`${label}: asked for ${expected}, the agent kept ${kept}. Roll back with ELEVENLABS_TTS_MODEL=fallback.`);
    process.exit(1);
  }
  console.log(`${label} TTS model confirmed: ${kept}`);
}

export const SPOKEN_STYLE = `
HOW YOU SOUND ON THE LINE
- Everything you write is spoken aloud as it is written. Never write bracketed stage directions or sound cues such as [laughs], [sighs] or [pause]; the voice would perform them. Use plain punctuation for pacing: a comma or a full stop for a breath, an ellipsis only for a real hesitation.
- Write numbers the way a broker says them. Money: "fifty USDC", "about two hundred and thirteen dollars a token". Round token quantities you read back to four significant figures ("about zero point zero two nine five AAPLc") unless the caller asks for the exact figure — the slip always carries the exact one.
- Say symbols as words: "percent", not "%"; "basis points", not "bps". Spell a ticker only when the caller asks, letter by letter.
- No markdown, lists or emoji — they are either read out or dropped.`;
