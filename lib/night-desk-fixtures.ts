export const NIGHT_DESK_FIXTURES = Object.freeze({
  disclosure: 'Experience study · fictional data · no trades',
  conversationDisclosure: 'Scripted conversation. Your microphone stays off.',
  instrument: { symbol: 'AAPLx', name: 'Apple xStock', underlying: 'Apple', network: 'Solana', identity: 'Illustrative instrument. No mint or venue connected.' },
  equity: { price: '$200.00', label: 'Equity reference', time: '25 SEP · 20:00 UTC', state: 'Last regular-session observation' },
  token: { price: '$202.00', label: 'Token observation', time: '25 SEP · 20:06 UTC', state: 'Later onchain observation' },
  comparison: { difference: '+1.00%', label: 'Difference from the earlier reference', caveat: 'Different moments. Not an executable spread.', disclosure: 'All prices and timestamps are fictional fixtures. Both prices use an illustrative matching unit basis.' },
  quotes: {
    '100': { amount: '100', spend: '100 USDC', receive: '0.490 AAPLx', id: 'STUDY-001', route: 'Illustrative Solana quotation' },
    '50': { amount: '50', spend: '50 USDC', receive: '0.245 AAPLx', id: 'STUDY-002', route: 'Illustrative Solana quotation' },
  },
  quoteDisclosure: 'Scripted output, not calculated from the reference prices. No live quote, fees, wallet, or execution.',
  lines: {
    arrival: 'A little distance from the market. A little room to think.',
    conversation: 'Claflin. Jesse speaking. Shall we look at Apple together?',
    evidence: 'Here is the distinction. The equity print is from 20:00. The token observation is six minutes later. We are looking at different moments, not a promise of profit.',
    quote: 'A hundred USDC. The example slip shows 0.490 Apple xStock units. Nothing has been placed. Take a look.',
    revised: 'Fifty, not a hundred. I have set the earlier slip aside. This one replaces it: 50 USDC for an illustrative 0.245 Apple xStock units.',
    filed: 'Kept in this study’s ledger. An example record, not a trade. You can bring it back to the light whenever you like.',
    cancelled: 'Of course. We can leave it there. Nothing was placed.',
    unsupported: 'This study can compare Apple, quote 100 USDC, change it to 50, or keep the example slip. Choose a line below, or type one of those instructions.',
    noQuote: 'There is no slip to keep yet. Shall we look at an example quotation?',
  },
  sampleLines: {
    compare: 'Show me Apple.',
    quote: 'Quote 100 USDC of Apple.',
    revise: 'Actually, make that 50 USDC.',
    file: 'Keep this example slip.',
    cancel: 'Leave it for now.',
  },
});

export type NightDeskStage = 'arrival' | 'conversation' | 'evidence' | 'quote' | 'revised' | 'filed';
export type NightDeskView = 'desk' | 'evidence' | 'review' | 'ledger';
export type NightDeskAmount = keyof typeof NIGHT_DESK_FIXTURES.quotes;
