import type { QuestionTier, Topic } from '../../shared/game';
import { chess } from './banks/chessTrivia';
import { chessLineText, chessLines, chessPuzzles } from './banks/chessPuzzles';
import { worldHeritage } from './banks/worldHeritage';
import { usFounding } from './banks/usFounding';
import { spaceRace } from './banks/spaceRace';
import { shuffle } from './shuffle';
import type { Question } from './types';

const historyBanks = [worldHeritage, usFounding, spaceRace];
const banks = {
  chess,
  history: historyBanks.flat(),
  'world-heritage': worldHeritage,
  'us-founding': usFounding,
  'space-race': spaceRace,
};

const triviaTiers = [
  { easy: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 21], challenge: [11, 13, 14, 17, 22] },
  { easy: [0, 1, 2, 3, 4, 5, 7, 11, 16, 18, 19, 23], challenge: [8, 14, 17, 20, 21, 22] },
  { easy: [0, 1, 2, 3, 5, 6, 11, 12, 13, 14, 19, 20], challenge: [7, 9, 10, 18, 22, 23] },
  { easy: [0, 1, 2, 3, 4, 5, 9, 10, 11, 15, 17, 18], challenge: [7, 8, 13, 19, 21, 23] },
];

function triviaIndices(topic: keyof typeof banks, tier?: QuestionTier): number[] {
  if (!tier) return banks[topic].map((_, index) => index);
  if (topic === 'history')
    return historyBanks.flatMap((bank, group) => {
      const keys = ['world-heritage', 'us-founding', 'space-race'] as const;
      const offset = historyBanks.slice(0, group).reduce((sum, source) => sum + source.length, 0);
      return triviaIndices(keys[group], tier).map((index) => index + offset);
    });
  const lists =
    triviaTiers[['chess', 'world-heritage', 'us-founding', 'space-race'].indexOf(topic)];
  if (tier === 'easy') return lists.easy;
  if (tier === 'challenge') return lists.challenge;
  return banks[topic].flatMap((_, index) =>
    lists.easy.includes(index) || lists.challenge.includes(index) ? [] : [index],
  );
}

export function drawChessTrivia(remaining: number[], tier: QuestionTier) {
  return drawTopicQuestion(
    'chess',
    remaining.length ? remaining : shuffle(triviaIndices('chess', tier)),
    tier,
  );
}

function shuffledDeck(topic: keyof typeof banks, tier?: QuestionTier): number[] {
  if (topic === 'chess') {
    const puzzleCount = chessPuzzles.length + chessLines.length;
    const puzzles = shuffle(
      Array.from({ length: puzzleCount }, (_, index) => index)
        .filter(
          (index) =>
            !tier ||
            (tier === 'easy'
              ? index < chessPuzzles.length
              : tier === 'hard'
                ? index >= chessPuzzles.length && index < chessPuzzles.length + 6
                : index >= chessPuzzles.length + 6),
        )
        .map((index) => chess.length + index),
    );
    if (tier === 'challenge') return puzzles;
    const trivia = shuffle(triviaIndices('chess', tier)).slice(0, Math.ceil(puzzles.length / 3));
    return trivia.flatMap((index, group) => [...puzzles.slice(group * 3, group * 3 + 3), index]);
  }
  if (topic !== 'history' || tier) return shuffle(triviaIndices(topic, tier));
  let offset = 0;
  const sample = historyBanks.flatMap((bank) => {
    const indices = bank.map((_, index) => offset + index);
    offset += bank.length;
    return shuffle(indices).slice(0, 8);
  });
  return shuffle(sample);
}

export function drawTopicQuestion(
  topic: Exclude<Topic, 'polygons'>,
  remaining: number[],
  tier?: QuestionTier,
): { question: Question; deck: number[] } {
  const bank = banks[topic];
  const [index, ...deck] = remaining.length ? remaining : shuffledDeck(topic, tier);
  if (topic === 'chess' && index >= chess.length + chessPuzzles.length) {
    const [goal, turn, start, reply, followup, explanation, englishExplanation] =
      chessLines[index - chess.length - chessPuzzles.length];
    const [position, legalMoves, solution] = start;
    const [nextPosition, nextLegalMoves, nextSolution] = followup;
    const options = legalMoves.split(' ');
    const nextOptions = nextLegalMoves.split(' ');
    const {
      es: [text, hint],
      en: [englishText, englishHint],
    } = chessLineText[goal];
    return {
      question: {
        text,
        hint,
        explanation,
        options,
        english: {
          text: englishText,
          hint: englishHint,
          explanation: englishExplanation,
          options,
        },
        correct: options.indexOf(solution),
        mark: 'none',
        chess: { position, turn },
        chessLine: {
          reply,
          position: nextPosition,
          options: nextOptions,
          correct: nextOptions.indexOf(nextSolution),
        },
      },
      deck,
    };
  }
  if (topic === 'chess' && index >= chess.length) {
    const [turn, position, solution, legalMoves, explanation, englishExplanation] =
      chessPuzzles[index - chess.length];
    const options = legalMoves.split(' ');
    return {
      question: {
        text: '¿Mate en una jugada?',
        hint: 'Buscá un jaque que el rival no pueda evitar con ninguna respuesta.',
        explanation,
        options,
        english: {
          text: 'Mate in one?',
          hint: 'Look for a check the opponent cannot escape.',
          explanation: englishExplanation,
          options,
        },
        correct: options.indexOf(solution),
        mark: 'none',
        chess: { position, turn },
      },
      deck,
    };
  }
  const order = shuffle([0, 1, 2, 3]);
  const [spanish, english] = bank[index].map(([text, hint, explanation, ...answers]) => ({
    text,
    hint,
    explanation,
    options: order.map((option) => answers[option]),
  }));
  return {
    question: { ...spanish, english, correct: order.indexOf(0), mark: 'none' },
    deck,
  };
}
