import type { WSContext } from 'hono/ws';
import { ROOM_ALPHABET, TILES, type ServerMsg } from '../../shared/game';
import * as game from './index';

export type Entry = {
  room: game.Room;
  sockets: Map<string, WSContext>;
  tokens: Map<string, string>;
  emptySince?: number;
  overSince?: number;
  closedByHost?: true;
};

export const rooms = new Map<string, Entry>();
export const codePattern = new RegExp(`^[${ROOM_ALPHABET}]{4}$`);
export const tokenPattern = /^[0-9a-f]{32}$/;
const roomLimit = ROOM_ALPHABET.length ** 4;
const randomInt = (max: number) => Math.floor(Math.random() * max);
export const secret = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
const botTiming = {
  roll: { timer: 'rollSeconds', delay: 1500 },
  question: { timer: 'questionSeconds', delay: 4000 },
  buy: { timer: 'buySeconds', delay: 1500 },
} as const;

export function roomCode(): string | undefined {
  if (rooms.size >= roomLimit) return;
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

export function send(ws: WSContext, message: ServerMsg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function broadcast(entry: Entry, now: number) {
  if (
    entry.room.recap ||
    entry.room.question?.hintBought ||
    entry.room.spectators?.length ||
    entry.room.pauseVote
  ) {
    for (const [id, socket] of entry.sockets) {
      if (socket.readyState === 1)
        send(socket, {
          t: 'state',
          state: game.publicState(entry.room, now, id),
        });
    }
    return;
  }
  const state = JSON.stringify({
    t: 'state',
    state: game.publicState(entry.room, now),
  } satisfies ServerMsg);
  for (const socket of entry.sockets.values()) {
    if (socket.readyState === 1) socket.send(state);
  }
}

export function commit(entry: Entry, room: game.Room, now: number) {
  entry.room = game.warnOneMinute(game.checkPause(room, now), now);
  if (room.phase === 'over') entry.overSince ??= now;
  else entry.overSince = undefined;
  broadcast(entry, now);
}

export function revokeSeat(entry: Entry, id: string) {
  const socket = entry.sockets.get(id);
  entry.sockets.delete(id);
  for (const [token, player] of entry.tokens) {
    if (player === id) entry.tokens.delete(token);
  }
  return socket;
}

export function acknowledgeExit(socket: WSContext, reason?: 'projector-ended') {
  send(socket, { t: 'left', reason });
  socket.close(1000);
}

export function leave(entry: Entry, id: string, ws: WSContext, now: number) {
  const { room } = entry;
  const projectorHost = room.mode === 'projector' && room.hostId === id;
  revokeSeat(entry, id);

  if (room.spectators?.includes(id)) {
    if (!entry.sockets.size) entry.emptySince = now;
    commit(entry, { ...room, spectators: room.spectators.filter((viewer) => viewer !== id) }, now);
  } else if (
    (projectorHost && room.phase === 'lobby') ||
    (room.mode === 'friends' && room.players.every((player) => player.id === id))
  ) {
    const players = [...entry.sockets.values()];
    entry.sockets.clear();
    entry.tokens.clear();
    entry.closedByHost = true;
    entry.emptySince = now;
    for (const socket of players) acknowledgeExit(socket, 'projector-ended');
  } else if (room.mode === 'practice' || !entry.tokens.size) {
    rooms.delete(room.code);
  } else {
    if (!entry.sockets.size) entry.emptySince = now;
    const next =
      projectorHost && room.phase !== 'over'
        ? game.finish({ ...room, endedByHost: true })
        : game.removePlayer(room, id, room.pausedAt ?? now, 'voluntary');
    commit(entry, next, now);
  }

  acknowledgeExit(ws);
}

export function roll(room: game.Room, now: number): game.Room {
  return game.roll(room, now, [randomInt(6) + 1, randomInt(6) + 1], 3 + randomInt(10));
}

export function advance(room: game.Room, now: number, applyTimeout = false): game.Room {
  if (room.phase === 'over' || room.phase === 'lobby' || room.pausedAt !== undefined) return room;
  if (now >= room.endsAt!) return game.finish(room);
  const player = room.players[room.turn];
  const deadline = room.deadline!;
  const timedOut = applyTimeout || now >= deadline;
  const timing = botTiming[room.phase];
  const steps = room.question?.chessStages?.length ?? (room.question?.chessLine ? 2 : 1);
  const delay = Math.min(timing.delay, (room.settings[timing.timer] * 1000) / (2 * steps));
  const botReady =
    player.bot &&
    now >= (room.question?.chessStepAt ?? deadline - room.settings[timing.timer] * 1000) + delay;
  if (!timedOut && !botReady) return room;
  switch (room.phase) {
    case 'roll':
      return roll(room, now);
    case 'question': {
      if (timedOut) return game.answer(room, now);
      const question = room.question!;
      const { correct, options } = game.currentChoices(question);
      const wrong = question.botMisses
        ? options.flatMap((_, index) => (game.correctOption(question, index) ? [] : [index]))
        : [];
      const choice = wrong.length ? wrong[randomInt(wrong.length)] : correct;
      return game.answer(room, now, choice);
    }
    case 'buy': {
      const tile = TILES[player.pos];
      return timedOut || player.cash < tile.price! ? game.skip(room, now) : game.buy(room, now);
    }
  }
}

export function deleteExpired(code: string, entry: Entry, now: number): boolean {
  if (
    (entry.overSince !== undefined && now - entry.overSince >= 30 * 60_000) ||
    (entry.emptySince !== undefined && now - entry.emptySince >= 10 * 60_000)
  ) {
    rooms.delete(code);
    for (const socket of entry.sockets.values()) socket.close(1000);
    return true;
  }
  return false;
}

export function tickRooms(now: number) {
  for (const [code, entry] of rooms) {
    if (deleteExpired(code, entry, now)) continue;
    const next = game.warnOneMinute(game.checkPause(advance(entry.room, now), now), now);
    if (next !== entry.room) commit(entry, next, now);
  }
}
