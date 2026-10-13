import type { Metadata } from 'next';
import Link from 'next/link';
import {
  STANDING_ELIGIBILITY,
  STANDING_UNANSWERED,
  standingCapability,
} from '@/lib/desk/standing';
import styles from './Stand.module.css';

export const metadata: Metadata = {
  title: 'What Claflin is, and is not',
  description:
    'Claflin is a demonstration, not a brokerage. What is paper, what can settle live, who it is for, and what it is not.',
  robots: { index: true, follow: true },
};

/**
 * The standing notice — what this is, before anyone reaches a desk.
 *
 * Every capability line is read from the same flags the desk code runs on
 * (see lib/desk/standing.ts), so this page cannot advertise a live path the
 * build does not have. Written to be true rather than reassuring: the
 * unresolved questions are printed, not smoothed over.
 */
export default function StandingPage() {
  const cap = standingCapability();

  return (
    <main className={styles.page}>
      <article className={styles.notice}>
        <p className={styles.eyebrow}>The standing notice</p>
        <h1>What Claflin is, and is not.</h1>
        <p className={styles.standfirst}>
          Claflin is a demonstration of a voice-first brokerage desk. It is <strong>not a brokerage
          service</strong>, not investment advice, and not an offer to buy or sell anything. It does not
          take custody of your money, hold your positions, or make investment decisions for you.
        </p>

        <h2>Where your money is</h2>
        <p>
          Nothing is ever held for you. Instructions are executed from <strong>your own wallet</strong>,
          which pays its own fees and owns whatever it receives. Claflin holds no keys to your funds
          and cannot move them. If a trade happens, you signed it.
        </p>

        <h2>What is paper, and what can settle for real</h2>
        <p>
          Every desk estimates against real market data — real venue books, real oracle marks. Filing
          a record on a paper path writes a local simulation to your own browser and never touches a
          network.
        </p>
        <p>
          {cap.liveDesks.length === 0 ? (
            <>As built today every desk is paper. Live settlement is built and switched off.</>
          ) : (
            <>
              On this deployment <strong>{cap.liveDesks.join(' and ')}</strong> can settle live
              {cap.jesseCaps ? <> — {cap.jesseCaps}</> : null}
              . Everything else is paper only. Each live path requires <em>two</em> independent
              server-side flags — one alone never enables real funds.
            </>
          )}
        </p>

        <h2>Who this is for</h2>
        <p>
          The instruments covered here are distributed under issuer terms that exclude the United
          States — tokenized stock certificates are {STANDING_ELIGIBILITY.headline}, and are
          restricted in other jurisdictions. That is the issuers&rsquo; distribution track, not a
          Claflin preference.
        </p>
        <p>
          Claflin does not determine your eligibility. The confirmation you may be asked for is a{' '}
          <strong>{STANDING_ELIGIBILITY.mechanism}</strong> stored in your browser — it is{' '}
          {STANDING_ELIGIBILITY.standing}, and clearing it is not a licence. Because those restrictions
          live off-chain and cannot be enforced by a blockchain, Claflin publishes them and asks you to
          honour them. It does not verify them and does not pretend to.
        </p>

        <h2>What we have not yet answered</h2>
        <ul>
          {STANDING_UNANSWERED.map((question, i) => (
            <li key={question}>
              {question}{' '}
              {i === 0 ? (
                <>
                  This is <strong>unresolved</strong> and under review. Until it is answered, no live
                  path is opened to customers.
                </>
              ) : i === 1 ? (
                <>Ask the issuer.</>
              ) : (
                <>Venue eligibility is a relationship you own, not something a successful quote implies.</>
              )}
            </li>
          ))}
        </ul>

        <h2>Records</h2>
        <p>
          Paper records live in your browser only — clearing site data deletes them, and they do not
          follow you to another device. Live trades leave evidence on-chain; that chain, not this
          application, is the authoritative record of what happened.
        </p>

        <hr className={styles.rule} />

        <p className={styles.foot}>
          Live capability on this build: <strong>{cap.verdict}</strong>. Paper-only desks:{' '}
          {cap.paperDesks.join(', ')}. Not financial advice. Do your own research.
        </p>
        <p>
          <Link href="/" className={styles.back}>
            ← Back to the office
          </Link>
        </p>
      </article>
    </main>
  );
}