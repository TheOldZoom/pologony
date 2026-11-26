import { Hono } from 'hono';
import { serveStatic, upgradeWebSocket, websocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import {
  AVATAR_IDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  ROOM_MODES,
  ROOM_ALPHABET,
  TILES,
  isGameSettings,
  type ClientMsg,
  type ServerMsg,
} from '../shared/game';
import { strings } from '../web/src/strings';
import * as game from './game';

type Entry = {
  room: game.Room;
  sockets: Map<string, WSContext>;
  tokens: Map<string, string>;
  emptySince?: number;
  overSince?: number;
  closedByHost?: true;
};
type IncomingMessage = Exclude<ClientMsg, { t: 'avatar' }> | { t: 'avatar'; id: unknown };

const rooms = new Map<string, Entry>();
const app = new Hono();
const dev = process.argv.includes('--dev');
const codePattern = new RegExp(`^[${ROOM_ALPHABET}]{4}$`);
const tokenPattern = /^[0-9a-f]{32}$/;
const roomLimit = ROOM_ALPHABET.length ** 4;
const randomInt = (max: number) => Math.floor(Math.random() * max);
const secret = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
const botTiming = {
  roll: { timer: 'rollSeconds', delay: 1500 },
  question: { timer: 'questionSeconds', delay: 4000 },
  buy: { timer: 'buySeconds', delay: 1500 },
} as const;
const botAccuracy = 65;

function roomCode(): string | undefined {
  if (rooms.size >= roomLimit) return;
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function parseMessage(raw: unknown): IncomingMessage | undefined {
  if (typeof raw !== 'string' || raw.length > 1024) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || !('t' in parsed)) return;
  const version =
    'version' in parsed &&
    typeof parsed.version === 'number' &&
    Number.isSafeInteger(parsed.version)
      ? parsed.version
      : undefined;

  switch (parsed.t) {
    case 'create':
    case 'join': {
      const name = 'name' in parsed && typeof parsed.name === 'string' ? parsed.name.trim() : '';
      if (parsed.t === 'create') {
        const mode = 'mode' in parsed && ROOM_MODES.find((candidate) => candidate === parsed.mode);
        if (mode) return { t: 'create', name, mode };
        return;
      }
      if ('code' in parsed && typeof parsed.code === 'string') {
        return { t: 'join', code: parsed.code.trim().toUpperCase(), name };
      }
      return;
    }
    case 'rejoin':
      if (
        'code' in parsed &&
        typeof parsed.code === 'string' &&
        'token' in parsed &&
        typeof parsed.token === 'string'
      ) {
        return { t: 'rejoin', code: parsed.code, token: parsed.token };
      }
      return;
    case 'avatar':
      return { t: 'avatar', id: 'id' in parsed ? parsed.id : undefined };
    case 'settings':
      if ('settings' in parsed && isGameSettings(parsed.settings)) {
        const { topic, matchMinutes, rollSeconds, questionSeconds, buySeconds } = parsed.settings;
        return {
          t: 'settings',
          settings: {
            topic,
            matchMinutes,
            rollSeconds,
            questionSeconds,
            buySeconds,
          },
        };
      }
      return;
    case 'remove':
      if ('player' in parsed && typeof parsed.player === 'string')
        return { t: 'remove', player: parsed.player };
      return;
    case 'answer':
      if (
        version !== undefined &&
        'index' in parsed &&
        typeof parsed.index === 'number' &&
        Number.isSafeInteger(parsed.index) &&
        parsed.index >= 0
      ) {
        return { t: 'answer', index: parsed.index, version };
      }
      return;
    case 'start':
    case 'leave':
      return { t: parsed.t };
    case 'roll':
    case 'buy':
    case 'skip':
    case 'skipTurn':
    case 'applyTimeout':
    case 'rematch':
      if (version !== undefined) return { t: parsed.t, version };
  }
}

function send(ws: WSContext, message: ServerMsg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function broadcast(entry: Entry, now: number) {
  if (entry.room.recap) {
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

function commit(entry: Entry, room: game.Room, now: number) {
  entry.room = game.warnOneMinute(room, now);
  if (room.phase === 'over') entry.overSince ??= now;
  else entry.overSince = undefined;
  broadcast(entry, now);
}

function revokeSeat(entry: Entry, id: string) {
  const socket = entry.sockets.get(id);
  entry.sockets.delete(id);
  for (const [token, player] of entry.tokens) {
    if (player === id) entry.tokens.delete(token);
  }
  return socket;
}

function acknowledgeExit(socket: WSContext, reason?: 'projector-ended') {
  send(socket, { t: 'left', reason });
  socket.close(1000);
}

function leave(entry: Entry, id: string, ws: WSContext, now: number) {
  const { room } = entry;
  const projectorHost = room.mode === 'projector' && room.hostId === id;
  revokeSeat(entry, id);

  if (projectorHost && room.phase === 'lobby') {
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
        : game.removePlayer(room, id, now, 'voluntary');
    commit(entry, next, now);
  }

  acknowledgeExit(ws);
}

function roll(room: game.Room, now: number): game.Room {
  return game.roll(room, now, [randomInt(6) + 1, randomInt(6) + 1], 3 + randomInt(10));
}

function advance(room: game.Room, now: number, applyTimeout = false): game.Room {
  if (room.phase === 'over' || room.phase === 'lobby') return room;
  if (now >= room.endsAt!) return game.finish(room);
  const player = room.players[room.turn];
  const deadline = room.deadline!;
  const timedOut = applyTimeout || now >= deadline;
  const timing = botTiming[room.phase];
  const botReady =
    player.bot &&
    now >=
      (room.question?.chessStepAt ?? deadline - room.settings[timing.timer] * 1000) + timing.delay;
  if (!timedOut && !botReady) return room;
  switch (room.phase) {
    case 'roll':
      return roll(room, now);
    case 'question': {
      if (timedOut) return game.answer(room, now);
      const { correct, options } = game.currentChoices(room.question!);
      const choice =
        options.length === 1 || randomInt(100) < botAccuracy
          ? correct
          : (correct + 1 + randomInt(options.length - 1)) % options.length;
      return game.answer(room, now, choice);
    }
    case 'buy': {
      const tile = TILES[player.pos];
      return timedOut || player.cash < tile.price! ? game.skip(room, now) : game.buy(room, now);
    }
  }
}

function deleteExpired(code: string, entry: Entry, now: number): boolean {
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

app.get(
  '/ws',
  upgradeWebSocket(() => {
    let seat: { entry: Entry; id: string; socket: WSContext } | undefined;
    return {
      onMessage(event, ws) {
        const message = parseMessage(event.data);
        const error = (msg: string) => send(ws, { t: 'error', msg });
        if (!message) return error(strings.error.invalid);
        const now = Date.now();

        if (message.t === 'create' || message.t === 'join' || message.t === 'rejoin') {
          if (seat) return error(strings.error.alreadySeated);
          let entry: Entry;
          let id: string;
          let token: string;
          if (message.t === 'rejoin') {
            const found = codePattern.test(message.code) ? rooms.get(message.code) : undefined;
            if (
              !found ||
              deleteExpired(message.code, found, now) ||
              !tokenPattern.test(message.token)
            ) {
              return error(strings.error.expired);
            }
            if (found.closedByHost) return acknowledgeExit(ws, 'projector-ended');
            const playerId = found.tokens.get(message.token);
            if (!playerId) return error(strings.error.expired);
            entry = found;
            id = playerId;
            token = message.token;
            entry.room = game.setConnected(entry.room, id, true);
          } else {
            const presenter = message.t === 'create' && message.mode === 'projector';
            if (!presenter && (!message.name || message.name.length > MAX_NAME_LENGTH))
              return error(strings.error.name);
            id = crypto.randomUUID();
            token = secret();

            if (message.t === 'create') {
              const code = roomCode();
              if (!code) return error(strings.error.rooms);
              entry = {
                room: game.newRoom(code, id, message.mode),
                sockets: new Map(),
                tokens: new Map(),
              };
              rooms.set(code, entry);
            } else {
              const found = codePattern.test(message.code) ? rooms.get(message.code) : undefined;
              if (!found || deleteExpired(message.code, found, now))
                return error(strings.error.missing);
              if (found.closedByHost) return error(strings.sessionEnded);
              if (found.room.mode === 'practice') return error(strings.error.practiceRoom);
              if (found.room.phase !== 'lobby') return error(strings.error.started);
              if (found.room.players.length >= MAX_PLAYERS) return error(strings.error.full);
              entry = found;
            }
            entry.tokens.set(token, id);
            if (!presenter) entry.room = game.addPlayer(entry.room, id, message.name);
            if (message.t === 'create' && message.mode === 'practice') {
              entry.room = game.addPlayer(entry.room, crypto.randomUUID(), strings.botName, true);
            }
          }

          const previous = entry.sockets.get(id);
          seat = { entry, id, socket: ws };
          entry.sockets.set(id, ws);
          entry.emptySince = undefined;
          previous?.close(4000);
          send(ws, { t: 'welcome', token, you: id });
          commit(entry, advance(entry.room, now), now);
          return;
        }

        if (!seat || seat.entry.sockets.get(seat.id) !== seat.socket)
          return error(strings.error.noSeat);
        const { entry, id } = seat;
        if (deleteExpired(entry.room.code, entry, now)) return;
        if (message.t === 'leave') {
          leave(entry, id, ws, now);
          return;
        }
        const advanced = advance(entry.room, now);
        if (advanced !== entry.room) commit(entry, advanced, now);
        const room = entry.room;
        if (message.t === 'rematch') {
          if (id !== room.hostId) return error(strings.error.host);
          if (room.phase !== 'over' || room.endedByHost) return error(strings.error.phase);
          if (message.version !== room.version) return error(strings.error.tooLate);
          commit(entry, game.rematch(room), now);
          return;
        }
        if (message.t === 'avatar') {
          if (room.phase !== 'lobby') return error(strings.error.phase);
          const avatar = AVATAR_IDS.find((candidate) => candidate === message.id);
          if (
            !avatar ||
            !room.players.some((player) => player.id === id) ||
            room.players.some((player) => player.id !== id && player.avatar === avatar)
          ) {
            return error(strings.error.avatarTaken);
          }
          commit(entry, game.setAvatar(room, id, avatar), now);
          return;
        }
        if (message.t === 'start' || message.t === 'settings') {
          if (id !== room.hostId) return error(strings.error.host);
          if (room.phase !== 'lobby') return error(strings.error.phase);
          if (message.t === 'settings') {
            commit(entry, { ...room, settings: message.settings }, now);
            return;
          }
          if (room.players.filter((player) => player.connected).length < 2)
            return error(strings.error.needPlayers);
          commit(entry, game.start(room, now), now);
          return;
        }
        const canModerate = id === room.hostId && room.mode === 'projector';
        if (message.t === 'remove') {
          if (!canModerate) return error(strings.error.host);
          if (room.phase === 'over') return error(strings.error.phase);
          if (!room.players.some((player) => player.id === message.player))
            return error(strings.error.missingPlayer);
          const removedSocket = revokeSeat(entry, message.player);
          commit(entry, game.removePlayer(room, message.player, now), now);
          removedSocket?.close(4001);
          return;
        }
        if (room.phase === 'lobby' || room.phase === 'over') return error(strings.error.phase);
        if (message.version !== room.version) return error(strings.error.tooLate);
        if (message.t === 'skipTurn' || message.t === 'applyTimeout') {
          if (!canModerate) return error(strings.error.host);
          commit(
            entry,
            message.t === 'skipTurn' ? game.skipTurn(room, now) : advance(room, now, true),
            now,
          );
          return;
        }
        if (room.players[room.turn].id !== id) return error(strings.error.turn);

        switch (message.t) {
          case 'roll':
            if (room.phase !== 'roll') return error(strings.error.phase);
            commit(entry, roll(room, now), now);
            break;
          case 'answer':
            if (
              room.phase !== 'question' ||
              message.index >= game.currentChoices(room.question!).options.length
            ) {
              return error(strings.error.phase);
            }
            commit(entry, game.answer(room, now, message.index), now);
            break;
          case 'buy':
          case 'skip': {
            if (room.phase !== 'buy') return error(strings.error.phase);
            const player = room.players[room.turn];
            const tile = TILES[player.pos];
            if (tile.kind !== 'property' || room.owners[player.pos])
              return error(strings.error.phase);
            if (message.t === 'buy' && player.cash < tile.price!) return error(strings.error.money);
            commit(entry, message.t === 'buy' ? game.buy(room, now) : game.skip(room, now), now);
          }
        }
      },
      onClose() {
        if (!seat) return;
        const { entry, id, socket } = seat;
        if (entry.sockets.get(id) !== socket) return;
        entry.sockets.delete(id);
        const now = Date.now();
        if (!entry.sockets.size) entry.emptySince = now;
        if (rooms.get(entry.room.code) === entry) {
          commit(entry, advance(game.setConnected(entry.room, id, false), now), now);
        }
      },
    };
  }),
);

if (!dev) {
  const root = `${import.meta.dir}/../web/dist`;
  app.get('/', serveStatic({ root, path: 'index.html' }));
  app.use('/*', serveStatic({ root }));
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket: { ...websocket, maxPayloadLength: 4096 },
});
console.log(`${strings.title} server listening at ${server.url}`);

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of rooms) {
    if (deleteExpired(code, entry, now)) continue;
    const next = game.warnOneMinute(advance(entry.room, now), now);
    if (next !== entry.room) commit(entry, next, now);
  }
}, 1000);

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: `${import.meta.dir}/../web`,
    server: {
      host: true,
      proxy: { '/ws': { target: `ws://127.0.0.1:${server.port}`, ws: true } },
    },
  });
  await vite.listen();
  vite.printUrls();
}
