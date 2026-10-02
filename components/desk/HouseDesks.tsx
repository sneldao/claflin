'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { HouseDesk, HouseDeskId } from '@/lib/house';
import { BROKER_VOICE } from '@/lib/desk/broker-voice';
import { signatureLine } from '@/lib/desk-notes';
import { LAUNCH_DESK_EXPLAINER, LINE_IDENTITY } from '@/lib/desk/ui-copy';
import { launchDeskSeen, markLaunchDeskSeen } from '@/lib/desk/launch-explainer';
import { NameplateNote } from './NameplateNote';
import foyerStyles from './HouseFoyer.module.css';

function DeskCard({ desk, deskHref, onOpen }: {
  desk: HouseDesk;
  deskHref: (id: HouseDeskId) => string;
  onOpen: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const voice = BROKER_VOICE[desk.id];
  const line = signatureLine(desk.id);
  return (
    <article className={foyerStyles.deskCard}>
      <p className={foyerStyles.deskMeta}>{LINE_IDENTITY} · {voice?.rail ?? desk.market}</p>
      <h3 className={foyerStyles.deskName}>{desk.shortName}</h3>
      {voice && <p className={foyerStyles.deskLens}>{voice.lens}</p>}
      {!voice && <p className={foyerStyles.deskLens}>{desk.approach} Typed instructions only — no line.</p>}
      {line && (
        <blockquote className={foyerStyles.deskQuote}>
          <p>{line.text}</p>
          <cite>— {line.attribution}</cite>
        </blockquote>
      )}
      <NameplateNote deskId={desk.id} namedFor={voice?.namedFor ?? desk.name} />
      <a className={foyerStyles.deskOpen} href={deskHref(desk.id)} onClick={onOpen(desk.id)}>
        Visit {desk.shortName}’s desk
      </a>
    </article>
  );
}

/**
 * The launch plate — the room that makes instruments, not a fourth broker
 * card. Ink-dipped and set right against the left-aligned tape cards; and
 * the first time a caller reaches for it, the explainer stands open to its
 * left before the door does. Entry marks the gate seen — peeking does not.
 */
function LaunchPlate({ desk, deskHref, onOpen }: {
  desk: HouseDesk;
  deskHref: (id: HouseDeskId) => string;
  onOpen: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const voice = BROKER_VOICE[desk.id];
  const explainerId = `launch-explainer-${desk.id}`;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const explainerRef = useRef<HTMLElement>(null);
  const ctaButtonRef = useRef<HTMLButtonElement>(null);
  const ctaLinkRef = useRef<HTMLAnchorElement>(null);

  /* The seen flag lives in storage — mounted state only, so SSR and first
     paint always draw the un-seen plate (no hydration split). */
  /* eslint-disable react-hooks/set-state-in-effect -- syncing the localStorage
     gate record into state on mount, same as use-signal-caption. */
  useEffect(() => {
    setSeen(launchDeskSeen());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    explainerRef.current?.querySelector('h3')?.setAttribute('tabindex', '-1');
    (explainerRef.current?.querySelector('h3') as HTMLElement | null)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        (ctaButtonRef.current ?? ctaLinkRef.current)?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const enter = onOpen(desk.id);
  const onEnter = (event: MouseEvent<HTMLAnchorElement>) => {
    markLaunchDeskSeen();
    enter(event);
  };

  return (
    <div className={foyerStyles.launchRow}>
      {open && (
        <aside ref={explainerRef} id={explainerId} className={foyerStyles.launchExplainer} aria-label="About the launch desk">
          <p className={foyerStyles.deskMeta}>{LAUNCH_DESK_EXPLAINER.kicker}</p>
          <h3 className={foyerStyles.launchExplainerTitle}>{LAUNCH_DESK_EXPLAINER.title}</h3>
          <p className={foyerStyles.launchExplainerBody}>{LAUNCH_DESK_EXPLAINER.body}</p>
          <p className={foyerStyles.launchExplainerRedirect}>{LAUNCH_DESK_EXPLAINER.redirect}</p>
          <div className={foyerStyles.launchExplainerActions}>
            <a className={foyerStyles.deskOpen} href={deskHref(desk.id)} onClick={onEnter}>
              {LAUNCH_DESK_EXPLAINER.enter}
            </a>
            <button
              type="button"
              className={foyerStyles.launchExplainerDismiss}
              onClick={() => { setOpen(false); (ctaButtonRef.current ?? ctaLinkRef.current)?.focus(); }}
            >
              {LAUNCH_DESK_EXPLAINER.dismiss}
            </button>
          </div>
        </aside>
      )}
      <article className={foyerStyles.launchPlate}>
        <p className={foyerStyles.deskMeta}>{LAUNCH_DESK_EXPLAINER.kicker} · {voice?.rail ?? desk.market}</p>
        <div className={foyerStyles.launchPlateBody}>
          <h3 className={foyerStyles.deskName}>{desk.shortName}</h3>
          <div className={foyerStyles.launchPlateCopy}>
            {voice && <p className={foyerStyles.deskLens}>{voice.lens}</p>}
            <p className={foyerStyles.launchPlateNote}>
              Not another line on the same book — the tape desks trade what exists; this desk launches what does not yet.
            </p>
            <NameplateNote deskId={desk.id} namedFor={voice?.namedFor ?? desk.name} tone="dark" />
            <button
              type="button"
              className={foyerStyles.launchPlateAsk}
              aria-expanded={open}
              aria-controls={explainerId}
              onClick={() => setOpen(v => !v)}
            >
              {LAUNCH_DESK_EXPLAINER.ask}
            </button>
          </div>
          {seen ? (
            <a ref={ctaLinkRef} className={foyerStyles.deskOpen} href={deskHref(desk.id)} onClick={enter}>
              Bring {desk.shortName} a launch
            </a>
          ) : (
            <button
              ref={ctaButtonRef}
              type="button"
              className={foyerStyles.deskOpen}
              aria-expanded={open}
              aria-controls={explainerId}
              onClick={() => setOpen(v => !v)}
            >
              Bring {desk.shortName} a launch
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

/**
 * Meet the desks — character after comprehension. The only foyer section
 * where history leads; each card says plainly that the broker is AI.
 *
 * Two kinds of room: tape desks sit in the broker grid — they price, size,
 * and file what already trades. A launch desk makes the instrument, so it
 * stands apart on its own plate; a caller skimming for "who do I trade with"
 * should never mistake it for another line on the same book.
 */
export function HouseDesks({ desks, deskHref, onOpen }: {
  desks: readonly HouseDesk[];
  deskHref: (id: HouseDeskId) => string;
  onOpen: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const tape = desks.filter(desk => desk.kind !== 'launch');
  const launch = desks.filter(desk => desk.kind === 'launch');
  if (tape.length === 0 && launch.length === 0) return null;
  return (
    <section className={foyerStyles.desks} id="house-desks" aria-labelledby="house-desks-title">
      <div className={foyerStyles.sectionIntro}>
        <p className={foyerStyles.kicker}>THE DESKS</p>
        <h2 id="house-desks-title">Meet the brokers.</h2>
      </div>
      {tape.length > 0 && (
        <div className={foyerStyles.deskCards}>
          {tape.map(desk => (
            <DeskCard key={desk.id} desk={desk} deskHref={deskHref} onOpen={onOpen} />
          ))}
        </div>
      )}
      {launch.map(desk => (
        <LaunchPlate key={desk.id} desk={desk} deskHref={deskHref} onOpen={onOpen} />
      ))}
    </section>
  );
}
