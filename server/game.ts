import {
  AVATAR_IDS,
  BUY_SECONDS,
  GAME_MINUTES,
  QUESTION_SECONDS,
  ROLL_SECONDS,
  TILES,
  type AvatarId,
  type GameEvent,
  type Player,
  type PublicQuestion,
  type PublicState,
} from '../shared/game';
import type { Question } from './questions';

type PrivateQuestion = Question & Pick<PublicQuestion, 'kind' | 'tile'>;
export type Room = Omit<PublicState, 'now' | 'question'> & {
  question?: PrivateQuestion;
  warnedOneMinute?: boolean;
};

const COLORS = ['#b3243c', '#076a50', '#5534bb', '#8a5100', '#155e9e', '#a12878'];

export function newRoom(code: string, hostId: string): Room {
  return { code, phase: 'lobby', hostId, players: [], turn: 0, owners: {}, events: [] };
}

export function addPlayer(room: Room, id: string, name: string, bot = false): Room {
  const unused = (avatar: AvatarId) => !room.players.some((player) => player.avatar === avatar);
  const avatar = bot && unused('bot') ? 'bot' : AVATAR_IDS.find(unused)!;
  const player: Player = {
    id,
    name,
    avatar,
    color: COLORS[room.players.length],
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

export function publicState(room: Room, now: number): PublicState {
  const { question, warnedOneMinute, ...state } = room;
  if (!question) return { ...state, now };
  const { kind, tile, text, hint, options, n, mark, mystery } = question;
  return {
    ...state,
    now,
    question: { kind, tile, text, hint, options, mark, ...(mystery ? {} : { n }) },
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

function nextTurn(room: Room, now: number): Room {
  return {
    ...room,
    turn: (room.turn + 1) % room.players.length,
    phase: 'roll',
    question: undefined,
    deadline: now + ROLL_SECONDS * 1000,
  };
}

export function start(room: Room, now: number): Room {
  return addEvent(
    {
      ...room,
      phase: 'roll',
      deadline: now + ROLL_SECONDS * 1000,
      endsAt: now + GAME_MINUTES * 60_000,
    },
    { kind: 'started' },
  );
}

export function finish(room: Room): Room {
  return addEvent(
    { ...room, phase: 'over', question: undefined, deadline: undefined },
    { kind: 'over' },
  );
}

export function roll(
  room: Room,
  now: number,
  dice: [number, number],
  chanceSides: number,
  questionFor: (n: number) => Question,
): Room {
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
      addEvent(pay(moved, 100), { kind: 'tax', player: player.id, amount: paid }),
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
        addEvent(moved, { kind: 'cantAfford', player: player.id, tile: tileIndex }),
        now,
      );
    }
    kind = owner ? 'rent' : 'buy';
  }
  const question = questionFor(tile.n ?? chanceSides);
  return addEvent(
    {
      ...moved,
      phase: 'question',
      deadline: now + QUESTION_SECONDS * 1000,
      question: { ...question, kind, tile: tileIndex },
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
  const correct = index === question.correct;
  const { text, options, n, mark, explanation } = question;
  const answered = addEvent(
    {
      ...room,
      result: {
        id: (room.result?.id ?? 0) + 1,
        playerId: player.id,
        text,
        options,
        n,
        mark,
        explanation,
        chosen: index ?? -1,
        correct: question.correct,
      },
    },
    { kind: 'answer', player: player.id, correct, timeout: index === undefined },
  );

  if (question.kind === 'buy') {
    return correct
      ? { ...answered, phase: 'buy', question: undefined, deadline: now + BUY_SECONDS * 1000 }
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
  const bought = { ...pay(room, tile.price!), owners: { ...room.owners, [player.pos]: player.id } };
  return nextTurn(
    addEvent(bought, { kind: 'buy', player: player.id, tile: player.pos, amount: tile.price! }),
    now,
  );
}

export function skip(room: Room, now: number): Room {
  const player = room.players[room.turn];
  return nextTurn(addEvent(room, { kind: 'skip', player: player.id, tile: player.pos }), now);
}
