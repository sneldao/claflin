/**
 * "Questions callers ask" — the foyer's straight answers. Each answer must be
 * true of this build: sources are the product facts in lib/desk/board.ts,
 * the capability flags in lib/house.ts, and docs/AUTH_AND_ACCESS.md. When a
 * fact changes, change it here and in its owning doc together.
 */
import { DESK_CAPABILITIES, HOUSE_DESKS, isOpenDesk } from '../house';

export interface FoyerAnswer {
  id: string;
  question: string;
  answer: string;
}

const liveSomewhere = HOUSE_DESKS.some(desk => isOpenDesk(desk.id) && DESK_CAPABILITIES[desk.id].live);

export const FOYER_ANSWERS: readonly FoyerAnswer[] = Object.freeze([
  {
    id: 'real-share',
    question: 'Is this a real share?',
    answer: 'No. It is a token that tracks one. Coinbase tokens on Base are a claim on a share held 1:1 by a custodian; xStocks on Solana are tracker certificates backed 1:1, with no voting rights. Open any row on the board for the exact terms and the issuer’s own document.',
  },
  {
    id: 'us',
    question: 'Can I use this from the US?',
    answer: 'Not for live trades. Both issuers offer these tokens to non-US persons only, and the chain does not check where you are. Paper records are open to anyone because nothing is bought.',
  },
  {
    id: 'cost',
    question: 'What does it cost?',
    answer: liveSomewhere
      ? 'Ringing a desk and filing paper records is free, and Claflin adds no fee of its own. A live trade pays the venue’s price, including any venue or router fee and the slippage limit shown on the slip before you sign, plus network gas (ETH on Base, SOL on Solana).'
      : 'Ringing a desk and filing paper records is free, and Claflin adds no fee. Nothing is bought, so there is nothing to pay.',
  },
  {
    id: 'drift',
    question: 'What if the token drifts from the stock?',
    answer: 'It can, especially while the exchange is closed and the token keeps trading. Where a desk can see the stock’s reference price, the board shows the gap in basis points. The slip always quotes the venue you would actually trade on, not the stock.',
  },
  {
    id: 'without-me',
    question: 'Can the desk trade without me?',
    answer: 'No. No signature, no trade. The broker can write the slip, price it and file paper when you say so. Only your own wallet signature moves money, and Claflin never holds your keys or funds.',
  },
  {
    id: 'record',
    question: 'Where does my record live?',
    answer: 'In this browser. If you sign in, paper records are also copied to your account; deleting one on the desk does not remove the account copy.',
  },
  {
    id: 'person',
    question: 'Am I talking to a person?',
    answer: 'No. Hetty and Jesse are AI brokers, characters inspired by historical figures, not the people themselves. The microphone is used only while you hold the line or are on a call.',
  },
]);
