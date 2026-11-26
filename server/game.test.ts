import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS, isGameSettings, type Topic } from '../shared/game';
import * as game from './game';
import { makeQuestion } from './questions';
import { drawTopicQuestion } from './topicQuestions';

function setup(topic: Topic = 'chess') {
  let room = game.newRoom('ABCD', 'host', 'projector');
  for (const id of ['alba', 'bruno', 'cora']) room = game.addPlayer(room, id, id);
  return {
    ...room,
    settings: { topic, matchMinutes: 8, rollSeconds: 12, questionSeconds: 14, buySeconds: 7 },
  };
}

function chessQuestionIndex(multimove: boolean): number {
  return drawTopicQuestion('chess', []).deck.find((index) => {
    const { question } = drawTopicQuestion('chess', [index]);
    return question.chess && Boolean(question.chessLine) === multimove;
  })!;
}

describe('room settings and questions', () => {
  test('rejects unknown topics, fractional timers, and out-of-range values', () => {
    expect(isGameSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isGameSettings({ ...DEFAULT_SETTINGS, topic: 'toString' })).toBe(false);
    for (const topic of ['math', 'history-category', 'Math', 'History']) {
      expect(isGameSettings({ ...DEFAULT_SETTINGS, topic })).toBe(false);
    }
    expect(isGameSettings({ ...DEFAULT_SETTINGS, matchMinutes: 4 })).toBe(false);
    expect(isGameSettings({ ...DEFAULT_SETTINGS, rollSeconds: 5.5 })).toBe(false);
    expect(isGameSettings({ ...DEFAULT_SETTINGS, questionSeconds: '60' })).toBe(false);
    expect(isGameSettings({ ...DEFAULT_SETTINGS, buySeconds: 121 })).toBe(false);
  });

  test('uses all room timers and keeps the answer private until resolution', () => {
    const started = game.start({ ...setup(), questionDeck: [chessQuestionIndex(false)] }, 100);
    expect(started.deadline).toBe(12_100);
    expect(started.endsAt).toBe(480_100);

    const rolled = game.roll(started, 200, [1, 2], 3);
    expect(rolled.phase).toBe('question');
    expect(rolled.deadline).toBe(14_200);
    const state = game.publicState(rolled, 200);
    expect(state).not.toHaveProperty('questionDeck');
    expect(state.question).not.toHaveProperty('correct');
    expect(state.question).not.toHaveProperty('explanation');
    expect(state.question).not.toHaveProperty('n');
    expect(state.question?.chess).toEqual(rolled.question?.chess);
    expect(state.question?.options.length).toBeGreaterThan(4);
    expect(state.question?.english).not.toHaveProperty('correct');
    expect(state.question?.english).not.toHaveProperty('explanation');
    expect(state.question?.english.options).toEqual(state.question?.options);

    const answered = game.answer(rolled, 300, rolled.question!.correct);
    expect(answered.result!.chosen).toBe(answered.result!.correct);
    expect(answered.result?.chess).toEqual(state.question?.chess);
    expect(answered.result?.english.explanation).not.toBe('');
    expect(answered.phase).toBe('buy');
    expect(answered.deadline).toBe(7_300);

    const bought = game.buy(answered, 400);
    expect(bought.owners[3]).toBe('alba');
    expect(bought.deadline).toBe(12_400);
    expect(bought.version).toBe(started.version + 3);
  });

  const subjects = ['world-heritage', 'us-founding', 'space-race'] as const;

  function drawDeck(topic: Exclude<Topic, 'polygons'>) {
    let remaining: number[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < 24; index++) {
      const { question, deck } = drawTopicQuestion(topic, remaining);
      expect(seen.has(question.text)).toBe(false);
      expect(question.text).toMatch(/¿.*\?$/);
      expect(question.hint).not.toBe('');
      expect(question.explanation).not.toBe('');
      expect(new Set(question.options).size).toBe(4);
      expect(question.options[question.correct]).toBeDefined();
      expect(question.english.text).toMatch(/\?$/);
      expect(question.english.text).not.toContain('¿');
      expect(question.english.hint).not.toBe('');
      expect(question.english.explanation).not.toBe('');
      expect(new Set(question.english.options).size).toBe(4);
      expect(question.english.options[question.correct]).toBeDefined();
      seen.add(question.text);
      remaining = deck;
    }
    expect(remaining).toHaveLength(0);
    return seen;
  }

  test('keeps the same generated polygon answers in both languages', () => {
    for (let n = 3; n <= 12; n++) {
      for (let count = 0; count < 40; count++) {
        const question = makeQuestion(n);
        expect(question.english.text).not.toBe(question.text);
        expect(question.english.text).not.toContain('¿');
        expect(question.english.hint).not.toBe(question.hint);
        expect(question.english.options).toEqual(
          question.options.map((option) => option.replace(',', '.')),
        );
        expect(question.english.options[question.correct]).toBeDefined();
      }
    }
  });

  for (const topic of subjects) {
    test(`uses 24 unique ${topic} questions before refilling the deck`, () => {
      expect(drawDeck(topic)).toEqual(drawDeck(topic));
    });
  }

  test('uses 36 unique chess puzzles and 12 trivia questions in each deck', () => {
    let remaining: number[] = [];
    const seen = new Set<string>();
    const fullLines = new Map<string, number>();
    for (let index = 0; index < 48; index++) {
      const { question, deck } = drawTopicQuestion('chess', remaining);
      if (index % 4 === 3) {
        expect(question.chess).toBeUndefined();
        expect(question.options).toHaveLength(4);
      } else {
        expect(question.chess?.position.split('/')).toHaveLength(8);
        expect(question.options.length).toBeGreaterThan(4);
        for (const move of question.options) expect(move).toMatch(/^[a-h][1-8][a-h][1-8]$/);
        if (question.chessLine) {
          const { correct, options } = question.chessLine;
          expect(options[correct]).toMatch(/^[a-h][1-8][a-h][1-8]$/);
          fullLines.set(question.english.text, (fullLines.get(question.english.text) ?? 0) + 1);
        }
      }
      const key = question.chess?.position ?? question.text;
      expect(seen.has(key)).toBe(false);
      expect(new Set(question.options).size).toBe(question.options.length);
      expect(question.options[question.correct]).toBeDefined();
      seen.add(key);
      remaining = deck;
    }
    expect(remaining).toHaveLength(0);
    expect(Object.fromEntries(fullLines)).toEqual({
      'Mate in two': 6,
      'Fork the king and queen': 3,
      'Pin and capture the piece': 3,
    });
  });

  test('keeps one deadline and only resolves a chess line on the last move, a mistake, or timeout', () => {
    const started = game.start({ ...setup(), questionDeck: [chessQuestionIndex(true)] }, 100);
    const rolled = game.roll(started, 200, [1, 1], 3);
    const initial = game.publicState(rolled, 200);
    const { correct, chessLine } = rolled.question!;
    expect(initial.question?.chess?.step).toBe(1);
    expect(initial.question).not.toHaveProperty('chessLine');
    expect(initial.result).toBeUndefined();
    const followup = game.answer(rolled, 300, correct);
    const state = game.publicState(followup, 300);
    expect(state.question?.chess).toMatchObject({ step: 2, position: chessLine!.position });
    expect(state.question?.options).toEqual(chessLine!.options);
    expect(state.question).not.toHaveProperty('correct');
    expect(state.deadline).toBe(initial.deadline);
    expect(state.version).toBe(initial.version + 1);
    expect(state.result).toBeUndefined();
    expect(followup.answers).toHaveLength(0);
    const solved = game.answer(followup, 400, chessLine!.correct);
    expect(solved.result?.outcome).toBe('correct');
    expect(solved.result?.chessLine).toHaveLength(3);
    expect(solved.players[0].cash).toBe(1600);
    expect(solved.answers).toHaveLength(1);

    const wrongFirst = game.answer(rolled, 300, (correct + 1) % rolled.question!.options.length);
    const wrongLast = game.answer(
      followup,
      400,
      (chessLine!.correct + 1) % chessLine!.options.length,
    );
    const timeout = game.answer(followup, 400);
    expect(wrongFirst.result?.outcome).toBe('incorrect');
    expect(wrongLast.result?.outcome).toBe('incorrect');
    expect(wrongLast.result?.chessFollowup).toBeDefined();
    expect(timeout.result?.outcome).toBe('timeout');
    for (const result of [wrongFirst, wrongLast, timeout]) {
      expect(result.phase).toBe('roll');
      expect(result.players[0].cash).toBe(1450);
      expect(result.answers).toHaveLength(1);
    }
  });

  test('keeps answer reviews private and retains the anonymous recap until the rematch starts', () => {
    const started = game.start(setup('polygons'), 100);
    const firstQuestion = game.roll(started, 200, [1, 2], 3);
    const first = game.buy(game.answer(firstQuestion, 300, firstQuestion.question!.correct), 400);
    const second = game.answer(game.roll(first, 500, [1, 1], 8), 600);
    const finished = game.finish(second);
    const alba = game.publicState(finished, 700, 'alba');
    const bruno = game.publicState(finished, 700, 'bruno');
    const host = game.publicState(finished, 700, 'host');
    expect(alba.matchReview?.answers.map(({ playerId }) => playerId)).toEqual(['alba']);
    expect(bruno.matchReview?.answers.map(({ playerId }) => playerId)).toEqual(['bruno']);
    expect(host.matchReview?.answers).toEqual([]);
    expect(alba.result).toBeUndefined();
    expect(host.matchReview?.recap[0].id).toBe(second.result?.id);
    expect(
      host.matchReview?.recap.every((item) => !('playerId' in item) && !('chosen' in item)),
    ).toBe(true);

    const lobby = game.rematch(finished);
    expect(lobby.phase).toBe('lobby');
    expect(lobby.code).toBe(finished.code);
    expect(lobby.hostId).toBe(finished.hostId);
    expect(lobby.settings).toEqual(finished.settings);
    expect(lobby.players.map(({ id, avatar }) => [id, avatar])).toEqual(
      finished.players.map(({ id, avatar }) => [id, avatar]),
    );
    expect(lobby.players.every(({ cash, pos }) => cash === 1500 && pos === 0)).toBe(true);
    expect(lobby.owners).toEqual({});
    expect(lobby.standings).toBeUndefined();
    expect(lobby.endsAt).toBeUndefined();
    expect(lobby.version).toBeGreaterThan(finished.version);
    expect(lobby.events.at(-1)!.id).toBeGreaterThan(finished.events.at(-1)!.id);
    expect(game.publicState(lobby, 800, 'alba').matchReview).toEqual(alba.matchReview);
    expect(game.publicState(game.start(lobby, 900), 900, 'alba').matchReview).toBeUndefined();
  });

  test('draws eight questions from each History subject in each General History cycle', () => {
    const subjectQuestions = subjects.map(drawDeck);
    expect(new Set(subjectQuestions.flatMap((questions) => [...questions])).size).toBe(72);
    for (let cycle = 0; cycle < 2; cycle++) {
      const general = [...drawDeck('history')];
      for (const questions of subjectQuestions) {
        expect(general.filter((question) => questions.has(question))).toHaveLength(8);
      }
    }
  });
});

describe('voluntary departures', () => {
  test('transfers a friends room to the longest-seated connected player, then to an offline seat', () => {
    let room = game.newRoom('ABCD', 'alba', 'friends');
    for (const id of ['alba', 'bruno', 'cora', 'diego']) room = game.addPlayer(room, id, id);
    room = game.setConnected(room, 'bruno', false);
    room = game.removePlayer(room, 'alba', 100, 'voluntary');
    expect(room.hostId).toBe('cora');
    room = game.setConnected(room, 'diego', false);
    room = game.removePlayer(room, 'cora', 200, 'voluntary');
    expect(room.hostId).toBe('bruno');
    expect(room.players.map(({ id }) => id)).toEqual(['bruno', 'diego']);
  });

  test('forfeiting an active question releases the player’s properties and finishes at one seat', () => {
    let room = game.removePlayer(setup(), 'cora', 50);
    room = { ...game.start(room, 100), owners: { 5: 'alba', 6: 'bruno' } };
    room = game.roll(room, 200, [1, 2], 3);
    expect(room.phase).toBe('question');
    const over = game.removePlayer(room, 'alba', 300, 'voluntary');
    expect(over.phase).toBe('over');
    expect(over.question).toBeUndefined();
    expect(over.result).toBeUndefined();
    expect(over.owners).toEqual({ 6: 'bruno' });
    expect(over.standings?.map(({ player }) => player.id)).toEqual(['bruno']);
  });

  test('leaving after the match releases properties and preserves final standings', () => {
    const room = { ...game.start(setup(), 100), owners: { 3: 'alba' } };
    const over = game.finish(room);
    const left = game.removePlayer(over, 'alba', 200, 'voluntary');
    expect(left.owners).toEqual({});
    expect(left.standings).toEqual(over.standings);
    expect(left.version).toBe(over.version);
  });
});

describe('projector moderation', () => {
  test('skipping chance keeps position and cash, while an unanswered question applies the loss', () => {
    const started = game.start(setup('history'), 100);
    const rolled = game.roll(started, 200, [1, 1], 3);
    expect(rolled.question?.kind).toBe('chance');

    const skipped = game.skipTurn(rolled, 300);
    expect(skipped.turn).toBe(1);
    expect(skipped.players[0]).toMatchObject({ pos: 2, cash: 1500 });
    expect(skipped.result).toBeUndefined();

    const timedOut = game.answer(rolled, 300);
    expect(timedOut.turn).toBe(1);
    expect(timedOut.players[0]).toMatchObject({ pos: 2, cash: 1450 });
    expect(timedOut.result?.chosen).toBe(-1);
  });

  test('removing a rent owner returns properties to the bank and advances the turn', () => {
    const started = { ...game.start(setup(), 100), owners: { 3: 'bruno', 5: 'bruno', 6: 'cora' } };
    const rolled = game.roll(started, 200, [1, 2], 3);
    expect(rolled.question?.kind).toBe('rent');

    const removed = game.removePlayer(rolled, 'bruno', 300);
    expect(removed.phase).toBe('roll');
    expect(removed.question).toBeUndefined();
    expect(removed.owners).toEqual({ 6: 'cora' });
    expect(removed.players[removed.turn].id).toBe('cora');
    expect(removed.players[0].cash).toBe(1500);
  });

  test('removing the active player picks the next seat and ends the match at one player', () => {
    const started = { ...game.start(setup(), 100), turn: 1 };
    const removed = game.removePlayer(started, 'bruno', 300);
    expect(removed.players[removed.turn].id).toBe('cora');
    expect(removed.version).toBe(started.version + 1);

    const over = game.removePlayer(removed, 'cora', 400);
    expect(over.phase).toBe('over');
    expect(over.players.map(({ id }) => id)).toEqual(['alba']);
  });

  test('removing an unrelated seat preserves the active question and deadline', () => {
    const started = { ...game.start(setup(), 100), turn: 1 };
    const rolled = game.roll(started, 200, [1, 2], 3);
    const removed = game.removePlayer(rolled, 'alba', 300);

    expect(removed.players[removed.turn].id).toBe('bruno');
    expect(removed.phase).toBe('question');
    expect(removed.deadline).toBe(rolled.deadline);
    expect(removed.version).toBe(rolled.version);
  });
});
