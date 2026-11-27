import { useEffect, useRef, useState } from 'react';
import {
  ROOM_ALPHABET,
  type ClientMsg,
  type GameEvent,
  type PublicState,
  type ServerMsg,
} from '../../../shared/game';
import { strings as wireStrings } from '../i18n/strings';

type SavedSeat = { code: string; token: string; you: string };
export type Snapshot = { state: PublicState; offset: number; connection: number };
export type Toast = { event: GameEvent; expires: number };
const seatKey = 'polygon-monopoly-seat';
export const inviteParam = 'room';

export function invitedRoomCode(url = new URL(location.href)): string {
  const code = url.searchParams.get(inviteParam)?.trim().toUpperCase() ?? '';
  return code.length === 4 && Array.from(code).every((letter) => ROOM_ALPHABET.includes(letter))
    ? code
    : '';
}

function resetHomeAddress() {
  if (location.pathname !== '/' || location.search || location.hash) {
    history.replaceState(history.state, '', '/');
  }
}

export function loadSeat(): SavedSeat | undefined {
  try {
    const id = sessionStorage.getItem(seatKey);
    const saved = id && localStorage.getItem(`${seatKey}:${id}`);
    if (!saved) return;
    const seat = JSON.parse(saved) as Partial<SavedSeat> | null;
    if (seat?.you !== id || typeof seat.code !== 'string' || typeof seat.token !== 'string') return;
    const invite = invitedRoomCode();
    if (!invite || invite === seat.code) return { code: seat.code, token: seat.token, you: id };
  } catch {}
}

function saveSeat(seat: SavedSeat) {
  try {
    localStorage.setItem(`${seatKey}:${seat.you}`, JSON.stringify(seat));
    sessionStorage.setItem(seatKey, seat.you);
  } catch {}
}

function clearSeat(removeSaved: boolean) {
  try {
    const id = sessionStorage.getItem(seatKey);
    sessionStorage.removeItem(seatKey);
    if (id && removeSaved) localStorage.removeItem(`${seatKey}:${id}`);
  } catch {}
}

export function useConnection() {
  const [initialSeat] = useState(loadSeat);
  const saved = useRef(initialSeat);
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef<ClientMsg['t']>(undefined);
  const lastSeenEventId = useRef(0);
  const connection = useRef(0);
  const [cycle, setCycle] = useState(0);
  const [you, setYou] = useState(initialSeat?.you);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [ready, setReady] = useState(false);
  const [retrying, setRetrying] = useState(Boolean(initialSeat));
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${location.host}/ws`);
      socket.current = ws;
      let rejoining = false;
      let firstState = true;
      let welcome: Extract<ServerMsg, { t: 'welcome' }> | undefined;

      ws.onopen = () => {
        if (disposed) return;
        const seat = saved.current;
        if (seat) {
          rejoining = true;
          ws.send(
            JSON.stringify({
              t: 'rejoin',
              code: seat.code,
              token: seat.token,
            } satisfies ClientMsg),
          );
        } else {
          setReady(true);
          setRetrying(false);
        }
      };
      ws.onmessage = ({ data }) => {
        if (disposed) return;
        const message: ServerMsg = JSON.parse(data);
        if (message.t === 'welcome') {
          rejoining = false;
          welcome = message;
          setYou(message.you);
          return;
        }
        if (message.t === 'left') {
          home(message.reason === 'projector-ended' ? wireStrings.sessionEnded : '');
          return;
        }
        if (message.t === 'state') {
          if (firstState || pending.current !== 'leave') pending.current = undefined;
          const state = message.state;
          const now = Date.now();
          if (welcome) {
            saved.current = {
              code: state.code,
              token: welcome.token,
              you: welcome.you,
            };
            saveSeat(saved.current);
            const url = new URL(location.href);
            if (invitedRoomCode(url) === state.code) {
              url.searchParams.delete(inviteParam);
              history.replaceState(history.state, '', url);
            }
            welcome = undefined;
          }
          if (firstState) {
            firstState = false;
            connection.current += 1;
            setToasts([]);
            setLeaving(false);
          } else {
            const id = saved.current?.you;
            const fresh = state.events.filter((event) => event.id > lastSeenEventId.current);
            if (fresh.length) {
              const entries = fresh.map((event) => {
                const mine =
                  ('player' in event && event.player === id) ||
                  (event.kind === 'rent' && event.to === id);
                if (
                  mine &&
                  (event.kind === 'buy' ||
                    event.kind === 'rent' ||
                    event.kind === 'tax' ||
                    (event.kind === 'chance' && event.amount <= 0))
                )
                  navigator.vibrate?.(50);
                return { event, expires: now + (mine ? 4000 : 2500) };
              });
              setToasts((current) =>
                [
                  ...(fresh.some((event) => event.kind === 'rematch')
                    ? []
                    : current.filter(({ expires }) => expires > now)),
                  ...entries,
                ].slice(-3),
              );
            }
          }
          lastSeenEventId.current = state.events.at(-1)?.id ?? 0;
          setSnapshot({
            state,
            offset: state.now - now,
            connection: connection.current,
          });
          setReady(true);
          setRetrying(false);
          setError('');
        } else {
          if (rejoining) {
            if (pending.current === 'leave') {
              home();
              return;
            }
            rejoining = false;
            saved.current = undefined;
            clearSeat(true);
            setSnapshot(undefined);
            setYou(undefined);
            setReady(true);
            setRetrying(false);
          }
          pending.current = undefined;
          setLeaving(false);
          setError(message.msg);
        }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        if (pending.current !== 'leave') pending.current = undefined;
        setToasts([]);
        if (event.code === 4000 || event.code === 4001) {
          pending.current = undefined;
          setLeaving(false);
          saved.current = undefined;
          clearSeat(event.code === 4001);
          setSnapshot(undefined);
          setYou(undefined);
          setError(event.code === 4001 ? wireStrings.error.removed : wireStrings.error.seatMoved);
        }
        setReady(false);
        setRetrying(true);
        retry = setTimeout(connect, 2000);
      };
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket.current?.close();
    };
  }, [cycle]);

  useEffect(() => {
    if (!toasts.length) return;
    const next = Math.min(...toasts.map(({ expires }) => expires));
    const timer = setTimeout(
      () => setToasts((current) => current.filter(({ expires }) => expires > Date.now())),
      Math.max(1, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [toasts]);

  function send(message: ClientMsg) {
    const ws = socket.current;
    if (!ready || pending.current || ws?.readyState !== WebSocket.OPEN) return false;
    setError('');
    pending.current = message.t;
    if (message.t === 'leave') setLeaving(true);
    ws.send(JSON.stringify(message));
    return true;
  }

  function backHome() {
    resetHomeAddress();
    setError('');
  }

  function home(message = '') {
    saved.current = undefined;
    clearSeat(true);
    resetHomeAddress();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    pending.current = undefined;
    setLeaving(false);
    setReady(false);
    setRetrying(false);
    setSnapshot(undefined);
    setYou(undefined);
    setError(message);
    setToasts([]);
    setCycle((value) => value + 1);
  }

  return {
    snapshot,
    you,
    send,
    ready,
    retrying,
    error,
    leaving,
    backHome,
    toasts,
  };
}
