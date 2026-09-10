/**
 * Versioned, sourced education for decision points on the desk.
 *
 * These topics answer a question the client already has — what the tape is,
 * what a tokenized stock is, what paper means, what travels with an instruction.
 * They are never a tour, never a prerequisite, and never grant approval.
 *
 * Content types are explicit so a historical fact is never mistaken for a
 * house aphorism, and a house interpretation is never mistaken for advice.
 */

export const EDUCATION_CATALOG_VERSION = 1 as const;

export type EducationContentType =
  | 'historical_fact'
  | 'documented_quotation'
  | 'house_interpretation'
  | 'illustrative_scenario';

export type EducationReviewStatus = 'draft' | 'reviewed' | 'needs_revision';

export type EducationSource = {
  label: string;
  /** Stable public URL when one exists; omitted for print-only sources. */
  url?: string;
  note?: string;
};

export type EducationTopicId =
  | 'the-tape'
  | 'the-certificate'
  | 'the-bucket-shop'
  | 'the-travelling-instruction'
  | 'participation';

export type EducationTopic = {
  id: EducationTopicId;
  title: string;
  /** One-line term used by DeskTerm and voice. */
  term: string;
  era: string;
  type: EducationContentType;
  reviewStatus: EducationReviewStatus;
  revisedAt: string; // ISO date
  /** Short explanation first — shown inline at the decision point. */
  shortExplanation: string;
  /** Optional deeper reading; never required to trade. */
  deeperReading: string;
  sources: readonly EducationSource[];
  /** Practice surface reached from this topic, if any. */
  practicePath?: string;
  /** When true, the topic is optional house context — not a decision-point lesson. */
  optionalHouseDocument?: boolean;
};

const TOPICS: readonly EducationTopic[] = [
  {
    id: 'the-tape',
    title: 'The tape',
    term: 'tape',
    era: '1867–present · ticker to reference feed',
    type: 'house_interpretation',
    reviewStatus: 'reviewed',
    revisedAt: '2026-09-10',
    shortExplanation:
      'The tape shows what was observed — a reference print. Your estimate is a separate, time-limited answer from the venue. One is context; the other is what you review.',
    deeperReading:
      'A running ticker once printed last sales as they happened on the floor. That print was never a standing offer to you: it was a record of what someone else did. On this desk the house tape carries Chainlink reference marks on Base — indicative valuations with freshness labels. The estimate you request comes from Aerodrome and expires. Confusing the two is how a delayed print becomes a false sense of permission. Reading the tape never loads an order; reviewing an estimate never turns a reference into a fill.',
    sources: [
      {
        label: 'Smithsonian — stock ticker history',
        url: 'https://americanhistory.si.edu/collections/object-groups/stock-tickers',
        note: 'Context for the historical tape as a delayed public print, not a personal quote.',
      },
      {
        label: 'Claflin desk — indicative marks vs venue estimate',
        note: 'Product boundary: Chainlink reference on the tape; Aerodrome estimate on the slip.',
      },
    ],
    practicePath: '/practice/delayed-tape',
  },
  {
    id: 'the-certificate',
    title: 'The certificate',
    term: 'certificate',
    era: 'paper share · tokenized product',
    type: 'house_interpretation',
    reviewStatus: 'reviewed',
    revisedAt: '2026-09-10',
    shortExplanation:
      'A Coinbase tokenized stock on Base is a blockchain token. It is not a paper share certificate, and this dossier is not proof of ownership of the underlying company.',
    deeperReading:
      'Historically a stock certificate named the holder and the shares. Tokenized products recreate economic exposure through an issuer’s structure on a chain — here, Coinbase-issued tokens on Base. What you may hold after a live trade is the token; legal rights, redemption, and restrictions follow the issuer’s terms and your eligibility, not the decorative language of a desk dossier. Paper mode files a simulation only. Always separate three ideas: the underlying company’s equity, the tokenized product’s terms, and Claflin’s record of what you reviewed.',
    sources: [
      {
        label: 'Coinbase — tokenized equities overview',
        url: 'https://www.coinbase.com/tokenized-equities',
        note: 'Issuer product framing; confirm current terms before relying on any summary.',
      },
      {
        label: 'Claflin product dossier copy',
        note: 'In-product label: PRODUCT INFORMATION · NOT PROOF OF OWNERSHIP.',
      },
    ],
  },
  {
    id: 'the-bucket-shop',
    title: 'The bucket shop',
    term: 'bucket shop',
    era: 'c. 1870–1920s · wager parlors',
    type: 'historical_fact',
    reviewStatus: 'reviewed',
    revisedAt: '2026-09-10',
    shortExplanation:
      'A bucket shop took your wager on prices without buying the stock. Paper trading here is a labelled simulation for learning the desk — not a wager parlor, and not ownership.',
    deeperReading:
      'Bucket shops quoted the tape and settled differences in cash against the customer without executing on an exchange. They taught many traders the look of a market while withholding the asset. Claflin’s paper mode is the opposite posture: it says simulation aloud, stores a local record of the estimate you reviewed, and does not move funds. Live mode, when enabled and permitted, is a different act — a real swap of tokens. Do not treat a paper receipt as a position, a wager ticket, or evidence that anything settled onchain.',
    sources: [
      {
        label: 'Encyclopedia Britannica — bucket shop',
        url: 'https://www.britannica.com/money/bucket-shop',
        note: 'Definition of historical bucket shops as off-exchange wager venues.',
      },
      {
        label: 'Reminiscences of a Stock Operator (Edwin Lefèvre, 1923)',
        note: 'Livermore’s early education in bucket shops is literary testimony, not a trading manual.',
      },
    ],
  },
  {
    id: 'the-travelling-instruction',
    title: 'The travelling instruction',
    term: 'slippage',
    era: 'order travel · venue execution',
    type: 'house_interpretation',
    reviewStatus: 'reviewed',
    revisedAt: '2026-09-10',
    shortExplanation:
      'Slippage is the gap between a quoted price and what a real order fills at while your instruction travels. Paper estimates exclude it; live execution does not.',
    deeperReading:
      'An estimate is true only for a short window, against a pool state at a recent block. Between your review and a signed submission the market can move, gas can change, and the router may deliver less (or refuse). That uncertainty is why estimates expire, why live mode needs an explicit Execute, and why a paper record preserves the terms you saw — not a promise of the same fill later. Refreshing after expiry replaces the terms; it does not carry forward old approval.',
    sources: [
      {
        label: 'Claflin estimate assumptions (paper vs live)',
        note: 'Paper uses quoted output without additional slippage or gas; live pays pool fees, slippage and gas from the wallet.',
      },
    ],
  },
  {
    id: 'participation',
    title: 'Participation and access',
    term: 'the house',
    era: '1870 · Woodhull, Claflin & Co.',
    type: 'historical_fact',
    reviewStatus: 'reviewed',
    revisedAt: '2026-09-10',
    optionalHouseDocument: true,
    shortExplanation:
      'Victoria Woodhull and Tennessee Claflin opened a Wall Street brokerage in 1870 — an early public claim that women belonged in the room where capital was discussed.',
    deeperReading:
      'Woodhull, Claflin & Co. is remembered less for a trading method than for forcing the question of who may stand at a desk. This product borrows the house name as atmosphere and aspiration, not as a literal firm, a claim of inheritance, or a compulsory origin story. Reading this note never unlocks a market, never verifies eligibility, and never replaces the product terms on a slip. History here is optional context about participation and access.',
    sources: [
      {
        label: 'Library of Congress — Victoria Woodhull',
        url: 'https://www.loc.gov/item/today-in-history/september-23/',
        note: 'Public biographical framing; verify details against primary sources for scholarly use.',
      },
      {
        label: 'Harvard Baker Library — Muriel Siebert NYSE seat, 1967',
        url: 'https://www.library.hbs.edu/special-collections-and-archives/exhibits/muriel-siebert/',
        note: 'Exhibit on Siebert’s 1967 seat purchase — distinct from Isabel Benham’s career as a railroad analyst.',
      },
    ],
  },
];

const BY_ID = Object.fromEntries(TOPICS.map(topic => [topic.id, topic])) as Record<
  EducationTopicId,
  EducationTopic
>;

export function listEducationTopics(options?: { includeOptionalHouse?: boolean }): readonly EducationTopic[] {
  const includeOptional = options?.includeOptionalHouse ?? false;
  return TOPICS.filter(topic => includeOptional || !topic.optionalHouseDocument);
}

export function getEducationTopic(id: string): EducationTopic | undefined {
  return BY_ID[id as EducationTopicId];
}

/** Resolve a caller phrase or term to a reviewed topic. */
export function resolveEducationTopic(query: string): EducationTopic | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const direct = getEducationTopic(q) || getEducationTopic(q.replace(/\s+/g, '-'));
  if (direct) return direct;
  const aliases: Record<string, EducationTopicId> = {
    tape: 'the-tape',
    ticker: 'the-tape',
    reference: 'the-tape',
    mark: 'the-tape',
    certificate: 'the-certificate',
    dossier: 'the-certificate',
    token: 'the-certificate',
    ownership: 'the-certificate',
    'bucket shop': 'the-bucket-shop',
    bucket: 'the-bucket-shop',
    paper: 'the-bucket-shop',
    simulation: 'the-bucket-shop',
    slippage: 'the-travelling-instruction',
    travelling: 'the-travelling-instruction',
    traveling: 'the-travelling-instruction',
    instruction: 'the-travelling-instruction',
    expiry: 'the-travelling-instruction',
    woodhull: 'participation',
    claflin: 'participation',
    participation: 'participation',
    access: 'participation',
    seat: 'participation',
  };
  for (const [alias, id] of Object.entries(aliases)) {
    if (q === alias || q.includes(alias)) return BY_ID[id];
  }
  return TOPICS.find(topic =>
    topic.term.toLowerCase() === q ||
    topic.title.toLowerCase() === q ||
    topic.id === q
  );
}

export function educationTopicSpokenLine(topic: EducationTopic): string {
  const practice = topic.practicePath
    ? ' A short labelled practice exercise is available from the desk explanation — never from a live wallet path.'
    : '';
  return `${topic.title}: ${topic.shortExplanation} This is reviewed house material (${topic.type.replace(/_/g, ' ')}), not advice.${practice}`;
}

/**
 * Bridge from a house “word of the trade” (desk notes) to the sourced catalog.
 * Only terms with a real decision-point topic are mapped — atmosphere stays atmosphere.
 */
export function topicIdForHouseTerm(term: string | undefined | null): EducationTopicId | undefined {
  if (!term) return undefined;
  const key = term.trim().toLowerCase();
  const map: Record<string, EducationTopicId> = {
    tape: 'the-tape',
    quotation: 'the-tape',
    'bucket shop': 'the-bucket-shop',
    seat: 'participation',
  };
  return map[key];
}

