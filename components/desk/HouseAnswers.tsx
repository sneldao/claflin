import { FOYER_ANSWERS } from '@/lib/desk/foyer-answers';
import foyerStyles from './HouseFoyer.module.css';

/** Questions callers ask — native disclosure, readable without script. */
export function HouseAnswers() {
  return (
    <section className={foyerStyles.answers} id="house-answers" aria-labelledby="house-answers-title">
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
    </section>
  );
}
