'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import type { HouseDeskId } from '@/lib/house';
import type { InstrumentOffering } from '@/lib/desk/contracts';
import {
  mandateLabel,
  offeringCapabilityText,
  offeringGroupsForInstruction,
  openDesksForOffering,
  railLabel,
  venueLabel,
} from '@/lib/desk/offerings-presentation';
import foyerStyles from './HouseFoyer.module.css';

function offeringHref(offering: InstrumentOffering, deskId: HouseDeskId): string {
  return `/?desk=${deskId}&offering=${encodeURIComponent(offering.offeringId)}`;
}

/**
 * The house book: instruction first, then concrete offerings and only the
 * desks that can actually carry each product/rail/venue combination.
 */
export function HouseOfferings({ onEnter }: { onEnter: (id: HouseDeskId, offeringId?: string) => void }) {
  const [instruction, setInstruction] = useState('');
  const groups = useMemo(() => offeringGroupsForInstruction(instruction), [instruction]);

  const enter = (offering: InstrumentOffering, deskId: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'instant' });
    onEnter(deskId, offering.offeringId);
  };

  return (
    <section className={foyerStyles.offerings} id="house-offerings" aria-labelledby="house-offerings-title">
      <div className={foyerStyles.offeringsIntro}>
        <p className={foyerStyles.kicker}>THE HOUSE BOOK</p>
        <h2 id="house-offerings-title">Choose the product first.</h2>
        <p>
          Name the exposure in your own words. Claflin shows the verified offerings,
          the rail each settles on, and only the desks that can carry it. Similar
          products on different rails are never substituted for one another.
        </p>
        <label className={foyerStyles.instructionSearch}>
          <span>What would you like to review?</span>
          <input
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
            placeholder="Try “buy Apple for 100 USDC”"
            autoComplete="off"
          />
        </label>
      </div>

      <div className={foyerStyles.offeringGroups} aria-live="polite">
        {groups.length === 0 && (
          <p className={foyerStyles.noOfferings} role="status">
            No verified offering matches that instruction yet. Try a ticker or company name.
          </p>
        )}
        {groups.map(group => (
          <article key={group.productId} className={foyerStyles.productGroup}>
            <header className={foyerStyles.productHeading}>
              <span>{group.underlyingSymbol}</span>
              <small>
                {group.offerings.length === 1 ? 'One verified offering' : `${group.offerings.length} verified offerings`}
              </small>
            </header>
            <div className={foyerStyles.offeringCards}>
              {group.offerings.map(offering => {
                const desks = openDesksForOffering(offering);
                return (
                  <section key={offering.offeringId} className={foyerStyles.offeringCard}>
                    <p className={foyerStyles.offeringSymbol}>{offering.symbol}</p>
                    <h3>{offering.name}</h3>
                    <dl className={foyerStyles.offeringFacts}>
                      <div>
                        <dt>Product</dt>
                        <dd>{mandateLabel(offering)}</dd>
                      </div>
                      <div>
                        <dt>Issuer</dt>
                        <dd>{offering.issuer ?? 'Issuer pending verification'}</dd>
                      </div>
                      <div>
                        <dt>Settles</dt>
                        <dd>{railLabel(offering.rail)}</dd>
                      </div>
                      <div>
                        <dt>Venue</dt>
                        <dd>{venueLabel(offering.venue)}</dd>
                      </div>
                      <div>
                        <dt>Quote</dt>
                        <dd>{offering.quoteAsset ?? 'Pending'}</dd>
                      </div>
                    </dl>
                    <p className={foyerStyles.offeringNote}>
                      {offeringCapabilityText(offering, desks.map(desk => desk.id))}
                      {desks.length > 1 ? ' · choose your desk' : ''}
                    </p>
                    {desks.length > 0 ? (
                      <div className={foyerStyles.offeringDesks}>
                        {desks.map(desk => (
                          <a
                            key={desk.id}
                            href={offeringHref(offering, desk.id)}
                            aria-label={`Open ${desk.shortName}’s desk for ${offering.symbol}`}
                            onClick={enter(offering, desk.id)}
                          >
                            Open {desk.shortName}’s desk
                            <ArrowRight size={13} aria-hidden="true" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className={foyerStyles.offeringClosed}>No open desk can quote this offering.</p>
                    )}
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
