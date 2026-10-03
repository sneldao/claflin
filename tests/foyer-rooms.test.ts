import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The brass register is a small but important surface — the
 * visitor's only "where am I?" signal while scrolling the foyer.
 * These tests assert the labels are coherent and the section ids
 * exist (or are renamed consistently) so the rail jumps land on
 * real sections.
 *
 * The ROOMS array is defined in components/desk/HouseFoyer.tsx.
 * The test reads the source rather than the runtime so the
 * contract is checked at PR time without spinning up React.
 */

const HOUSE_FOYER = fileURLToPath(new URL('../components/desk/HouseFoyer.tsx', import.meta.url));
const ANNOTATED_EXAMPLE = fileURLToPath(new URL('../components/foyer/AnnotatedExampleCall.tsx', import.meta.url));
const HOUSE_OFFERINGS = fileURLToPath(new URL('../components/desk/HouseOfferings.tsx', import.meta.url));
const HOUSE_ANSWERS = fileURLToPath(new URL('../components/desk/HouseAnswers.tsx', import.meta.url));
const HOUSE_DESKS = fileURLToPath(new URL('../components/desk/HouseDesks.tsx', import.meta.url));

describe('foyer — brass register', () => {
  const foyerSource = readFileSync(HOUSE_FOYER, 'utf8');
  const exampleSource = readFileSync(ANNOTATED_EXAMPLE, 'utf8');
  const offeringsSource = readFileSync(HOUSE_OFFERINGS, 'utf8');
  const answersSource = readFileSync(HOUSE_ANSWERS, 'utf8');
  const desksSource = readFileSync(HOUSE_DESKS, 'utf8');
  const allSources = [foyerSource, exampleSource, offeringsSource, answersSource, desksSource];

  it('the register includes a stop for the example', () => {
    // The example call moved up the page; the register must show it
    // as a stop the visitor can jump to.
    assert.match(foyerSource, /id:\s*'house-example'[\s\S]+?label:\s*'Example'/);
  });

  it('the example section has the matching id', () => {
    assert.match(exampleSource, /id="house-example"/);
  });

  it('the wire stop uses the "Wire" label, not "Tape"', () => {
    // The plan calls the live tape the "wire" — the room's wire
    // is the live reference marks. A "Tape" stop reads as a
    // generic market ticker; "Wire" reads as part of the room.
    assert.match(foyerSource, /id:\s*'the-tape'[\s\S]+?label:\s*'Wire'/);
  });

  it('every register stop has a matching section in the foyer', () => {
    // The stops are: Line, Wire, Example, Board, Method, Desks,
    // Answers. The example and answers sections live in separate
    // components; the others live inline. Each must have an
    // `id="..."` somewhere in the source.
    const expected = [
      { id: 'the-line' },
      { id: 'the-tape' },
      { id: 'house-example' },
      { id: 'house-offerings' },
      { id: 'house-method' },
      { id: 'house-desks' },
      { id: 'house-answers' },
    ];
    for (const { id } of expected) {
      const pattern = new RegExp(`id="${id}"`);
      const found = allSources.findIndex(src => pattern.test(src));
      assert.ok(
        found >= 0,
        `section id="${id}" is missing from any known foyer source. Sources checked: HouseFoyer, AnnotatedExample, HouseOfferings, HouseAnswers`,
      );
    }
  });
});