import { TILES, type PublicQuestion } from '../../shared/game';
import { lichessQuestion } from '../chess/cache';
import { makeQuestion } from '../questions/polygons/generator';
import { shuffle } from '../questions/shuffle';
import { drawChessTrivia, drawTopicQuestion } from '../questions/topicDeck';
import type { Question } from '../questions/types';
import { addEvent, type Room } from './model';

export function askQuestion(
  room: Room,
  now: number,
  kind: PublicQuestion['kind'],
  tileIndex: number,
  chanceSides: number,
): Room {
  const { topic, difficulty } = room.settings;
  const upgrade = kind === 'upgrade';
  const tier = upgrade ? (difficulty === 'hard' ? 'challenge' : 'hard') : difficulty;
  const deckKey = upgrade ? 'upgradeDeck' : 'questionDeck';
  const remaining = room[deckKey] ?? [];
  let question: Question;
  let deck = remaining;
  if (room.customDeck) {
    const matches = room.customDeck.flatMap((entry, index) =>
      entry.difficulty === (tier ?? 'easy') ? [index] : [],
    );
    const pool = matches.length ? matches : room.customDeck.map((_, index) => index);
    let used = new Set(room.usedCustom);
    let available = pool.filter((index) => !used.has(index));
    if (!available.length) {
      for (const index of pool) used.delete(index);
      available = pool;
    }
    const index = available[Math.floor(Math.random() * available.length)];
    used.add(index);
    room = { ...room, usedCustom: [...used] };
    question = room.customDeck![index];
  } else if (topic === 'polygons') {
    question = makeQuestion(TILES[tileIndex].n ?? chanceSides, tier);
  } else if (topic === 'chess' && room.chessDaily) {
    const count = room.chessDraws ?? 0;
    if (!upgrade && count % 4 === 3) {
      const trivia = drawChessTrivia(room.chessTrivia ?? [], tier ?? 'easy');
      room = { ...room, chessTrivia: trivia.deck };
      question = trivia.question;
    } else {
      const puzzles = room.chessDaily[tier ?? 'easy'];
      const [index, ...rest] = remaining.length ? remaining : shuffle(puzzles.map((_, i) => i));
      question = lichessQuestion(puzzles[index]);
      deck = rest;
    }
    if (!upgrade) room = { ...room, chessDraws: count + 1 };
  } else {
    ({ question, deck } = drawTopicQuestion(topic, remaining, tier));
  }
  const player = room.players[room.turn];
  return addEvent(
    {
      ...room,
      phase: 'question',
      version: room.version + 1,
      deadline: now + room.settings.questionSeconds * 1000,
      question: {
        ...question,
        kind,
        tile: tileIndex,
        ...(player.bot && {
          botMisses: Math.random() >= (room.settings.botDifficulty === 'hard' ? 0.8 : 0.45),
        }),
      },
      [deckKey]: deck,
    },
    {
      kind: 'question',
      player: player.id,
      tile: tileIndex,
      q: kind,
      ...(question.mystery && { mystery: true }),
    },
  );
}
