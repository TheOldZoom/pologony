import { useId, type CSSProperties } from 'react';
import { Check, X } from 'lucide-react';
import {
  type AnswerResult,
  type Language,
  type QuestionSolution,
  type Topic,
} from '../../../../shared/game';
import { useLanguage, useStrings, type Strings } from '../../i18n/strings';
import { chessMoveLabel, ChessBoard } from '../game/board/ChessBoard';
import { TopicArt } from '../game/board/TopicArt';

export function correctAnswerText(s: Strings, language: Language, result: AnswerResult) {
  const copy = language === 'en' ? result.english : result;
  const answer = copy.options[result.correct];
  if (!result.chess) return answer;
  return chessMoveLabel(s, answer);
}

export function answerOutcome(s: Strings, result: AnswerResult, name: string) {
  if (result.outcome === 'timeout') return s.resultTimeout(name);
  return result.outcome === 'correct' ? s.resultCorrect(name) : s.resultIncorrect(name);
}

export function SolutionDetails({
  solution,
  topic,
  attempt,
  attemptLabel,
}: {
  solution: QuestionSolution;
  topic: Topic;
  attempt?: AnswerResult;
  attemptLabel?: string;
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const copy = language === 'en' ? solution.english : solution;
  const line = solution.chessLine;
  const wrongAnswer = attempt && attempt.chosen !== solution.correct ? attempt.chosen : -1;
  const displayedOptions =
    solution.chess || !attempt
      ? [solution.correct, ...(wrongAnswer >= 0 ? [wrongAnswer] : [])]
      : copy.options.map((_, index) => index);
  const move = (value: string) => chessMoveLabel(s, value);
  const attemptedMoves =
    line && attempt && attempt.outcome !== 'correct' && attempt.chosen >= 0
      ? (attempt.chessAttempt ??
        (attempt.chosen === solution.correct
          ? [line[0], line[1], ...(attempt.chessFollowup ? [attempt.chessFollowup] : [])]
          : [copy.options[attempt.chosen]]))
      : [];

  return (
    <>
      <ul className="answer-grid result-options">
        {line ? (
          <>
            <li className="correct">
              <span className="answer-result-label">
                <Check className="inline-icon" aria-hidden="true" /> {s.matchReview.line}
              </span>
              <strong>{line.map(move).join(' · ')}</strong>
            </li>
            {attemptedMoves.length > 0 && (
              <li className="wrong">
                <span className="answer-result-label">
                  <X className="inline-icon" aria-hidden="true" /> {attemptLabel}
                </span>
                <strong>{attemptedMoves.map(move).join(' · ')}</strong>
              </li>
            )}
          </>
        ) : (
          displayedOptions.map((index) => {
            const correct = index === solution.correct;
            const wrong = index === wrongAnswer;
            const Icon = correct ? Check : X;
            return (
              <li key={index} className={correct ? 'correct' : wrong ? 'wrong' : undefined}>
                {(correct || wrong) && (
                  <span className="answer-result-label">
                    <Icon className="inline-icon" aria-hidden="true" />{' '}
                    {correct ? s.correctAnswer : attemptLabel}
                  </span>
                )}
                <strong>{solution.chess ? move(copy.options[index]) : copy.options[index]}</strong>
              </li>
            );
          })
        )}
      </ul>
      <div className="worked-solution">
        <h3>{topic === 'polygons' ? s.workedSolution : s.explanation}</h3>
        <p className="explanation">{copy.explanation}</p>
        {solution.lichessId && (
          <a className="lichess-link" href={`https://lichess.org/training/${solution.lichessId}`}>
            {s.classroom.lichess}
          </a>
        )}
      </div>
    </>
  );
}

export function AnswerReview({
  result,
  topic,
  name,
  mine,
  color,
  dismiss,
  placement = 'popover',
}: {
  result: AnswerResult;
  topic: Topic;
  name: string;
  mine: boolean;
  color?: string;
  dismiss?: () => void;
  placement?: 'popover' | 'panel';
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const copy = language === 'en' ? result.english : result;
  const titleId = useId();
  const chess = result.chess;
  const attemptLabel = result.chessLine
    ? mine
      ? s.matchReview.yourMoves
      : s.matchReview.playerMoves(name)
    : mine
      ? s.yourAnswer
      : s.playerAnswer(name);
  return (
    <section
      className={`question-card answer-review${mine ? '' : ' watch-question'}${dismiss && placement === 'popover' ? ' answer-popover' : ''}`}
      aria-labelledby={titleId}
      aria-live={dismiss ? 'polite' : undefined}
      style={mine && color ? ({ '--turn-color': color } as CSSProperties) : undefined}
    >
      <header className="question-ribbon review-ribbon">
        <div>
          <strong id={titleId}>{answerOutcome(s, result, name)}</strong>
          {chess && <h2>{copy.text}</h2>}
        </div>
        {dismiss && (
          <button className="action secondary close" aria-label={s.close} onClick={dismiss}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="question-body">
        {chess ? (
          <ChessBoard
            puzzle={chess}
            solution={result.chessLine ? undefined : copy.options[result.correct]}
          />
        ) : (
          <div className="question-prompt with-diagram">
            <div className={topic === 'polygons' ? 'question-diagram' : 'question-emblem'}>
              <TopicArt topic={topic} sides={result.n} mark={result.mark} />
            </div>
            <h2>{copy.text}</h2>
          </div>
        )}
        <SolutionDetails
          solution={result}
          topic={topic}
          attempt={result}
          attemptLabel={attemptLabel}
        />
      </div>
    </section>
  );
}
