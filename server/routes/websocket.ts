import type { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import {
  AVATAR_IDS,
  HINT_PRICE,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  TILES,
} from '../../shared/game';
import { strings } from '../../web/src/i18n/strings';
import type { DailyPuzzles } from '../chess/cache';
import * as game from '../rooms';
import {
  acknowledgeExit,
  advance,
  codePattern,
  commit,
  deleteExpired,
  leave,
  revokeSeat,
  roll,
  roomCode,
  rooms,
  secret,
  send,
  tokenPattern,
  type Entry,
} from '../rooms/registry';
import { parseMessage } from './messages';

export function registerWebSocket(app: Hono, getDailyPuzzles: () => DailyPuzzles | undefined) {
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

          if (
            message.t === 'create' ||
            message.t === 'join' ||
            message.t === 'watch' ||
            message.t === 'rejoin'
          ) {
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
              if (
                message.t !== 'watch' &&
                !presenter &&
                (!message.name || message.name.length > MAX_NAME_LENGTH)
              )
                return error(strings.error.name);
              id = crypto.randomUUID();
              token = secret();
              let spectating = false;

              if (message.t === 'create') {
                const code = roomCode();
                if (!code) return error(strings.error.rooms);
                entry = {
                  room: game.newRoom(code, id, message.mode),
                  sockets: new Map(),
                  tokens: new Map(),
                };
                if (message.settings) entry.room.settings = message.settings;
                rooms.set(code, entry);
              } else {
                const found = codePattern.test(message.code) ? rooms.get(message.code) : undefined;
                if (!found || deleteExpired(message.code, found, now))
                  return error(strings.error.missing);
                if (found.closedByHost) return error(strings.sessionEnded);
                if (found.room.mode === 'practice') return error(strings.error.practiceRoom);
                spectating =
                  message.t === 'watch' ||
                  found.room.phase !== 'lobby' ||
                  found.room.players.length >= MAX_PLAYERS;
                if (spectating && (found.room.spectators?.length ?? 0) >= MAX_SPECTATORS)
                  return error(strings.error.watchFull);
                entry = found;
              }
              entry.tokens.set(token, id);
              if (spectating)
                entry.room = { ...entry.room, spectators: [...(entry.room.spectators ?? []), id] };
              else if (!presenter && message.t !== 'watch')
                entry.room = game.addPlayer(entry.room, id, message.name);
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
          if (message.t === 'claimSeat') {
            if (!room.spectators?.includes(id) || room.phase !== 'lobby')
              return error(strings.error.phase);
            if (!message.name || message.name.length > MAX_NAME_LENGTH)
              return error(strings.error.name);
            if (room.players.length >= MAX_PLAYERS) return error(strings.error.full);
            commit(
              entry,
              game.addPlayer(
                { ...room, spectators: room.spectators.filter((viewer) => viewer !== id) },
                id,
                message.name,
              ),
              now,
            );
            return;
          }
          if (room.spectators?.includes(id)) return error(strings.error.spectator);
          if (message.t === 'pauseVote' || message.t === 'resume') {
            if (room.mode !== 'projector' || room.phase === 'lobby' || room.phase === 'over')
              return error(strings.error.phase);
            if (message.t === 'resume' && id !== room.hostId) return error(strings.error.host);
            const next =
              message.t === 'resume' ? game.resume(room, now) : game.voteToPause(room, id, now);
            if (next === room) return error(strings.error.phase);
            commit(entry, next, now);
            return;
          }
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
            commit(entry, game.start(room, now, getDailyPuzzles()), now);
            return;
          }
          const canModerate = id === room.hostId && room.mode === 'projector';
          if (message.t === 'remove') {
            if (!canModerate) return error(strings.error.host);
            if (room.phase === 'over') return error(strings.error.phase);
            if (!room.players.some((player) => player.id === message.player))
              return error(strings.error.missingPlayer);
            const removedSocket = revokeSeat(entry, message.player);
            commit(entry, game.removePlayer(room, message.player, room.pausedAt ?? now), now);
            removedSocket?.close(4001);
            return;
          }
          if (room.phase === 'lobby' || room.phase === 'over') return error(strings.error.phase);
          if (room.pausedAt !== undefined) return error(strings.error.paused);
          if (!('version' in message) || message.version !== room.version)
            return error(strings.error.tooLate);
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
            case 'hint': {
              if (room.phase !== 'question') return error(strings.error.phase);
              if (room.players[room.turn].cash < HINT_PRICE) return error(strings.error.money);
              const next = game.buyHint(room);
              if (next === room) return error(strings.error.phase);
              commit(entry, next, now);
              break;
            }
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
              if (message.t === 'buy' && player.cash < tile.price!)
                return error(strings.error.money);
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
}
