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
      'Educational perspective only. The Solana desk is not open for quotation or recording. This lens never loads a ticket and never implies a live path.',
    sources: [
      { label: 'Reminiscences of a Stock Operator (Lefèvre, 1923)', note: 'Literary portrait of tape reading and waiting — not executable advice.' },
    ],
    revisedAt: '2026-09-10',
  },
  isabel: {
    deskId: 'isabel',
    name: 'Isabel',
    lens: 'Enterprise and infrastructure',
    questions: [
      'What does the enterprise own that would still be there after a bad quarter?',
      'Which claims are timetable, and which are roadbed?',
      'Who must keep the rails working for this product to mean what it says?',
    ],
    boundary:
      'Educational perspective only. Isabel Benham is remembered as a railroad and credit analyst — not as the first woman with an NYSE seat (that was Muriel Siebert, 1967). This desk is not open for quotation.',
    sources: [
      {
        label: 'Harvard Baker Library — Muriel Siebert NYSE seat, 1967',
        note: 'Corrects a common conflation: Benham’s craft was analysis; Siebert bought the seat.',
      },
    ],
    revisedAt: '2026-09-10',
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
  if (/\b(isabel|benham|infrastructure|enterprise|annual letter|roadbed)\b/.test(q)) return METHODS.isabel;
  if (/\b(jay|cooke|arbitrum|rails|clearing|distribution)\b/.test(q)) return METHODS.arbitrum;
  if (/\b(how .+ (think|examine|look)|examination|method|lens)\b/.test(q)) return METHODS.hetty;
  return undefined;
}

export function brokerMethodSpokenLine(method: BrokerExaminationMethod): string {
  const questions = method.questions.map((item, index) => `${index + 1}. ${item}`).join(' ');
  return `${method.name}'s lens is ${method.lens}. Questions she or he would ask: ${questions} ${method.boundary}`;
}
