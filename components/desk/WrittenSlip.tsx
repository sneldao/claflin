'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { SlipField, SlipMark, SlipProvenance } from '@/lib/desk/slip-provenance';
import { markFor } from '@/lib/desk/slip-provenance';
import {
  slipSentence,
  slipValidity,
  filedLine,
  type SlipDraftLike,
  type SlipInstrumentLike,
  type SlipQuoteLike,
  type SlipVocabulary,
} from '@/lib/desk/written-slip';
import type { SupersededSlip } from '@/lib/desk/superseded';
import { formatRecordedTime } from '@/lib/trading/desk-documents';
import styles from './WorkingDesk.module.css';

type SlipMode = 'blank' | 'draft' | 'review' | 'receipt';
type EditField = 'instrument' | 'side' | 'amount';
type EditPartial = { instrumentId?: string | null; side?: 'buy' | 'sell' | null; amount?: string | null; unit?: string | null };

/**
 * The slip written as a sentence — one grammar for every desk: side, amount,
 * and instrument are inline-editable words; a provenance mark under each
 * says where the desk got it. Missing values render as blank underlined
 * gaps, never as form fields. Nothing here invents a value — every mark is
 * gated on the value the slip currently holds. The desk's own words (venue,
 * units, chips) arrive through the vocabulary prop.
 */
export function WrittenSlip<D extends SlipDraftLike = SlipDraftLike>({
  mode,
  draft,
  vocab,
  instruments,
  quote = null,
  instrument = null,
  spokenLine = null,
  provenance = {},
  superseded = [],
  now = Date.now(),
  pending = false,
  pendingLabel = 'Pricing it…',
  instrumentBlankLabel = 'Choose xStock',
  notice = null,
  terms = null,
  headline = null,
  actions = null,
  children = null,
  trailing = null,
  receiptExtra = null,
  filedAt = null,
  freshness,
  onEdit,
}: {
  mode: SlipMode;
  draft: D;
  vocab: SlipVocabulary;
  instruments: readonly (SlipInstrumentLike & { id: string })[];
  quote?: SlipQuoteLike | null;
  instrument?: SlipInstrumentLike | null;
  spokenLine?: string | null;
  provenance?: SlipProvenance;
  superseded?: SupersededSlip[];
  now?: number;
  pending?: boolean;
  pendingLabel?: string;
  /** Blank gap label for the instrument field — 'Choose xStock' on Jesse,
      'Choose stock' on Hetty. */
  instrumentBlankLabel?: string;
  notice?: string | null;
  /** The desk's own terms line under the sentence in review. */
  terms?: ReactNode;
  /** The slip's headline in review — Jesse's gap strip; null on Hetty. */
  headline?: ReactNode;
  /** The slip's verbs — callers own the buttons and their disabled rules. */
  actions?: ReactNode;
  /** Everything the client must read before acting — boundary, notices,
      drawer, consent, live block. Rendered before the action buttons. */
  children?: ReactNode;
  /** Quiet reading after the actions — evidence modules. */
  trailing?: ReactNode;
  /** Extra receipt content between the filed sentence and the filed meta. */
  receiptExtra?: ReactNode;
  /** Filed timestamp — renders the 'Filed {time} · kept in this browser' line. */
  filedAt?: number | null;
  /** 0..1 freshness of the review window — drains the brass rule. */
  freshness?: number;
  onEdit?: (partial: Partial<D> & EditPartial, field: EditField) => void;
}) {
  const [editing, setEditing] = useState<SlipField | null>(null);
  const buttonRefs = useRef<Partial<Record<SlipField, HTMLButtonElement | null>>>({});
  const pendingFocus = useRef<SlipField | null>(null);

  const closeEditor = (field: SlipField) => {
    pendingFocus.current = field;
    setEditing(null);
  };
  useEffect(() => {
    if (editing === null && pendingFocus.current) {
      buttonRefs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
  }, [editing]);

  if (mode === 'receipt') {
    const filedText = quote && instrument ? filedLine(quote, instrument.symbol, vocab) : null;
    return (
      <div className={styles.writtenSlip}>
        {filedText && (
          <>
            <p className={styles.slipSentence}>{filedText}</p>
            {terms && <p className={styles.slipTerms}>{terms}</p>}
          </>
        )}
        {filedAt !== null && (
          <p className={styles.paperFoot}>Filed {formatRecordedTime(filedAt)} · kept in this browser</p>
        )}
        {receiptExtra}
        {children}
        {actions && <div className={styles.slipActions}>{actions}</div>}
        {trailing}
      </div>
    );
  }

  const editable = Boolean(onEdit);
  /* On review the sentence describes the quote under the pen, not the draft. */
  const sentenceDraft: SlipDraftLike = mode === 'review' && quote
    ? { instrumentId: quote.intent.instrumentId, side: quote.intent.side, amount: quote.intent.amount }
    : draft;
  const fieldValue = (field: SlipField): string | null =>
    field === 'instrument' ? sentenceDraft.instrumentId : field === 'side' ? sentenceDraft.side : sentenceDraft.amount;

  const onEsc = (field: SlipField) => (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor(field);
    }
  };

  const instrumentEditor = (
    <span
      className={styles.slipEditor}
      role="group"
      aria-label={instrumentBlankLabel}
      onKeyDown={onEsc('instrument')}
    >
      {instruments.map(stock => (
        <button
          key={stock.id}
          type="button"
          aria-pressed={draft.instrumentId === stock.id}
          onClick={() => { onEdit?.({ instrumentId: stock.id } as Partial<D> & EditPartial, 'instrument'); closeEditor('instrument'); }}
        >
          {stock.symbol}
        </button>
      ))}
    </span>
  );

  const sideEditor = (
    <span className={styles.slipEditor} role="group" aria-label="Buy or sell" onKeyDown={onEsc('side')}>
      {(['buy', 'sell'] as const).map(next => (
        <button
          key={next}
          type="button"
          aria-pressed={draft.side === next}
          onClick={() => {
            /* A side flip clears the amount — a buy's dollars are not a sell's units. */
            onEdit?.({ side: next, unit: vocab.unitFor(next), amount: null } as Partial<D> & EditPartial, 'side');
            closeEditor('side');
          }}
        >
          {next === 'buy' ? 'Buy' : 'Sell'}
        </button>
      ))}
    </span>
  );

  const amountEditor = (
    <AmountEditor
      initial={draft.amount ?? ''}
      chips={draft.side === 'sell' ? vocab.sellChips : vocab.buyChips}
      onApply={value => {
        /* Only the amount was touched — a missing side stays missing rather
           than being silently invented. */
        onEdit?.(
          (draft.side
            ? { amount: value, side: draft.side as 'buy' | 'sell', unit: vocab.unitFor(draft.side as 'buy' | 'sell') }
            : { amount: value }) as Partial<D> & EditPartial,
          'amount',
        );
        closeEditor('amount');
      }}
      onCancel={() => closeEditor('amount')}
    />
  );

  const renderField = (field: SlipField, display: string | null, blankLabel: string, editor: ReactNode) => {
    const mark = markFor(provenance, field, fieldValue(field));
    if (editing === field && editable) {
      return <span key={`${field}-editor`} className={styles.slipField}>{editor}</span>;
    }
    return (
      <span key={`${field}-${display ?? 'blank'}`} className={styles.slipField}>
        {display !== null ? (
          <button
            type="button"
            ref={el => { buttonRefs.current[field] = el; }}
            className={styles.slipValue}
            onClick={() => { if (editable) setEditing(field); }}
            aria-label={`Change ${field}: ${display}`}
            disabled={!editable}
          >
            {display}
          </button>
        ) : (
          <button
            type="button"
            ref={el => { buttonRefs.current[field] = el; }}
            className={styles.slipBlank}
            onClick={() => { if (editable) setEditing(field); }}
            aria-label={blankLabel}
            disabled={!editable}
          >
            {blankLabel}
          </button>
        )}
        {mark && <ProvMark mark={mark} />}
      </span>
    );
  };

  const sentence = slipSentence(sentenceDraft, instrument, mode === 'review' ? quote : null, vocab);
  const validity = mode === 'review' && quote ? slipValidity(quote.expiresAt, now) : null;

  return (
    <div className={styles.writtenSlip} data-lapsed={validity?.state === 'lapsed' ? 'true' : undefined}>
      {mode === 'review' && freshness !== undefined && (
        <i
          className={styles.slipFresh}
          aria-hidden="true"
          style={{ '--review-fresh': freshness } as CSSProperties}
        />
      )}
      {headline}
      {spokenLine && (
        <p className={styles.slipVerbatim}>
          <span className={styles.slipVerbatimLabel}>Your words</span>
          <em>“{spokenLine}”</em>
        </p>
      )}
      <p className={styles.slipSentence}>
        {renderField('side', sentence.sideWord, 'Buy or sell', sideEditor)}
        {' for your account '}
        {renderField(
          'amount',
          sentence.amount !== null
            ? `${sentence.amount}${sentence.amountUnit ? ` ${sentence.amountUnit}` : ''}`
            : null,
          'Add amount',
          amountEditor,
        )}
        {' of '}
        {renderField('instrument', sentence.instrumentLabel, instrumentBlankLabel, instrumentEditor)}
        {sentence.priceClause ? ` — ${sentence.priceClause}` : ''}
      </p>
      {superseded.length > 0 && <SupersededList items={superseded} />}
      {notice && (
        <p className={styles.notice} role="alert">{notice}</p>
      )}
      {mode === 'review' && quote && (
        <>
          {terms && <p className={styles.slipTerms}>{terms}</p>}
          <p role="status" className={styles.notice} data-urgent={validity?.state === 'closing' ? 'true' : undefined}>
            {validity?.state === 'open' && `Good for ${validity.secondsLeft} seconds.`}
            {validity?.state === 'closing' && 'Closing — too late to file. Ask for a fresh price.'}
            {validity?.state === 'lapsed' && 'Lapsed — ask for a fresh price.'}
          </p>
          {quote.assumptions && <p className={styles.assumptions}>{quote.assumptions}</p>}
        </>
      )}
      {children}
      {actions && <div className={styles.slipActions}>{actions}</div>}
      {mode !== 'review' && pending && (
        <p className={styles.slipPending} role="status">{pendingLabel}</p>
      )}
      {trailing}
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Where the desk got a value — small print under it, honest or absent. */
function ProvMark({ mark }: { mark: SlipMark }) {
  let text: string;
  let label: string;
  switch (mark.kind) {
    case 'said':
      text = `← “${mark.excerpt}”`;
      label = `From what you said: “${mark.phrase}”`;
      break;
    case 'kept':
      text = '← kept from the slip';
      label = 'Kept from what was already on the slip';
      break;
    case 'inferred':
      text = '← assumed — check it';
      label = 'The desk assumed this — check it';
      break;
    case 'line': {
      const caller = mark.lastCaller ? ` · you said “${truncate(mark.lastCaller, 60)}”` : '';
      text = `← from the call${caller}`;
      label = mark.lastCaller ? `Set over the call after you said: “${mark.lastCaller}”` : 'Set over the call';
      break;
    }
    case 'hand':
      text = '← by hand';
      label = 'Written by hand';
      break;
    case 'carried':
      text = '← from the foyer';
      label = 'Carried in from the foyer';
      break;
  }
  return (
    <span className={styles.slipProv} title={label}>
      <span aria-hidden="true">{text}</span>
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

function AmountEditor({
  initial,
  chips,
  onApply,
  onCancel,
}: {
  initial: string;
  chips: readonly string[];
  onApply: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const apply = (next: string) => {
    const clean = next.trim();
    if (clean) onApply(clean);
  };
  return (
    <span className={styles.slipEditor} role="group" aria-label="Amount">
      <input
        autoFocus
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-label="Amount"
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply(value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <span className={styles.amountChips} role="group" aria-label="Amount suggestions">
        {chips.map(chip => (
          <button key={chip} type="button" onClick={() => apply(chip)}>{chip}</button>
        ))}
      </span>
    </span>
  );
}

/** Superseded prices stay on the slip, struck through — never erased. */
function SupersededList({ items }: { items: SupersededSlip[] }) {
  return (
    <ul className={styles.slipSuperseded} aria-label="Superseded on this slip">
      {items.map(item => (
        <li key={item.id}>
          <s>{item.line}</s>{' '}
          <span className={styles.slipTag}>
            {item.reason === 'set-aside' ? 'set aside — nothing filed' : 'superseded — this price no longer stands'}
          </span>
        </li>
      ))}
    </ul>
  );
}
