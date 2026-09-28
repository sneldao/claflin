/**
 * Shared voice settings for the house brokers (Hetty, Jesse).
 *
 * TTS model: Eleven v4 Turbo — the v4 real-time variant built for agents
 * (~100 ms median inference). It replaces eleven_turbo_v2, which ElevenLabs
 * now lists as deprecated (suggested replacement: eleven_flash_v2).
 * Override with ELEVENLABS_TTS_MODEL (e.g. eleven_flash_v2) to fall back
 * without a code change if an agent update is refused or a voice regresses.
 * Docs: https://elevenlabs.io/docs/models
 *       https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4
 *
 * v4 has no Style/Speed sliders and no SSML; it treats bracketed text such
 * as [laughs] as delivery or sound-effect direction. The brokers' replies are
 * written by an LLM in real time, so the prompt forbids brackets and asks for
 * numbers written the way they should be said.
 */

export const AGENT_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v4_turbo';

export const SPOKEN_STYLE = `
HOW YOU SOUND ON THE LINE
- Everything you write is spoken aloud as it is written. Never write bracketed stage directions or sound cues such as [laughs], [sighs] or [pause]; the voice would perform them. Use plain punctuation for pacing: a comma or a full stop for a breath, an ellipsis only for a real hesitation.
- Write numbers the way a broker says them. Money: "fifty USDC", "about two hundred and thirteen dollars a token". Round token quantities you read back to four significant figures ("about zero point zero two nine five AAPLc") unless the caller asks for the exact figure — the slip always carries the exact one.
- Say symbols as words: "percent", not "%"; "basis points", not "bps". Spell a ticker only when the caller asks, letter by letter.
- No markdown, lists or emoji — they are either read out or dropped.`;
