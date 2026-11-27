import { useMemo, useState } from 'react';
import { topicTheme, type PublicState } from '../../../../shared/game';
import { useLanguage, useStrings } from '../../i18n/strings';
import { type ReviewPanel } from './Results';
import { InfoDialog } from '../../components/InfoDialog';
import { SolutionDetails, AnswerReview } from './AnswerReview';
import { ChessBoard } from '../game/board/ChessBoard';
import { TopicArt } from '../game/board/TopicArt';

export function MatchReviewDialog({
  panel,
  review,
  close,
}: {
  panel: ReviewPanel;
  review: NonNullable<PublicState['matchReview']>;
  close: () => void;
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const [index, setIndex] = useState(0);
  const personal = panel === 'answers';
  const answers = useMemo(
    () =>
      review.answers
        .slice()
        .reverse()
        .sort((a, b) => Number(a.outcome === 'correct') - Number(b.outcome === 'correct')),
    [review.answers],
  );
  const items = personal ? answers : review.recap;
  const answer = personal ? answers[index] : undefined;
  const solution = items[index];
  const copy = language === 'en' ? solution?.english : solution;

  return (
    <InfoDialog title={s.matchReview[panel]} close={close}>
      {solution ? (
        <div className="match-review-content" data-topic={topicTheme(review.topic)}>
          <div className="match-review-controls">
            <button
              className="action secondary"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              {s.howToBack}
            </button>
            <span aria-live="polite">{s.matchReview.position(index + 1, items.length)}</span>
            <button
              className="action secondary"
              disabled={index + 1 >= items.length}
              onClick={() => setIndex(index + 1)}
            >
              {s.howToNext}
            </button>
          </div>
          {answer ? (
            <AnswerReview
              result={answer}
              topic={review.topic}
              name={s.you}
              mine
              placement="panel"
            />
          ) : (
            <article className="recap-question" key={solution.id}>
              <div className="question-prompt with-diagram">
                {!solution.chess && (
                  <div
                    className={review.topic === 'polygons' ? 'question-diagram' : 'question-emblem'}
                  >
                    <TopicArt topic={review.topic} sides={solution.n} mark={solution.mark} />
                  </div>
                )}
                <h3>{copy?.text}</h3>
              </div>
              {solution.chess && <ChessBoard puzzle={solution.chess} />}
              <details className="recap-reveal">
                <summary>{s.matchReview.reveal}</summary>
                <SolutionDetails solution={solution} topic={review.topic} />
              </details>
            </article>
          )}
        </div>
      ) : (
        <p>{personal ? s.matchReview.noAnswers : s.matchReview.noRecap}</p>
      )}
    </InfoDialog>
  );
}
