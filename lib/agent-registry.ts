// ============================================
// Claflin Canonical Broker Registry
// ============================================
// Single source of truth that bridges all 4 layers of the architecture:
//   Layer 1 (Voice)      → ElevenLabs ConvAI agent ID + voice ID + system prompt
//   Layer 2 (Orchestr.)  → allowed skill types + specialty tags for routing
//   Layer 3 (Execution)  → Composio tool slugs
//   Layer 4 (Settlement) → ERC-8004 tokenId on Arbitrum
//
// How to use:
//   1. Run `npx tsx scripts/seed-elevenlabs.ts` to create brokers in ElevenLabs.
//   2. Add the returned agent IDs as ELEVENLABS_AGENT_<KEY> env vars.
//   3. Deploy ERC-8004 contracts, register each broker, add ERC8004_TOKEN_<KEY> env vars.
//   4. The webhook, skills framework, and reputation service all read from here.

import type { SkillType } from './types';
export type { SkillType };

export interface AgentRegistryEntry {
  /** Stable internal key */
  key: string;

  // ── Display ──────────────────────────────────────────────────────────────
  name: string;
  emoji: string;
  tagline: string;
  color: string; // Tailwind gradient classes

  // ── Layer 1: ElevenLabs Conversational AI ────────────────────────────────
  /** ElevenLabs ConvAI agent ID. Set via ELEVENLABS_AGENT_<KEY>. null = not seeded yet. */
  elevenLabsAgentId: string | null;
  /** ElevenLabs voice ID */
  voiceId: string;
  /** System prompt injected when creating/updating the ConvAI agent */
  systemPrompt: string;
  /** Tool names this broker declares in ElevenLabs (must match webhook's TOOL_CONFIG keys) */
  elevenLabsTools: string[];

  // ── Layer 2: Orchestrator routing ────────────────────────────────────────
  /** Specialty tags used by findAgentBySpecialty() in the webhook */
  specialties: string[];
  /** Skill types this broker is permitted to execute */
  allowedSkills: SkillType[];

  // ── Layer 3: Composio ────────────────────────────────────────────────────
  /** Composio action slugs this broker may call */
  composioTools: string[];

  // ── Layer 4: ERC-8004 on-chain identity ──────────────────────────────────
  /** tokenId in the ERC-8004 Identity Registry. Set via ERC8004_TOKEN_<KEY>. */
  tokenId: bigint | null;
}

// ============================================
// Claflin Brokers (Hetty is the first)
// ============================================

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {

  general_helper: {
    key: 'general_helper',
    name: 'Hetty',
    emoji: '🔔',
    tagline: 'Conservative broker for tokenized stocks — confirms every move',
    color: 'from-emerald-500 to-teal-600',
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_GENERAL_HELPER ?? null,
    voiceId: process.env.ELEVENLABS_VOICE_GENERAL_HELPER ?? 'pNInz6obpgDQGcFmaJgB', // Adam
    systemPrompt: `You are Hetty, the first Claflin broker. You help users research tokenized stocks, check market context, and capture trade intent — but you never execute real-money orders. You are conservative, independent, and obsessed with confirmation. Before you record any trade intent, briefly confirm: "I'm about to note a paper trade for [ticker] [quantity] [side] — shall I proceed?" Only proceed if the user clearly agrees. Be warm, efficient, and always narrate what you did. You can search the web for current market info when a user asks. You work on the Arbitrum network and USDC is the settlement currency.`,
    elevenLabsTools: ['search_web'],
    specialties: ['conservative', 'stocks', 'tokenized', 'general'],
    allowedSkills: ['research'],
    composioTools: ['WEB_SEARCH'],
    tokenId: process.env.ERC8004_TOKEN_GENERAL_HELPER
      ? BigInt(process.env.ERC8004_TOKEN_GENERAL_HELPER)
      : null,
  },

  solana_sage: {
    key: 'solana_sage',
    name: 'Tennie',
    emoji: '📊',
    tagline: 'Fundamental research and valuation before any trade',
    color: 'from-violet-500 to-purple-600',
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_SOLANA_SAGE ?? null,
    voiceId: process.env.ELEVENLABS_VOICE_SOLANA_SAGE ?? 'TxGEqnHWrfWFTfGW9XjX', // Josh
    systemPrompt: `You are Tennie, a Claflin research broker. You specialize in fundamentals, earnings, and valuation for tokenized equities and crypto-adjacent stocks. You can search the web for real-time data, but you do not execute trades. When a user wants a quote or research, call search_web immediately — never make up data. Be concise, precise, and explain results in plain language. Always confirm the ticker and quantity before recording any trade intent.`,
    elevenLabsTools: ['search_web'],
    specialties: ['research', 'fundamentals', 'earnings', 'valuation'],
    allowedSkills: ['research'],
    composioTools: ['WEB_SEARCH'],
    tokenId: process.env.ERC8004_TOKEN_SOLANA_SAGE
      ? BigInt(process.env.ERC8004_TOKEN_SOLANA_SAGE)
      : null,
  },

  code_reviewer: {
    key: 'code_reviewer',
    name: 'Woodhull',
    emoji: '🚀',
    tagline: 'Growth, momentum, and thematic baskets',
    color: 'from-blue-500 to-cyan-600',
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_CODE_REVIEWER ?? null,
    voiceId: process.env.ELEVENLABS_VOICE_CODE_REVIEWER ?? 'ErXwobaYiN019PkySvjV', // Antoni
    systemPrompt: `You are Woodhull, a Claflin momentum broker. You focus on growth stocks, thematic baskets, and catalyst-driven opportunities. You can search the web for current prices, news, and sentiment. You do not execute real-money trades; you capture and confirm trade intent. Be energetic but disciplined: always confirm ticker, side, and size before recording anything.`,
    elevenLabsTools: ['search_web'],
    specialties: ['momentum', 'growth', 'thematic', 'catalysts'],
    allowedSkills: ['research'],
    composioTools: ['WEB_SEARCH'],
    tokenId: process.env.ERC8004_TOKEN_CODE_REVIEWER
      ? BigInt(process.env.ERC8004_TOKEN_CODE_REVIEWER)
      : null,
  },

  tour_master: {
    key: 'tour_master',
    name: 'Claflin Concierge',
    emoji: '🎧',
    tagline: 'Desk routing, account questions, and getting you to the right broker',
    color: 'from-orange-500 to-amber-600',
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_TOUR_MASTER ?? null,
    voiceId: process.env.ELEVENLABS_VOICE_TOUR_MASTER ?? '21m00Tcm4TlvDq8ikWAM', // Rachel
    systemPrompt: `You are the Claflin Concierge, a helpful desk assistant. You answer account and platform questions, explain how Claflin works, and route users to the right broker (Hetty for conservative execution, Tennie for research, Woodhull for momentum). You can search the web for general information. You do not handle trades or payments. Be warm, clear, and brief.`,
    elevenLabsTools: ['search_web'],
    specialties: ['concierge', 'general', 'routing', 'help'],
    allowedSkills: ['research'],
    composioTools: ['WEB_SEARCH'],
    tokenId: process.env.ERC8004_TOKEN_TOUR_MASTER
      ? BigInt(process.env.ERC8004_TOKEN_TOUR_MASTER)
      : null,
  },

  web_researcher: {
    key: 'web_researcher',
    name: 'Baruch',
    emoji: '📰',
    tagline: 'Macro, rates, and real-time market news',
    color: 'from-red-500 to-rose-600',
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_WEB_RESEARCHER ?? null,
    voiceId: process.env.ELEVENLABS_VOICE_WEB_RESEARCHER ?? 'pqHfZKP75CvOlQylNhV4', // Steve
    systemPrompt: `You are Baruch, a Claflin macro broker. You track rates, central-bank policy, macro trends, and breaking market news. You can search the web for current information and synthesize it for users. You do not execute trades; you provide context and research. Cite your sources when possible.`,
    elevenLabsTools: ['search_web'],
    specialties: ['macro', 'news', 'rates', 'markets'],
    allowedSkills: ['research'],
    composioTools: ['WEB_SEARCH'],
    tokenId: process.env.ERC8004_TOKEN_WEB_RESEARCHER
      ? BigInt(process.env.ERC8004_TOKEN_WEB_RESEARCHER)
      : null,
  },

  medical_advisor: {
    key: 'medical_advisor',
    name: 'Marks',
    emoji: '🛡️',
    tagline: 'Risk, position sizing, and portfolio health checks',
    color: 'from-cyan-500 to-teal-600',
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_MEDICAL_ADVISOR ?? null,
    voiceId: process.env.ELEVENLABS_VOICE_MEDICAL_ADVISOR ?? 'EXAVITQu4vr4xnSDxMaL', // Sarah
    systemPrompt: `You are Marks, a Claflin risk broker. You help users think through position sizing, concentration risk, and portfolio health. You can search the web for market context. You do not execute trades. Be calm, clear, and protective — your job is to help the user avoid overextending.`,
    elevenLabsTools: ['search_web'],
    specialties: ['risk', 'position-sizing', 'portfolio-health'],
    allowedSkills: ['research'],
    composioTools: ['WEB_SEARCH'],
    tokenId: process.env.ERC8004_TOKEN_MEDICAL_ADVISOR
      ? BigInt(process.env.ERC8004_TOKEN_MEDICAL_ADVISOR)
      : null,
  },

  // ── Voice Router (not a user-facing broker — used for intent routing) ──────
  voice_router: {
    key: 'voice_router',
    name: 'Claflin Router',
    emoji: '📡',
    tagline: 'Voice intake and routing',
    color: 'from-cyan-500 to-blue-600',
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_VOICE_ROUTER ?? null,
    voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam
    systemPrompt: 'Internal router — not user-facing.',
    elevenLabsTools: ['route_to_agent'],
    specialties: ['routing'],
    allowedSkills: ['research'],
    composioTools: [],
    tokenId: null,
  },
};

// ============================================
// Registry Lookup Helpers
// ============================================

/** Find entry by ElevenLabs conversational agent ID */
export function findByElevenLabsId(agentId: string): AgentRegistryEntry | null {
  return Object.values(AGENT_REGISTRY).find(e => e.elevenLabsAgentId === agentId) ?? null;
}

/** Find entry by ERC-8004 tokenId */
export function findByTokenId(tokenId: bigint): AgentRegistryEntry | null {
  return Object.values(AGENT_REGISTRY).find(e => e.tokenId === tokenId) ?? null;
}

/**
 * Find entry by specialty string — exact then fuzzy.
 * Used in the webhook's Agent Discovery step.
 */
export function findBySpecialty(specialty: string): AgentRegistryEntry | null {
  const lower = specialty.toLowerCase();
  return (
    Object.values(AGENT_REGISTRY).find(e =>
      e.specialties.some(s => s.toLowerCase() === lower)
    ) ??
    Object.values(AGENT_REGISTRY).find(e =>
      e.specialties.some(s => lower.includes(s) || s.includes(lower))
    ) ??
    AGENT_REGISTRY['general_helper'] // ultimate fallback
  );
}

/** Check whether an agent is allowed to run a given skill type */
export function agentCanUseSkill(agentKey: string, skill: SkillType): boolean {
  return AGENT_REGISTRY[agentKey]?.allowedSkills.includes(skill) ?? false;
}

/**
 * Return a machine-readable status summary of the registry.
 * Surfaced at GET /api/sdk/health for diagnostics.
 */
export function getRegistryStatus() {
  return Object.values(AGENT_REGISTRY).map(e => ({
    key: e.key,
    name: e.name,
    emoji: e.emoji,
    elevenLabsConfigured: !!e.elevenLabsAgentId,
    elevenLabsAgentId: e.elevenLabsAgentId,
    onChainRegistered: e.tokenId !== null,
    tokenId: e.tokenId?.toString() ?? null,
    allowedSkills: e.allowedSkills,
    specialties: e.specialties,
  }));
}
