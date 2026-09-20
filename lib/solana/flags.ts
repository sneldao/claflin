/**
 * Jesse desk release flags. Same shape as LIVE_EXECUTION_ENABLED: a public
 * Next env that the capability table and UI both read. Default open; set
 * NEXT_PUBLIC_JESSE_PAPER_ENABLED=false to close the seated desk.
 */
export const JESSE_PAPER_ENABLED = process.env.NEXT_PUBLIC_JESSE_PAPER_ENABLED !== 'false';
