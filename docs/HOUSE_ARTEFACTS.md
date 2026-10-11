# House Artefacts — period furniture for the foyer's empty fields

**Prepared:** 2026-10-11. **Status:** IMPLEMENTED — all six artefacts (A1–A6)
are built and covered by the foyer test suite. Extends
[PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md)'s world rule ("historic manners and
materials coexist with contemporary information") from the desk rooms onto the
foyer's page furniture.

## The audit — where the black actually is

At 1280px every section below the hero fills the left ~60–65% of the viewport;
the right ~35% was dead ink carrying only the `roomRail` nav (Line / Wire /
Example / Board / Method / Desks / Answers). Two fields stood out: the right
third of `EXAMPLE CALL` (an honest empty state) and the whole right column
beside `QUESTIONS CALLERS ASK`. The artefacts are **responsive furniture**:
the ghost ground and quotation column exist only at wide widths; the house
sheet drops to a slim strip beneath the criteria on mobile; the stamp hides
below 760px; and the posted notice and colophon stay in flow at every width
as their columns collapse.

## The register rule (carried from the copy pass)

- **Furniture speaks the house's tongue; the honesty layer stays plain
  English.** Disclosures, eligibility, AI labels, and risk text are never
  archaized — they must be unmistakable, not charming.
- **Every artefact carries real data or is plainly ornamental.** Nothing that
  looks like information may be invented: no fake quotations, no fake issue
  dates, no fake telegrams. Texture is allowed to be texture.
- **Ornaments are decorative and non-semantic, `pointer-events:none`, and
  below the lamp pool** (`.main > *::after` sits at z-index 30; artefacts
  live under it). Rendered elements like the quote column and the stamp
  carry `aria-hidden`; pure CSS textures and pseudo-elements are
  non-semantic by nature — they paint pixels, not content. Anything
  duplicating wire data is decorative duplication — the accessible source
  already exists in the wire section.
- **Restraint is the product.** The black is the room's quiet. Furniture, not
  noise; if a field still breathes, leave it.

---

## A1 · Ghost ledger ground — built

**As built:** `public/media/ledger-ground.svg` (~1.6 KB) — an abstract
ornamental texture of ruled ledger lines, column rules and ink flourishes.
No readable figures or script; texture only.

**Placement:** a per-section `::before` behind the dark rooms (`.wire`,
`.exampleCall`, `.method`, `.desks`, `.answers`) at ≥1100px only, `opacity:
0.06`, negative z-index inside each room's stacking context (below content,
below the lamp pool), `pointer-events: none`. Static — no parallax, no
motion. Absent below 1100px, so the narrow experience carries nothing.

## A2 · The quotation column — built

**As built:** `components/foyer/QuoteColumn.tsx` — a slim ruled table of
the same marks the wire carries: `SYMBOL` + formatted price in mono, thin
ruled rows, a small rail tag (BASE / SOL / RH).

**Placement:** a sticky aside (`top: 20vh`) in the `house-answers` section's
right field at ≥1100px — the room's internal grid keeps the answer list on
the left — hidden below 1100px. Right margin clears the fixed `roomRail`
(≥80px measured clearance).

**Source:** the same `wireMarksOf` list evaluated once in `HouseFoyer` and
shared with `LiveWire` — **zero new fetches**. Up to seven real priced rows,
in wire order, capped after filtering `unavailable` and unpriced marks.
Stale rows keep the wire's `STALE` label.

**Honesty — per-row UTC stamps, no global "as of":** `Observed` from
`reference.updatedAt`; when absent, `Snapshot` from the source
`MarksResult.asOf` (a fetch snapshot, never called an observation); when
neither is valid, `Time unavailable` — no fabricated freshness. Upstream
marks arrive with mixed timestamp units (chainlink marks in seconds, others
in ms); both are normalized for display. `aria-hidden`, `pointer-events:
none`, no ticker motion — the wire remains the accessible equivalent. If no
valid priced marks exist, the column prints nothing at all.

## A3 · The house sheet — built

**As built:** `components/foyer/HouseSheet.tsx` — the day's desk note set as
a printed periodical excerpt: `THE HOUSE SHEET` masthead, real UTC date
line, the note verbatim, and a byline.

**Placement:** inside the example call's `pending`/`rejected` empty state —
the right field at ≥1100px, a slim strip beneath the criteria below. The
`accepted` state omits it (the slip owns the field). The `Awaiting the wire`
stamp rides the field's top edge, reserved clear of the sheet.

**Source:** `deskNoteOfTheDay` (lib/desk-notes) verbatim, rotating which
open desk prints via `houseSheetDesk` on the same UTC day index the notes
use. SSR paints masthead alone — no clock on the server, no fabricated
date — and the sheet fills in on mount, re-rolling at each UTC midnight
while the page stays open.

**Honesty:** attribution prints verbatim when the note carries a speaker's
words; otherwise the byline names the desk and says *a desk note, not a
quotation*. Word days present a boxed "A word of the trade" column. No
issue number is ever printed. The foot carries a true provenance line —
*"The house takes its name from the firm whose Weekly printed what the
Street would not."* — which is deliberately a lineage note, never a claim
to be the historical paper itself.

## A4 · Marginalia on the example call — built

**As built:** the criteria list reads as a clerk's working sheet — the
manicule (`☞`) as each bullet's marker — and the empty state carries the
red-ink `Awaiting the wire` stamp, matching the filing-stamp language the
desks already use. `aria-hidden`, hidden below 760px. No handwriting font —
a fine ruled marker plus tracked small caps stays period-true and legible.

**Honesty:** unchanged — still never fakes a transcript or a price; the
stamp says *waiting*, which is true.

## A5 · The colophon — built

**As built:** the footer carries a fleuron (`❦`) divider rule, the running
line ("THE TAPE RUNS ALL NIGHT. EVERY SLIP ON THE RECORD."), the set-in line
("SET IN FRAUNCES & IBM PLEX · CLAFLIN · EST. MMXXVI"), the planned-desk
line "Not yet seated — Jay (Arbitrum)" (generated from the planned-desks
list, matching the lamps), nav, and the risk paragraph — wording unchanged,
contrast brightened after visual QA.

## A6 · The posted notice — built

**As built:** a pinned `POSTED` plate in the `METHOD` section's right field
(two columns at ≥1024px, single column below; register clearance applied at
≥901px, before the second column appears), carrying the house's actual
rules in plain type:

> POSTED — Only you can sign. Voice never moves funds. Paper by default.
> Estimates expire. Records are paper.

The plate takes its period-ness from the letterpress frame, the pin head,
and the `POSTED` kicker — never from fabricated notices.

---

## Verified

Covered by `tests/house-foyer.test.ts` (quote column rows/stale/per-row
timestamps/fallbacks/cap, house sheet rotation/verbatim/word day/
attribution/UTC-midnight rollover, SSR first paint), `tests/example-call.test.ts`
(sheet placement, accepted-state omission), `tests/desk-notes.test.ts`
(rotation helper). Full suite and production build green; one consolidated
visual pass ran on desktop (1440×900) and mobile (390×844) against the
production standalone — the stamp/sheet/register collisions and risk-text
contrast found there were fixed in CSS and re-verified by code review and
the targeted suites (the final CSS itself was not re-screenshotted).

## Deferred (listed so they stay available, not promised)

- Telegram-form receipts for filed records (desk-level, not foyer).
- A pneumatic-tube send-off animation when a paper record files.
- A chalk board with the day's marks inside METHOD.
- Halley's reel — the launch desk is a different card shape (wide plate, no
  flip today), a design decision of its own.
