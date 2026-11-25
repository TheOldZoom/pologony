import { Hono } from 'hono';
import { serveStatic, upgradeWebSocket, websocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import {
  AVATAR_IDS,
  BUY_SECONDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  QUESTION_SECONDS,
  ROLL_SECONDS,
  ROOM_ALPHABET,
  TILES,
  type ClientMsg,
  type ServerMsg,
} from '../shared/game';
import { strings } from '../web/src/strings';
import * as game from './game';
import { makeQuestion } from './questions';

type Entry = {
  room: game.Room;
  sockets: Map<string, WSContext>;
  tokens: Map<string, string>;
  emptySince?: number;
  overSince?: number;
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
  roll: { seconds: ROLL_SECONDS, delay: 1500 },
  question: { seconds: QUESTION_SECONDS, delay: 4000 },
  buy: { seconds: BUY_SECONDS, delay: 1500 },
};
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

  switch (parsed.t) {
    case 'create':
    case 'join': {
      const name = 'name' in parsed && typeof parsed.name === 'string' ? parsed.name.trim() : '';
      if (parsed.t === 'create') {
        if (!('withBot' in parsed)) return { t: 'create', name };
        if (typeof parsed.withBot === 'boolean')
          return { t: 'create', name, withBot: parsed.withBot };
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
    case 'answer':
      if (
        'index' in parsed &&
        typeof parsed.index === 'number' &&
        Number.isInteger(parsed.index) &&
        parsed.index >= 0 &&
        parsed.index < 4
      ) {
        return { t: 'answer', index: parsed.index };
      }
      return;
    case 'start':
    case 'roll':
    case 'buy':
    case 'skip':
      return { t: parsed.t };
  }
}

function send(ws: WSContext, message: ServerMsg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function broadcast(entry: Entry, now: number) {
  const message = JSON.stringify({
    t: 'state',
    state: game.publicState(entry.room, now),
  } satisfies ServerMsg);
  for (const socket of entry.sockets.values()) {
    if (socket.readyState === 1) socket.send(message);
  }
}

function commit(entry: Entry, room: game.Room, now: number) {
  entry.room = game.warnOneMinute(room, now);
  if (room.phase === 'over') entry.overSince ??= now;
  broadcast(entry, now);
}

function roll(room: game.Room, now: number): game.Room {
  return game.roll(
    room,
    now,
    [randomInt(6) + 1, randomInt(6) + 1],
    3 + randomInt(10),
    makeQuestion,
  );
}

function advance(room: game.Room, now: number): game.Room {
  if (room.phase === 'over' || room.phase === 'lobby') return room;
  if (now >= room.endsAt!) return game.finish(room);
  const player = room.players[room.turn];
  const deadline = room.deadline!;
  const timedOut = now >= deadline;
  const timing = botTiming[room.phase];
  const botReady = player.bot && now >= deadline - timing.seconds * 1000 + timing.delay;
  if (!timedOut && !botReady) return room;
  switch (room.phase) {
    case 'roll':
      return roll(room, now);
    case 'question': {
      if (timedOut) return game.answer(room, now);
      const { correct, options } = room.question!;
      const choice =
        randomInt(100) < botAccuracy
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
            const playerId = found.tokens.get(message.token);
            if (!playerId) return error(strings.error.expired);
            entry = found;
            id = playerId;
            token = message.token;
            entry.room = game.setConnected(entry.room, id, true);
          } else {
            if (!message.name || message.name.length > MAX_NAME_LENGTH)
              return error(strings.error.name);
            id = crypto.randomUUID();
            token = secret();

            if (message.t === 'create') {
              const code = roomCode();
              if (!code) return error(strings.error.rooms);
              entry = { room: game.newRoom(code, id), sockets: new Map(), tokens: new Map() };
              rooms.set(code, entry);
            } else {
              const found = codePattern.test(message.code) ? rooms.get(message.code) : undefined;
              if (!found || deleteExpired(message.code, found, now))
                return error(strings.error.missing);
              if (found.room.players.some((player) => player.bot))
                return error(strings.error.practiceRoom);
              if (found.room.phase !== 'lobby') return error(strings.error.started);
              if (found.room.players.length >= MAX_PLAYERS) return error(strings.error.full);
              entry = found;
            }
            entry.tokens.set(token, id);
            entry.room = game.addPlayer(entry.room, id, message.name);
            if (message.t === 'create' && message.withBot) {
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
        const room = entry.room;
        const advanced = advance(room, now);
        if (advanced !== room) {
          commit(entry, advanced, now);
          return error(strings.error.tooLate);
        }
        if (message.t === 'avatar') {
          if (room.phase !== 'lobby') return error(strings.error.phase);
          const avatar = AVATAR_IDS.find((candidate) => candidate === message.id);
          if (
            !avatar ||
            room.players.some((player) => player.id !== id && player.avatar === avatar)
          ) {
            return error(strings.error.avatarTaken);
          }
          commit(entry, game.setAvatar(room, id, avatar), now);
          return;
        }
        if (message.t === 'start') {
          if (id !== room.hostId) return error(strings.error.host);
          if (room.phase !== 'lobby') return error(strings.error.phase);
          if (room.players.length < 2) return error(strings.error.needPlayers);
          commit(entry, game.start(room, now), now);
          return;
        }
        if (room.phase === 'lobby' || room.phase === 'over') return error(strings.error.phase);
        if (room.players[room.turn].id !== id) return error(strings.error.turn);

        switch (message.t) {
          case 'roll':
            if (room.phase !== 'roll') return error(strings.error.phase);
            commit(entry, roll(room, now), now);
            break;
          case 'answer':
            if (room.phase !== 'question' || message.index >= room.question!.options.length) {
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
    server: { host: true, proxy: { '/ws': { target: `ws://127.0.0.1:${server.port}`, ws: true } } },
  });
  await vite.listen();
  vite.printUrls();
}
