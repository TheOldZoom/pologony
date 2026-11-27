import { useEffect, useState, type ReactNode } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import {
  HINT_PRICE,
  TILES,
  tileRent,
  type Player,
  type PublicQuestion,
  type PublicState,
  type Topic,
} from '../../../../shared/game';
import { useLanguage, useStrings, type Strings } from '../../i18n/strings';
import { chessMoveLabel, ChessBoard } from './board/ChessBoard';
import { TopicArt } from './board/TopicArt';

export function questionStakes(
  s: Strings,
  question: PublicQuestion,
  state: PublicState,
  mine: boolean,
): [string, string] {
  const tile = TILES[question.tile];
  const player = mine ? undefined : state.players[state.turn].name;
  switch (question.kind) {
    case 'buy':
      return [s.stakes.buyRight(s.money(tile.price!), player), s.stakes.buyWrong(player)];
    case 'upgrade':
      return [s.classroom.upgradeRight, s.classroom.upgradeWrong];
    case 'rest':
      return [s.classroom.restRight, s.classroom.restWrong];
    case 'rent': {
      const owner = state.players.find(({ id }) => id === state.owners[question.tile]);
      const rent = tileRent(question.tile, state.upgrades);
      return [
        s.stakes.rentRight(s.money(Math.round(rent * 50) / 100), player),
        s.stakes.rentWrong(s.money(rent), owner?.name, player),
      ];
    }
    case 'chance':
      return [s.stakes.chanceRight, s.stakes.chanceWrong];
  }
}

function Stakes({ lines }: { lines: [string, string] }) {
  return (
    <p className="stakes">
      <span className="right-stake">
        <Check className="inline-icon" aria-hidden="true" /> {lines[0]}
      </span>
      <span className="wrong-stake">
        <X className="inline-icon" aria-hidden="true" /> {lines[1]}
      </span>
    </p>
  );
}

export function QuestionSheet({
  question,
  topic,
  player,
  mine,
  actionable,
  failed,
  stakes,
  timeLeft,
  urgent,
  submitAnswer,
  buyHint,
  rollControls,
}: {
  question: PublicQuestion;
  topic: Topic;
  player: Player;
  mine: boolean;
  actionable: boolean;
  failed: boolean;
  stakes: [string, string];
  timeLeft: number;
  urgent: boolean;
  submitAnswer: (index: number) => boolean;
  buyHint: () => void;
  rollControls: ReactNode;
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const copy = language === 'en' ? question.english : question;
  const [selection, select] = useState<number>();
  const [promotion, setPromotion] = useState<number[]>();
  const [sent, markSent] = useState(false);
  useEffect(() => {
    if (failed) markSent(false);
  }, [failed]);
  const disabled = !actionable || sent;
  const chess = question.chess;

  return (
    <section
      className={`game-sheet question-card question-sheet ${mine ? 'my-question' : 'watch-question'}${chess ? ' chess-question' : ''}`}
      data-chess-step={chess?.step}
      aria-labelledby="question-title"
    >
      <header className="question-ribbon">
        <div>
          <strong>{mine ? s.yourQuestion : s.theirQuestion(player.name)}</strong>
          {chess && <h2 id="question-title">{copy.text}</h2>}
        </div>
        {chess && (
          <div className="chess-turn">
            <span>{s.chessPuzzle.toMove[chess.turn]}</span>
            {chess.step && <strong>{s.chessPuzzle.step(chess.step, chess.totalSteps)}</strong>}
            {(mine || chess.lastReply) && (
              <span aria-live="polite">
                {selection !== undefined
                  ? chessMoveLabel(s, copy.options[selection])
                  : chess.lastReply
                    ? s.chessPuzzle.reply(chessMoveLabel(s, chess.lastReply))
                    : ''}
              </span>
            )}
          </div>
        )}
      </header>
      <div className="question-body">
        {chess ? (
          <ChessBoard
            puzzle={chess}
            moves={mine ? copy.options : undefined}
            selected={selection}
            select={
              mine && !disabled
                ? (index) => {
                    setPromotion(undefined);
                    select(index);
                  }
                : undefined
            }
            choosePromotion={(indices) => {
              select(undefined);
              setPromotion(indices);
            }}
          />
        ) : (
          <div className="question-prompt with-diagram">
            <div className={topic === 'polygons' ? 'question-diagram' : 'question-emblem'}>
              <TopicArt topic={topic} sides={question.n} mark={question.mark} />
            </div>
            <h2 id="question-title">{copy.text}</h2>
          </div>
        )}
        <div className={chess ? 'question-details chess-details' : 'question-details'}>
          <Stakes lines={stakes} />
          {chess && !mine && <p className="watch-note">{s.watchOnly(player.name)}</p>}
        </div>
        {!chess &&
          (mine ? (
            <div className="answer-grid">
              {copy.options.map((option, index) => (
                <button
                  className="action answer"
                  key={option}
                  disabled={disabled}
                  aria-pressed={selection === index}
                  onClick={() => select(index)}
                >
                  {selection === index && (
                    <>
                      <Check className="inline-icon" aria-hidden="true" />{' '}
                    </>
                  )}
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <ul className="answer-grid watch-options">
              {copy.options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ul>
          ))}
        {!chess && !mine && <p className="watch-note">{s.watchOnly(player.name)}</p>}
      </div>
      <div className="question-actions">
        <div className="question-roll">{rollControls}</div>
        {mine && (
          <div className="answer-controls">
            <button
              className="action primary lock-answer"
              disabled={disabled || selection === undefined}
              onClick={() => {
                if (selection !== undefined && submitAnswer(selection)) markSent(true);
              }}
            >
              {sent
                ? s.answerSent
                : chess && selection === undefined
                  ? s.chessPuzzle.chooseMove
                  : s.lockAnswer}
            </button>
            {question.hintAvailable && !question.hintRevealed && (
              <button
                className="action secondary buy-hint"
                disabled={disabled || player.cash < HINT_PRICE}
                onClick={buyHint}
              >
                <Lightbulb size={16} aria-hidden="true" />
                {s.classroom.buyHint(s.money(HINT_PRICE))}
              </button>
            )}
          </div>
        )}
        {promotion && (
          <div className="promotion-choice" role="group" aria-label={s.classroom.promotions}>
            {promotion.map((index) => {
              const piece = copy.options[index][4] as keyof Strings['classroom']['promotion'];
              return (
                <button
                  key={index}
                  className="action secondary"
                  disabled={disabled}
                  onClick={() => {
                    select(index);
                    setPromotion(undefined);
                  }}
                >
                  {s.classroom.promotion[piece]}
                </button>
              );
            })}
          </div>
        )}
        {question.hintRevealed && (
          <p className="question-hint">
            <Lightbulb className="inline-icon" aria-hidden="true" /> {copy.hint}
          </p>
        )}
      </div>
      <div className={`question-timer${urgent ? ' urgent' : ''}`} aria-hidden="true">
        <span style={{ transform: `scaleX(${timeLeft})` }} />
      </div>
    </section>
  );
}
