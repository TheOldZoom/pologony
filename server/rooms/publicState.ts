import type { PublicState } from '../../shared/game';
import { eligibleVoters } from './pause';
import { currentChoices, type Room } from './model';

export function publicState(room: Room, now: number, viewer?: string): PublicState {
  const {
    question,
    warnedOneMinute,
    questionDeck,
    upgradeDeck,
    customDeck,
    usedCustom,
    chessDaily,
    chessDraws,
    chessTrivia,
    spectators,
    pauseVote,
    pausedAt,
    answers,
    recap,
    result,
    ...state
  } = room;
  const voters = room.mode === 'projector' ? eligibleVoters(room) : [];
  const votes = voters.filter(({ id }) => pauseVote?.by.includes(id));
  const snapshot: PublicState = {
    ...state,
    now,
    ...(customDeck && { customQuestions: customDeck.length }),
    ...(viewer && spectators?.includes(viewer) && { watching: true }),
    ...(room.mode === 'projector' &&
      room.endsAt &&
      room.phase !== 'over' && {
        pause: {
          votes: votes.length,
          needed: Math.floor(voters.length / 2) + 1,
          expiresAt: pauseVote?.expiresAt,
          pausedAt,
          ...(votes.some(({ id }) => id === viewer) && { voted: true }),
        },
      }),
    ...(!recap && result && { result }),
    ...(recap && {
      matchReview: {
        topic: recap.topic,
        answers: viewer ? answers.filter((answer) => answer.playerId === viewer) : [],
        recap: recap.questions,
      },
    }),
  };
  if (!question) return snapshot;
  const {
    kind,
    tile,
    text,
    hint,
    n,
    mark,
    mystery,
    chess,
    chessLine,
    chessStepAt,
    chessStages,
    english,
  } = question;
  const { options } = currentChoices(question);
  const hintRevealed = room.players[room.turn].id === viewer && Boolean(question.hintBought);
  const stage = chessStages?.[question.stepIndex ?? 0];
  snapshot.question = {
    kind,
    tile,
    text,
    hint: hintRevealed ? hint || english.hint : '',
    options,
    hintAvailable: Boolean(hint || english.hint),
    ...(hintRevealed && { hintRevealed: true }),
    english: {
      text: english.text,
      hint: hintRevealed ? english.hint || hint : '',
      options: chessStepAt === undefined ? english.options : options,
    },
    mark,
    ...(mystery || n === undefined ? {} : { n }),
    ...(chess && {
      chess: stage
        ? {
            ...chess,
            position: stage.position,
            step: (question.stepIndex ?? 0) + 1,
            totalSteps: chessStages!.length,
            lastReply: stage.reply,
          }
        : chessLine
          ? chessStepAt === undefined
            ? { ...chess, step: 1 }
            : { ...chess, position: chessLine.position, step: 2, lastReply: chessLine.reply }
          : chess,
    }),
  };
  return snapshot;
}
