/**
 * Structured “ways of examining a question” for each specialist desk.
 *
 * These are educational perspectives — clearly separated from executable desk
 * access. A closed room may show how its broker would look at a problem; that
 * never quotes, files, or signs.
 */

import type { HouseDeskId } from '../house';

export type BrokerExaminationMethod = {
  deskId: HouseDeskId;
  name: string;
  lens: string;
  questions: readonly string[];
  /** What this method deliberately does not claim. */
  boundary: string;
  sources: readonly { label: string; note?: string }[];
  revisedAt: string;
};

const METHODS: Readonly<Record<HouseDeskId, BrokerExaminationMethod>> = {
  hetty: {
    deskId: 'hetty',
    name: 'Hetty',
    lens: 'Liquidity and downside',
    questions: [
      'If this is wrong, what do I still hold, and can I reach it?',
      'What must remain true for the position to survive a panic?',
      'Am I paying for speed I do not need?',
    ],
    boundary:
      'Educational perspective only. On the open Base desk, Hetty may draft and request estimates; she never signs. This lens does not assess your finances or recommend a trade.',
    sources: [
      { label: 'House approach — independent judgment, capital preservation', note: 'From the open desk plate; not a biographical claim about every historical act.' },
    ],
    revisedAt: '2026-09-10',
  },
  jesse: {
    deskId: 'jesse',
    name: 'Jesse',
    lens: 'Timing and uncertainty',
    questions: [
      'What would change my mind before anything else changes?',
      'Am I reading a print that has already aged?',
      'Is standing aside a complete decision?',
    ],
    boundary:
      'Educational perspective only. On the open Solana desk, Jesse may draft, estimate, and file paper; he never signs without your wallet. This lens never loads a ticket and never implies a live path.',
    sources: [
      { label: 'Reminiscences of a Stock Operator (Lefèvre, 1923)', note: 'Literary portrait of tape reading and waiting — not executable advice.' },
    ],
    revisedAt: '2026-09-10',
  },
  tennie: {
    deskId: 'tennie',
    name: 'Tennie',
    lens: 'Access and the open book',
    questions: [
      'Who does this market let in, and who is still waiting at the door?',
      'Whose orders are being refused, and what does that leave unpriced?',
      'Can the client see the book, or only the broker’s word for it?',
    ],
    boundary:
      'Educational perspective only. Tennie C. Claflin is remembered for running Wall Street’s first woman-led brokerage — not for holding a seat (Muriel Siebert bought the first, in 1967). Tennie’s desk is paper-only; this lens never loads a ticket.',
    sources: [
      {
        label: 'Harvard Baker Library — Muriel Siebert NYSE seat, 1967',
        note: 'Corrects a common conflation: Claflin’s house ran the counter; Siebert bought the seat.',
      },
    ],
    revisedAt: '2026-10-11',
  },
  halley: {
    deskId: 'halley',
    name: 'Halley',
    lens: 'Pricing what has no history',
    questions: [
      'What table would I build before quoting a price no one has paid yet?',
      'Which part of this curve is arithmetic, and which is guess?',
      'If the launch works, what still owes me an explanation later?',
    ],
    boundary:
      'Educational perspective only. The Meteora launch desk prices new exposure tokens on paper; a projected path is not an order, and Halley never signs. Exposure is not share ownership.',
    sources: [
      { label: 'Halley’s annuity life table (1693)', note: 'The first actuarial pricing of a product with no observable market — the desk’s working parallel.' },
    ],
    revisedAt: '2026-10-02',
  },
  arbitrum: {
    deskId: 'arbitrum',
    name: 'Jay',
    lens: 'Distribution and settlement rails',
    questions: [
      'Who has to clear this after the trade is spoken?',
      'Is the network the product, or only the story about the product?',
      'What settles one transaction at a time before trust is claimed?',
    ],
    boundary:
      'Educational perspective only. The Arbitrum desk is planned. Rails talk is not a bridge, a deposit instruction, or an execution path.',
    sources: [
      { label: 'House approach — rails and distribution', note: 'Atmospheric parallel to Cooke’s distribution networks; not a live Arbitrum adapter.' },
    ],
    revisedAt: '2026-09-10',
  },
};

export function getBrokerMethod(deskId: HouseDeskId): BrokerExaminationMethod {
  return METHODS[deskId];
}

export function listBrokerMethods(): readonly BrokerExaminationMethod[] {
  return Object.values(METHODS);
}

/** Resolve a spoken ask about how a broker examines a question. */
export function resolveBrokerMethod(query: string): BrokerExaminationMethod | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  if (/\b(hetty|green|liquidity|downside|cash)\b/.test(q)) return METHODS.hetty;
  if (/\b(jesse|livermore|timing|uncertainty|tape reading)\b/.test(q)) return METHODS.jesse;
  if (/\b(tennie|claflin|access|open book|counter|woodhull)\b/.test(q)) return METHODS.tennie;
  if (/\b(halley|edmond|comet|launch|issuance|unpriced)\b/.test(q)) return METHODS.halley;
  if (/\b(jay|cooke|arbitrum|rails|clearing|distribution)\b/.test(q)) return METHODS.arbitrum;
  if (/\b(how .+ (think|examine|look)|examination|method|lens)\b/.test(q)) return METHODS.hetty;
  return undefined;
}

export function brokerMethodSpokenLine(method: BrokerExaminationMethod): string {
  const questions = method.questions.map((item, index) => `${index + 1}. ${item}`).join(' ');
  return `${method.name}'s lens is ${method.lens}. Questions she or he would ask: ${questions} ${method.boundary}`;
}
