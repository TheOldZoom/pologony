import {
  AVATAR_IDS,
  DEFAULT_SETTINGS,
  TILES,
  netWorth,
  type AnswerResult,
  type AvatarId,
  type GameEvent,
  type Player,
  type PublicQuestion,
  type PublicState,
  type QuestionSolution,
  type RoomMode,
  type Topic,
} from '../shared/game';
import { makeQuestion, type Question } from './questions';
import { drawTopicQuestion } from './topicQuestions';

type PrivateQuestion = Question & Pick<PublicQuestion, 'kind' | 'tile'> & { chessStepAt?: number };
export type Room = Omit<PublicState, 'now' | 'question' | 'matchReview'> & {
  question?: PrivateQuestion;
  warnedOneMinute?: boolean;
  questionDeck: number[];
  answers: AnswerResult[];
  recap?: { topic: Topic; questions: QuestionSolution[] };
};

const COLORS = ['#b3243c', '#076a50', '#5534bb', '#8a5100', '#155e9e', '#a12878'];

export function newRoom(code: string, hostId: string, mode: RoomMode): Room {
  return {
    code,
    phase: 'lobby',
    version: 0,
    hostId,
    mode,
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    turn: 0,
    owners: {},
    events: [],
    questionDeck: [],
    answers: [],
  };
}

export function addPlayer(room: Room, id: string, name: string, bot = false): Room {
  const unused = (avatar: AvatarId) => !room.players.some((player) => player.avatar === avatar);
  const avatar = bot && unused('bot') ? 'bot' : AVATAR_IDS.find(unused)!;
  const player: Player = {
    id,
    name,
    avatar,
    color: COLORS.find((color) => !room.players.some((seat) => seat.color === color))!,
    pos: 0,
    cash: 1500,
    connected: true,
    ...(bot && { bot: true }),
  };
  return addEvent({ ...room, players: [...room.players, player] }, { kind: 'joined', player: id });
}

export function setAvatar(room: Room, id: string, avatar: AvatarId): Room {
  return {
    ...room,
    players: room.players.map((player) => (player.id === id ? { ...player, avatar } : player)),
  };
}

export function setConnected(room: Room, id: string, connected: boolean): Room {
  const player = room.players.find((candidate) => candidate.id === id);
  if (!player || player.connected === connected) return room;
  const players = room.players.map((candidate) =>
    candidate.id === id ? { ...candidate, connected } : candidate,
  );
  return addEvent({ ...room, players }, { kind: connected ? 'back' : 'left', player: id });
}

export function currentChoices(question: PrivateQuestion) {
  return question.chessStepAt === undefined ? question : question.chessLine!;
}

export function publicState(room: Room, now: number, viewer?: string): PublicState {
  const { question, warnedOneMinute, questionDeck, answers, recap, result, ...state } = room;
  if (!question) {
    return {
      ...state,
      now,
      ...(!recap && result && { result }),
      ...(recap && {
        matchReview: {
          topic: recap.topic,
          answers: viewer ? answers.filter((answer) => answer.playerId === viewer) : [],
          recap: recap.questions,
        },
      }),
    };
  }
  const { kind, tile, text, hint, n, mark, mystery, chess, chessLine, chessStepAt, english } =
    question;
  const { options } = currentChoices(question);
  return {
    ...state,
    now,
    ...(result && { result }),
    question: {
      kind,
      tile,
      text,
      hint,
      options,
      english: {
        text: english.text,
        hint: english.hint,
        options: chessStepAt === undefined ? english.options : options,
      },
      mark,
      ...(mystery || n === undefined ? {} : { n }),
      ...(chess && {
        chess: chessLine
          ? chessStepAt === undefined
            ? { ...chess, step: 1 }
            : {
                ...chess,
                position: chessLine.position,
                step: 2,
                lastReply: chessLine.reply,
              }
          : chess,
      }),
    },
  };
}

type WithoutEventId<Event> = Event extends { id: number } ? Omit<Event, 'id'> : never;

function addEvent(room: Room, event: WithoutEventId<GameEvent>): Room {
  const id = (room.events.at(-1)?.id ?? 0) + 1;
  return { ...room, events: [...room.events, { ...event, id }].slice(-30) };
}

export function warnOneMinute(room: Room, now: number): Room {
  if (
    room.warnedOneMinute ||
    room.phase === 'over' ||
    room.endsAt === undefined ||
    now < room.endsAt - 60_000 ||
    now >= room.endsAt
  )
    return room;
  return addEvent({ ...room, warnedOneMinute: true }, { kind: 'oneMinute' });
}

function pay(room: Room, charge: number, owner?: string): Room {
  const payer = room.players[room.turn];
  const paid = Math.min(charge, payer.cash);
  return {
    ...room,
    players: room.players.map((player) => {
      if (player.id === payer.id) return { ...player, cash: player.cash - paid };
      if (player.id === owner) return { ...player, cash: player.cash + paid };
      return player;
    }),
  };
}

function nextTurn(room: Room, now: number, turn = (room.turn + 1) % room.players.length): Room {
  return {
    ...room,
    turn,
    phase: 'roll',
    version: room.version + 1,
    question: undefined,
    deadline: now + room.settings.rollSeconds * 1000,
  };
}

export function start(room: Room, now: number): Room {
  return addEvent(
    {
      ...room,
      phase: 'roll',
      version: room.version + 1,
      deadline: now + room.settings.rollSeconds * 1000,
      endsAt: now + room.settings.matchMinutes * 60_000,
      answers: [],
      recap: undefined,
    },
    { kind: 'started' },
  );
}

export function finish(room: Room): Room {
  const standings = room.players
    .map((player) => ({ player, worth: netWorth(player, room.owners) }))
    .sort((a, b) => b.worth - a.worth);
  const questions: QuestionSolution[] = [];
  const seen = new Set<string>();
  const newest = room.answers.slice().reverse();
  for (const { playerId, chosen, outcome, chessFollowup, ...solution } of [
    ...newest.filter((answer) => answer.outcome !== 'correct'),
    ...newest.filter((answer) => answer.outcome === 'correct'),
  ]) {
    const key = solution.chess?.position ?? solution.text;
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(solution);
    if (questions.length === 3) break;
  }
  return addEvent(
    {
      ...room,
      phase: 'over',
      version: room.version + 1,
      question: undefined,
      deadline: undefined,
      standings,
      recap: { topic: room.settings.topic, questions },
    },
    { kind: 'over' },
  );
}

export function rematch(room: Room): Room {
  const lobby = newRoom(room.code, room.hostId, room.mode);
  const reset = addEvent(
    {
      ...lobby,
      settings: room.settings,
      version: room.version + 1,
      players: room.players.map((player) => ({
        ...player,
        cash: 1500,
        pos: 0,
      })),
      answers: room.answers,
      recap: room.recap,
      events: room.events.slice(-1),
    },
    { kind: 'rematch' },
  );
  return { ...reset, events: reset.events.slice(-1) };
}

export function roll(room: Room, now: number, dice: [number, number], chanceSides: number): Room {
  const player = room.players[room.turn];
  const distance = player.pos + dice[0] + dice[1];
  const tileIndex = distance % TILES.length;
  const tile = TILES[tileIndex];
  const passed = distance >= TILES.length;
  const cash = player.cash + (passed ? 200 : 0);
  let moved = addEvent(
    {
      ...room,
      dice,
      players: room.players.map((p, index) =>
        index === room.turn ? { ...p, pos: tileIndex, cash } : p,
      ),
    },
    { kind: 'roll', player: player.id, dice },
  );
  if (passed) moved = addEvent(moved, { kind: 'lap', player: player.id, amount: 200 });

  if (tile.kind === 'tax') {
    const paid = Math.min(cash, 100);
    return nextTurn(
      addEvent(pay(moved, 100), {
        kind: 'tax',
        player: player.id,
        amount: paid,
      }),
      now,
    );
  }
  if (tile.kind === 'rest')
    return nextTurn(addEvent(moved, { kind: 'rest', player: player.id }), now);
  if (tile.kind === 'start') return nextTurn(moved, now);

  let kind: PublicQuestion['kind'] = 'chance';
  if (tile.kind === 'property') {
    const owner = room.owners[tileIndex];
    if (owner === player.id) return nextTurn(moved, now);
    if (!owner && cash < tile.price!) {
      return nextTurn(
        addEvent(moved, {
          kind: 'cantAfford',
          player: player.id,
          tile: tileIndex,
        }),
        now,
      );
    }
    kind = owner ? 'rent' : 'buy';
  }
  const topic = room.settings.topic;
  const { question, deck } =
    topic === 'polygons'
      ? {
          question: makeQuestion(tile.n ?? chanceSides),
          deck: room.questionDeck,
        }
      : drawTopicQuestion(topic, room.questionDeck);
  return addEvent(
    {
      ...moved,
      phase: 'question',
      version: room.version + 1,
      deadline: now + room.settings.questionSeconds * 1000,
      question: { ...question, kind, tile: tileIndex },
      questionDeck: deck,
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

export function answer(room: Room, now: number, index?: number): Room {
  const player = room.players[room.turn];
  const question = room.question!;
  const { text, options, n, mark, explanation, chess, english, chessLine, chessStepAt } = question;
  const choices = currentChoices(question);
  const correct = index === choices.correct;
  if (chessLine && chessStepAt === undefined && correct) {
    return {
      ...room,
      version: room.version + 1,
      question: { ...question, chessStepAt: now },
    };
  }
  const result: AnswerResult = {
    id: (room.result?.id ?? 0) + 1,
    playerId: player.id,
    text,
    options,
    n,
    mark,
    ...(chess && { chess }),
    ...(chessLine && {
      chessLine: [options[question.correct], chessLine.reply, chessLine.options[chessLine.correct]],
    }),
    ...(chessStepAt !== undefined &&
      index !== undefined && { chessFollowup: choices.options[index] }),
    explanation,
    english: {
      text: english.text,
      options: english.options,
      explanation: english.explanation,
    },
    chosen: chessStepAt === undefined ? (index ?? -1) : question.correct,
    correct: question.correct,
    outcome: index === undefined ? 'timeout' : correct ? 'correct' : 'incorrect',
  };
  const answered = addEvent(
    {
      ...room,
      result,
      answers: [...room.answers, result],
    },
    {
      kind: 'answer',
      player: player.id,
      correct,
      timeout: index === undefined,
    },
  );

  if (question.kind === 'buy') {
    return correct
      ? {
          ...answered,
          phase: 'buy',
          version: room.version + 1,
          question: undefined,
          deadline: now + room.settings.buySeconds * 1000,
        }
      : nextTurn(answered, now);
  }
  if (question.kind === 'chance') {
    const cash = correct ? player.cash + 100 : Math.max(0, player.cash - 50);
    const players = room.players.map((p, i) => (i === room.turn ? { ...p, cash } : p));
    return nextTurn(
      addEvent(
        { ...answered, players },
        { kind: 'chance', player: player.id, amount: cash - player.cash },
      ),
      now,
    );
  }
  const owner = room.players.find((p) => p.id === room.owners[question.tile])!;
  const rent = TILES[question.tile].rent! / (correct ? 2 : 1);
  const paid = Math.min(player.cash, rent);
  return nextTurn(
    addEvent(pay(answered, rent, owner.id), {
      kind: 'rent',
      player: player.id,
      to: owner.id,
      tile: question.tile,
      amount: paid,
      half: correct,
    }),
    now,
  );
}

export function buy(room: Room, now: number): Room {
  const player = room.players[room.turn];
  const tile = TILES[player.pos];
  const bought = {
    ...pay(room, tile.price!),
    owners: { ...room.owners, [player.pos]: player.id },
  };
  return nextTurn(
    addEvent(bought, {
      kind: 'buy',
      player: player.id,
      tile: player.pos,
      amount: tile.price!,
    }),
    now,
  );
}

export function skip(room: Room, now: number): Room {
  const player = room.players[room.turn];
  return nextTurn(addEvent(room, { kind: 'skip', player: player.id, tile: player.pos }), now);
}

export function skipTurn(room: Room, now: number): Room {
  return nextTurn(addEvent(room, { kind: 'turnSkipped', player: room.players[room.turn].id }), now);
}

export function removePlayer(room: Room, id: string, now: number, reason?: 'voluntary'): Room {
  const removed = room.players.findIndex((player) => player.id === id);
  if (removed < 0) return room;
  const active = room.players[room.turn];
  const players = room.players.filter((player) => player.id !== id);
  const owners = Object.fromEntries(
    Object.entries(room.owners).filter(([, owner]) => owner !== id),
  );
  const hostId =
    room.mode === 'friends' && room.hostId === id
      ? ((players.find((player) => player.connected) ?? players[0])?.id ?? '')
      : room.hostId;
  const updated = addEvent(
    {
      ...room,
      players,
      owners,
      hostId,
      turn: Math.max(
        0,
        players.findIndex((p) => p.id === active?.id),
      ),
    },
    { kind: 'removed', player: id, name: room.players[removed].name, reason },
  );
  if (room.phase === 'lobby' || room.phase === 'over') return updated;
  if (players.length < 2) return finish(updated);
  if (active.id === id) return nextTurn(updated, now, removed % players.length);
  if (room.question?.kind === 'rent' && room.owners[room.question.tile] === id)
    return skipTurn(updated, now);
  return updated;
}
