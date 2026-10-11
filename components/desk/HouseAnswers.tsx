import { FOYER_ANSWERS } from '@/lib/desk/foyer-answers';
import { QuoteColumn, type WireMark } from '../foyer/QuoteColumn';
import foyerStyles from './HouseFoyer.module.css';

/** Questions callers ask — native disclosure, readable without script.
    The right field carries the quotation column on wide tables. */
export function HouseAnswers({ marks = [] }: { marks?: WireMark[] }) {
  return (
    <section className={foyerStyles.answers} id="house-answers" aria-labelledby="house-answers-title">
      <div className={foyerStyles.answersBody}>
        <div>
          <div className={foyerStyles.sectionIntro}>
            <p className={foyerStyles.kicker}>STRAIGHT ANSWERS</p>
            <h2 id="house-answers-title">Questions callers ask.</h2>
          </div>
          <div className={foyerStyles.answerList}>
            {FOYER_ANSWERS.map(item => (
              <details key={item.id} className={foyerStyles.answer}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
        <QuoteColumn marks={marks} />
      </div>
    </section>
  );
}
