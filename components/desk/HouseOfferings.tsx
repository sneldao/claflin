'use client';

import { Fragment, useMemo, useState, type MouseEvent } from 'react';
import { getHouseDesk, type HouseDeskId } from '@/lib/house';
import type { EntryIntent } from '@/lib/house-entry';
import { entryIntentFromInstruction } from '@/lib/house-entry';
import type { InstrumentOffering } from '@/lib/desk/contracts';
import {
  offeringCapabilityText,
  offeringGroupsForInstruction,
  openDesksForOffering,
} from '@/lib/desk/offerings-presentation';
import { offeringForId } from '@/lib/desk/offerings';
import { boardRows, formatGap, formatObservedAt, shortAddress, type BoardRow } from '@/lib/desk/board';
import type { DeskMark, MarksResult } from '@/lib/trading/marks-shared';
import foyerStyles from './HouseFoyer.module.css';

function offeringHref(offeringId: string, deskId: HouseDeskId): string {
  return `/?desk=${deskId}&offering=${encodeURIComponent(offeringId)}`;
}

type MarksRead = { result: MarksResult | null; failed: boolean };

/**
 * The house board: every verified offering in one table — token, issuer,
 * rail, venue, the token's mark, the desk's stock reference and the gap
 * between them — with each number's source and time, and a row that opens
 * to show the contract, what the token legally is, and who may hold it.
 */
export function HouseOfferings({ onEnter, instruction = '', marks }: {
  onEnter: (id: HouseDeskId, offeringId?: string, intent?: EntryIntent | null) => void;
  instruction?: string;
  /** Marks already read by the foyer, keyed by desk; the board never fetches. */
  marks?: Partial<Record<HouseDeskId, MarksRead | null>>;
}) {
  const groups = useMemo(() => offeringGroupsForInstruction(instruction), [instruction]);
  const [open, setOpen] = useState<string | null>(null);

  const markIndex = useMemo(() => {
    const index = new Map<string, DeskMark>();
    for (const read of Object.values(marks ?? {})) {
      for (const mark of read?.result?.marks ?? []) index.set(mark.instrumentId, mark);
    }
    return index;
  }, [marks]);

  const loaded = (offering: InstrumentOffering) => offering.deskIds.some(id => {
    const read = marks?.[id as HouseDeskId];
    return Boolean(read && (read.result || read.failed));
  });

  const rows = boardRows(groups, markIndex, loaded);
  const allOfferings = groups.flatMap(group => group.offerings);
  const capability = allOfferings.length > 0
    ? offeringCapabilityText(allOfferings[0], allOfferings.flatMap(o => openDesksForOffering(o).map(d => d.id)))
    : null;

  const enter = (offering: Pick<InstrumentOffering, 'offeringId'>, deskId: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'instant' });
    /* The instruction is not just a filter — its side and amount ride along
       onto the ticket the desk opens with. */
    onEnter(deskId, offering.offeringId, entryIntentFromInstruction(instruction));
  };

  return (
    <section className={foyerStyles.offerings} id="house-offerings" aria-labelledby="house-offerings-title">
      <div className={foyerStyles.offeringsIntro}>
        <p className={foyerStyles.kicker}>THE BOARD</p>
        <h2 id="house-offerings-title">Every verified offering.</h2>
        <p>
          Each row is one token on one rail. The same company on two rails is two
          different products, and the house never swaps one for the other.
        </p>
      </div>

      <div className={foyerStyles.boardWrap} aria-live="polite">
        {rows.length === 0 ? (
          <p className={foyerStyles.noOfferings} role="status">
            No verified offering matches that instruction yet. Try a ticker or company name.
          </p>
        ) : (
          <table className={foyerStyles.board}>
            <caption className={foyerStyles.boardCaption}>
              Quoted in USDC. {capability}. Marks are indicative references, not offers; the desk
              quotes the venue when you ask.
            </caption>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Issuer</th>
                <th scope="col">Rail · venue</th>
                <th scope="col" className={foyerStyles.num}>Token mark</th>
                <th scope="col" className={foyerStyles.num}>Stock ref</th>
                <th scope="col" className={foyerStyles.num}>Gap</th>
                <th scope="col"><span className={foyerStyles.srOnly}>Desk</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const expanded = open === row.offeringId;
                const detailsId = `board-${row.symbol}`;
                return (
                  <Fragment key={row.offeringId}>
                    <tr className={foyerStyles.boardRow} data-expanded={expanded}>
                      <th scope="row">
                        <button
                          type="button"
                          className={foyerStyles.boardToggle}
                          aria-expanded={expanded}
                          aria-controls={detailsId}
                          onClick={() => setOpen(expanded ? null : row.offeringId)}
                        >
                          <span className={foyerStyles.boardSymbol}>{row.symbol}</span>
                          <span className={foyerStyles.boardName}>{row.name}</span>
                        </button>
                      </th>
                      <td data-label="Issuer">
                        <span className={foyerStyles.boardIssuer}>{row.issuer}</span>
                        <span className={foyerStyles.boardSub}>{row.product}</span>
                      </td>
                      <td data-label="Rail · venue">
                        <span>{row.rail}</span>
                        <span className={foyerStyles.boardSub}>{row.venue}</span>
                      </td>
                      <td className={foyerStyles.num} data-label="Token mark"><MarkCell row={row} /></td>
                      <td className={foyerStyles.num} data-label="Stock ref">
                        {row.stockRef ? <span>${row.stockRef}</span> : <span className={foyerStyles.boardMissing}>—</span>}
                        {row.stockRefSource && <span className={foyerStyles.boardSub}>{row.stockRefSource}</span>}
                      </td>
                      <td className={foyerStyles.num} data-label="Gap">
                        {row.gapBps != null
                          ? <span className={foyerStyles.boardGap} data-sign={Math.sign(row.gapBps)}>{formatGap(row.gapBps)}</span>
                          : <span className={foyerStyles.boardMissing} title={row.gapNote}>—</span>}
                        <span className={foyerStyles.boardSub}>{row.gapBps != null ? 'vs stock' : row.gapNote}</span>
                      </td>
                      <td>
                        <DeskLinks row={row} enter={enter} />
                      </td>
                    </tr>
                    <tr id={detailsId} className={foyerStyles.boardDetails} hidden={!expanded}>
                      <td colSpan={7}>
                        <RowDetails row={row} />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

const UNIT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  USDC: 'USDC you spend',
  token: 'tokens you sell',
  'scaled-token': 'tokens you sell (after the issuer’s multiplier)',
});

function unitWords(policy: InstrumentOffering['unitPolicy']): string {
  return `Buy in ${UNIT_WORDS[policy.buy] ?? policy.buy} · sell in ${UNIT_WORDS[policy.sell] ?? policy.sell}`;
}

function MarkCell({ row }: { row: BoardRow }) {
  if (row.markState === 'pending') return <span className={foyerStyles.boardMissing}>Reading…</span>;
  if (!row.tokenMark) return <><span className={foyerStyles.boardMissing}>—</span><span className={foyerStyles.boardSub}>unavailable</span></>;
  return (
    <>
      <span>${row.tokenMark}</span>
      <span className={foyerStyles.boardSub}>
        {row.markState === 'stale' && <strong className={foyerStyles.boardStale}>STALE · </strong>}
        {row.markSource}{row.markAt ? ` · ${formatObservedAt(row.markAt)}` : ''}
      </span>
    </>
  );
}

function DeskLinks({ row, enter }: { row: BoardRow; enter: (offering: Pick<InstrumentOffering, 'offeringId'>, deskId: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void }) {
  if (row.deskIds.length === 0) return <span className={foyerStyles.boardMissing}>No open desk</span>;
  return (
    <span className={foyerStyles.boardDesks}>
      {row.deskIds.map(id => {
        const desk = getHouseDesk(id);
        return (
          <a
            key={id}
            href={offeringHref(row.offeringId, id)}
            aria-label={`Open ${desk?.shortName ?? id}’s desk for ${row.symbol}`}
            onClick={enter(row, id)}
          >
            Open {desk?.shortName ?? id}’s desk
          </a>
        );
      })}
    </span>
  );
}

function RowDetails({ row }: { row: BoardRow }) {
  const offering = offeringForId(row.offeringId);
  return (
    <div className={foyerStyles.boardDossier}>
      {row.facts && (
        <dl>
          <div><dt>What it is</dt><dd>{row.facts.what}</dd></div>
          <div><dt>What you get</dt><dd>{row.facts.rights}</dd></div>
          <div><dt>Who it is for</dt><dd>{row.facts.eligibility}</dd></div>
        </dl>
      )}
      <dl>
        <div>
          <dt>{row.rail === 'Solana' ? 'Mint' : 'Contract'}</dt>
          <dd>
            {row.explorerUrl
              ? <a href={row.explorerUrl} target="_blank" rel="noreferrer" className={foyerStyles.boardAddress}>{shortAddress(row.address)} ↗</a>
              : <code className={foyerStyles.boardAddress}>{shortAddress(row.address)}</code>}
          </dd>
        </div>
        {offering && <div><dt>Amounts</dt><dd>{unitWords(offering.unitPolicy)}</dd></div>}
        <div><dt>Gap</dt><dd>{row.gapNote}.</dd></div>
        {row.facts && (
          <div>
            <dt>Source</dt>
            <dd><a href={row.facts.sourceUrl} target="_blank" rel="noreferrer">{row.facts.sourceLabel} ↗</a></dd>
          </div>
        )}
      </dl>
    </div>
  );
}
