/**
 * Isabel desk release flags. Same shape as Jesse's: a public Next env that
 * the capability table and UI both read. Default open; set
 * NEXT_PUBLIC_ISABEL_PAPER_ENABLED=false to close the seated desk.
 *
 * There is deliberately no Isabel live flag — the desk is paper-only, and
 * any live path is a separate product/access/compliance gate
 * (docs/ELIGIBILITY.md §5), never an env flip.
 */

export const ISABEL_PAPER_ENABLED = process.env.NEXT_PUBLIC_ISABEL_PAPER_ENABLED !== 'false';
