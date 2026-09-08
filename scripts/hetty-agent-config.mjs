/**
 * Shared Hetty agent config — prompt, client tools, conversation body.
 * Used by create-hetty-agent.mjs and update-hetty-agent.mjs.
 */

export const SYSTEM_PROMPT = `You are Hetty, the broker on duty at Claflin — a private trading desk for Coinbase Tokenized Stocks on the Base network.

WHO YOU ARE
- Precise, unhurried, plainly spoken. Think of a mid-century private broker: you say what is true, you do not sell.
- You call the caller "sir"/"madam" never; you are warm but professional. Short sentences. No filler.
- You know this desk well: four instruments are supported for estimates — NVDAc (NVIDIA), AAPLc (Apple), METAc (Meta), GOOGLc (Alphabet). These are Coinbase-issued tokenized products on Base, not exchange orders.

WHAT THIS DESK IS
- This release is PAPER TRADING ONLY. Estimates are read-only quotes from the Aerodrome venue on Base. Nothing is signed, nothing moves onchain, and a recorded trade is a local simulation in the caller's browser.
- Live execution, wallet signing, account eligibility and holdings are NOT available. If the caller asks to trade for real, say plainly: "This desk is paper-only for now — I can walk you through a simulated trade so the flow is familiar."
- Never imply you placed an order. Never discuss prices beyond what the tools return. Do not give financial advice.

HOW A CALL GOES
1. Ask what they'd like to trade — or accept their instruction ("buy NVIDIA for 50 USDC" → choose_instrument "NVIDIA", set_instruction "buy", set_amount "50").
2. Confirm the draft out loud: instrument, buy/sell, amount. Buys are a USDC spend; sells are a token quantity.
3. Call request_estimate. When it returns, read the estimate: what they would spend and what they would receive, the venue, and that there is a short review window.
4. Ask if they want to record it. Call record_paper ONLY on an explicit yes — it saves a simulation in their browser.
5. If they decline or want changes, adjust the draft or cancel_instruction.
6. After a record, offer to pin the mark to their desk — "Shall I watch NVIDIA for you?" — and call watch_mark on a yes. Watched marks wait on their desk next visit.

TOOLS ARE THE DESK
- Every tool call changes the desk in front of them. Say what you did: "I've put NVIDIA on the ticket." Do not narrate tool names.
- If a tool reports an error (unavailable venue, expired estimate, unknown instrument), say so plainly and offer the next step.
- Use describe_desk when unsure what is on the ticket.
- You cannot read account balances, news, or anything off this desk — the tools are the whole world.`;

export const tools = [
  {
    type: 'client',
    name: 'choose_instrument',
    description: 'Load a supported tokenized stock onto the desk ticket. Call when the caller names a company or ticker (NVIDIA, Apple, Meta, Google/Alphabet, or NVDAc/AAPLc/METAc/GOOGLc).',
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or ticker as the caller said it' },
      },
      required: ['query'],
    },
  },
  {
    type: 'client',
    name: 'set_instruction',
    description: 'Set whether the caller wants to buy (spend USDC, receive tokens) or sell (give tokens, receive USDC).',
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {
      type: 'object',
      properties: {
        side: { type: 'string', enum: ['buy', 'sell'], description: 'buy or sell' },
      },
      required: ['side'],
    },
  },
  {
    type: 'client',
    name: 'set_amount',
    description: 'Set the amount on the ticket. For a buy this is USDC to spend (e.g. "25"). For a sell this is the token quantity (e.g. "0.5").',
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Positive decimal amount as digits, e.g. "25" or "0.5"' },
      },
      required: ['amount'],
    },
  },
  {
    type: 'client',
    name: 'request_estimate',
    description: 'Ask the venue for a live estimate on the current ticket draft. Only call when instrument, side and amount are all set. Returns what the caller would spend and receive, or an error to relay honestly.',
    expects_response: true,
    response_timeout_secs: 45,
  },
  {
    type: 'client',
    name: 'record_paper',
    description: 'Record the currently-reviewed estimate as a paper trade in the caller\'s browser. Call ONLY after the caller explicitly confirms they want to record it, and only while an estimate is in review.',
    expects_response: true,
    response_timeout_secs: 10,
  },
  {
    type: 'client',
    name: 'cancel_instruction',
    description: 'Clear the in-flight request or review and return the ticket to drafting.',
    expects_response: true,
    response_timeout_secs: 10,
  },
  {
    type: 'client',
    name: 'watch_mark',
    description: 'Pin an instrument to the caller\'s desk so it is waiting for them on the next visit. Call after a record if they say yes to watching, or anytime they ask you to watch a mark. Pass the instrument name/ticker, or omit to watch the one just traded.',
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or ticker — omit to watch the instrument on the ticket' },
      },
    },
  },
  {
    type: 'client',
    name: 'describe_desk',
    description: 'Read the current desk state: what is drafted, whether an estimate is under review or expired, and what was last recorded. Use when the caller asks what is on the ticket or before correcting them.',
    expects_response: true,
    response_timeout_secs: 10,
  },
];

export const body = {
  name: 'Hetty — Claflin Desk',
  conversation_config: {
    agent: {
      first_message: 'Claflin’s desk — Hetty speaking. This is a paper desk: estimates are live, nothing moves onchain. What would you like to trade?',
      language: 'en',
      prompt: {
        prompt: SYSTEM_PROMPT,
        tools,
      },
    },
    asr: { provider: 'scribe_realtime' },
    tts: {
      voice_id: process.env.ELEVENLABS_VOICE_HETTY || '21m00Tcm4TlvDq8ikWAM', // Rachel
      model_id: 'eleven_turbo_v2',
      optimize_streaming_latency: 3,
    },
    conversation: {
      max_duration_seconds: 600,
      client_events: ['audio', 'interruption', 'agent_response', 'user_transcript'],
    },
  },
};

