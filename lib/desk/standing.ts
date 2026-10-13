/**
 * What the standing notice says about live capability, as data.
 *
 * The notice makes factual claims about a deployment — which desks can settle
 * for real money, and under what caps. Those claims must never be hand-typed
 * twice: if a cap changes in `live-prepare.ts` and the page still says 250,
 * the page is a lie. So the page renders these lines and nothing else, and
 * the tests assert against this module directly.
 */

import { DESK_CAPABILITIES } from '@/lib/house';
import { JESSE_LIVE_LIMITS } from '@/lib/solana/live-prepare';

export interface StandingCapability {
  /** Desks that can settle live on this build, by short name. */
  liveDesks: string[];
  /** Desks explicitly named paper-only on this page, in copy order. */
  paperDesks: string[];
  /** One line naming the per-order caps for a live desk, or null if paper. */
  jesseCaps: string | null;
  /** The foot line — what a reader should take away. */
  verdict: string;
}

export function standingCapability(): StandingCapability {
  const hettyLive = DESK_CAPABILITIES.hetty.live;
  const jesseLive = DESK_CAPABILITIES.jesse.live;

  const liveDesks = [
    ...(hettyLive ? ['Hetty'] : []),
    ...(jesseLive ? ['Jesse'] : []),
  ];

  return {
    liveDesks,
    paperDesks: [
      ...(hettyLive ? [] : ['Hetty (Base)']),
      ...(jesseLive ? [] : ['Jesse (Solana)']),
      'Tennie (Robinhood Chain)',
      'Halley (Meteora launches)',
    ],
    jesseCaps: jesseLive
      ? `capped at ${JESSE_LIVE_LIMITS.buyMax} USDC per buy and ${JESSE_LIVE_LIMITS.sellMax} tokens per sell`
      : null,
    verdict: liveDesks.length > 0 ? `${liveDesks.join(' and ')} live` : 'none — paper only',
  };
}

/** Copy that must stay on the notice whatever the deployment says. */
export const STANDING_UNANSWERED: readonly string[] = [
  'Whether routing securities orders makes Claflin a regulated broker-dealer.',
  'Whether the eligibility rules are correct for your jurisdiction.',
  'Whether any venue will accept an account from you.',
];

/**
 * The issuer-terms sentence. Every instrument here is distributed outside the
 * US; this is not Claflin's policy choice but the issuers' distribution track,
 * so it is stated as theirs and never as a determination about the visitor.
 */
export const STANDING_ELIGIBILITY = {
  headline: 'not offered to US persons',
  mechanism: 'self-declaration',
  standing: 'not a legal determination',
} as const;