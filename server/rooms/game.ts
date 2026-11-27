import {
  HINT_PRICE,
  STREAK_BONUS,
  TILES,
  netWorth,
  tileRent,
  type AnswerResult,
  type PublicQuestion,
  type QuestionSolution,
} from '../../shared/game';
import type { DailyPuzzles } from '../chess/cache';
import { addEvent, correctOption, currentChoices, newRoom, type Room } from './model';
import { askQuestion } from './questionTurns';

export function buyHint(room: Room): Room {
  if (
    !room.question ||
    room.question.hintBought ||
    (!room.question.hint && !room.question.english.hint)
  )
    return room;
  if (room.players[room.turn].cash < HINT_PRICE) return room;
  return { ...pay(room, HINT_PRICE), question: { ...room.question, hintBought: true } };
}

export function warnOneMinute(room: Room, now: number): Room {
  if (
    room.pausedAt !== undefined ||
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

function openRoll(room: Room, now: number, turn: number): Room {
  return {
    ...room,
    turn,
    phase: 'roll',
    version: room.version + 1,
    question: undefined,
    deadline: now + room.settings.rollSeconds * 1000,
  };
}

function nextTurn(room: Room, now: number, turn = (room.turn + 1) % room.players.length): Room {
  for (let i = 0; i < room.players.length && room.players[turn].eliminated; i++)
    turn = (turn + 1) % room.players.length;
  const player = room.players[turn];
  if (!player || player.eliminated) return finish(room);
  return player.resting
    ? askQuestion({ ...room, turn }, now, 'rest', player.pos, 6)
    : openRoll(room, now, turn);
}

function settleDebt(room: Room, charge: number, now: number, owner?: string): Room {
  const payer = room.players[room.turn];
  const paid = pay(room, charge, owner);
  if (!room.settings.bankruptcy || payer.cash >= charge) return nextTurn(paid, now);
  const owners = { ...paid.owners };
  const upgrades = { ...paid.upgrades };
  for (const tile of Object.keys(owners).map(Number)) {
    if (owners[tile] !== payer.id) continue;
    if (owner) owners[tile] = owner;
    else {
      delete owners[tile];
      delete upgrades[tile];
    }
  }
  const players = paid.players.map((player) =>
    player.id === payer.id
      ? { ...player, eliminated: true as const, resting: undefined, streak: undefined }
      : player,
  );
  const settled = addEvent(
    { ...paid, players, owners, upgrades },
    { kind: 'bankrupt', player: payer.id, to: owner },
  );
  return players.filter((player) => !player.eliminated).length < 2
    ? finish(settled)
    : nextTurn(settled, now);
}

export function start(room: Room, now: number, chessDaily?: DailyPuzzles): Room {
  return addEvent(
    {
      ...room,
      phase: 'roll',
      version: room.version + 1,
      deadline: now + room.settings.rollSeconds * 1000,
      endsAt: now + room.settings.matchMinutes * 60_000,
      answers: [],
      recap: undefined,
      chessDaily: room.settings.topic === 'chess' && !room.customDeck ? chessDaily : undefined,
    },
    { kind: 'started' },
  );
}

export function finish(room: Room): Room {
  const standings = room.players
    .filter((player) => !player.eliminated)
    .map((player) => ({ player, worth: netWorth(player, room.owners) }))
    .sort((a, b) => b.worth - a.worth);
  const questions: QuestionSolution[] = [];
  const seen = new Set<string>();
  const newest = room.answers.slice().reverse();
  for (const { playerId, chosen, outcome, chessFollowup, chessAttempt, ...solution } of [
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
      pausedAt: undefined,
      pauseVote: undefined,
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
        eliminated: undefined,
        resting: undefined,
        streak: undefined,
      })),
      customDeck: room.customDeck,
      spectators: room.spectators,
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
    return settleDebt(
      addEvent(moved, { kind: 'tax', player: player.id, amount: Math.min(cash, 100) }),
      100,
      now,
    );
  }
  if (tile.kind === 'rest') {
    if (room.settings.restChallenges)
      moved = {
        ...moved,
        players: moved.players.map((seat) =>
          seat.id === player.id ? { ...seat, resting: true } : seat,
        ),
      };
    return nextTurn(addEvent(moved, { kind: 'rest', player: player.id }), now);
  }
  if (tile.kind === 'start') return nextTurn(moved, now);

  let kind: PublicQuestion['kind'] = 'chance';
  if (tile.kind === 'property') {
    const owner = room.owners[tileIndex];
    if (owner === player.id) {
      const upgradeTier = room.settings.difficulty === 'hard' ? 'challenge' : 'hard';
      if (
        room.settings.upgrades &&
        !room.upgrades?.[tileIndex] &&
        (!room.customDeck ||
          room.customDeck.some((question) => question.difficulty === upgradeTier))
      )
        return askQuestion(moved, now, 'upgrade', tileIndex, chanceSides);
      return nextTurn(moved, now);
    }
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
  return askQuestion(moved, now, kind, tileIndex, chanceSides);
}

export function answer(room: Room, now: number, index?: number): Room {
  const player = room.players[room.turn];
  const question = room.question!;
  const { text, options, n, mark, explanation, chess, english, chessLine, chessStepAt } = question;
  const choices = currentChoices(question);
  const correct = correctOption(question, index);
  const stepIndex = question.stepIndex ?? 0;
  const stages = question.chessStages;
  if (
    correct &&
    (stages ? stepIndex + 1 < stages.length : chessLine && chessStepAt === undefined)
  ) {
    return {
      ...room,
      version: room.version + 1,
      question: { ...question, chessStepAt: now, stepIndex: stepIndex + 1 },
    };
  }
  const chessAttempt = stages
    ?.slice(0, stepIndex)
    .flatMap((stage, i) => [stage.options[stage.correct], stages[i + 1].reply!]);
  if (chessAttempt && index !== undefined) chessAttempt.push(choices.options[index]);
  const result: AnswerResult = {
    id: (room.result?.id ?? 0) + 1,
    playerId: player.id,
    text,
    options,
    n,
    mark,
    ...(chess && { chess }),
    ...(question.lichessId && { lichessId: question.lichessId }),
    ...(stages && {
      chessLine: stages.flatMap((stage) => [
        ...(stage.reply ? [stage.reply] : []),
        stage.options[stage.correct],
      ]),
      chessAttempt,
    }),
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
  let answered = addEvent(
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

  const streak = correct ? (player.streak ?? 0) + 1 : 0;
  const bonus = streak === 3 ? STREAK_BONUS : 0;
  answered = {
    ...answered,
    players: answered.players.map((seat) =>
      seat.id === player.id
        ? { ...seat, streak: bonus ? 0 : streak, cash: seat.cash + bonus }
        : seat,
    ),
  };
  if (bonus) answered = addEvent(answered, { kind: 'streak', player: player.id, amount: bonus });

  if (question.kind === 'rest') {
    answered = {
      ...answered,
      players: answered.players.map((seat) =>
        seat.id === player.id ? { ...seat, resting: undefined } : seat,
      ),
    };
    return correct ? openRoll(answered, now, room.turn) : nextTurn(answered, now);
  }
  if (question.kind === 'upgrade') {
    if (correct)
      answered = addEvent(
        { ...answered, upgrades: { ...answered.upgrades, [question.tile]: true } },
        { kind: 'upgraded', player: player.id, tile: question.tile },
      );
    return nextTurn(answered, now);
  }
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
    const current = answered.players[room.turn].cash;
    const cash = correct ? current + 100 : Math.max(0, current - 50);
    const players = answered.players.map((p, i) => (i === room.turn ? { ...p, cash } : p));
    return nextTurn(
      addEvent(
        { ...answered, players },
        { kind: 'chance', player: player.id, amount: cash - current },
      ),
      now,
    );
  }
  const owner = room.players.find((p) => p.id === room.owners[question.tile])!;
  const rent = Math.round(tileRent(question.tile, room.upgrades) * (correct ? 50 : 100)) / 100;
  return settleDebt(
    addEvent(answered, {
      kind: 'rent',
      player: player.id,
      to: owner.id,
      tile: question.tile,
      amount: Math.min(answered.players[room.turn].cash, rent),
      half: correct,
    }),
    rent,
    now,
    owner.id,
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
  const player = room.players[room.turn];
  const players =
    room.question?.kind === 'rest'
      ? room.players.map((seat) => (seat.id === player.id ? { ...seat, resting: undefined } : seat))
      : room.players;
  return nextTurn(addEvent({ ...room, players }, { kind: 'turnSkipped', player: player.id }), now);
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
      upgrades: Object.fromEntries(
        Object.entries(room.upgrades ?? {}).filter(([tile]) => owners[Number(tile)]),
      ),
      hostId,
      turn: Math.max(
        0,
        players.findIndex((p) => p.id === active?.id),
      ),
    },
    { kind: 'removed', player: id, name: room.players[removed].name, reason },
  );
  if (room.phase === 'lobby' || room.phase === 'over') return updated;
  if (players.filter((player) => !player.eliminated).length < 2) return finish(updated);
  if (active.id === id) return nextTurn(updated, now, removed % players.length);
  if (room.question?.kind === 'rent' && room.owners[room.question.tile] === id)
    return skipTurn(updated, now);
  return updated;
}
