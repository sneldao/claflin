/**
 * Tennie desk release flags. Same shape as Jesse's: a public Next env that
 * the capability table and UI both read. Default open; set
 * NEXT_PUBLIC_TENNIE_PAPER_ENABLED=false to close the seated desk.
 *
 * There is deliberately no Tennie live flag — the desk is paper-only, and
 * any live path is a separate product/access/compliance gate
 * (docs/ELIGIBILITY.md §5), never an env flip.
 */

/* Legacy NEXT_PUBLIC_ISABEL_PAPER_ENABLED still closes the desk — the flag
   outlived the name it carried. */
const paperFlag =
  process.env.NEXT_PUBLIC_TENNIE_PAPER_ENABLED ?? process.env.NEXT_PUBLIC_ISABEL_PAPER_ENABLED;
export const TENNIE_PAPER_ENABLED = paperFlag !== 'false';
