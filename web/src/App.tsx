import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import {
  BUY_SECONDS,
  GAME_MINUTES,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  QUESTION_SECONDS,
  ROLL_SECONDS,
  ROOM_ALPHABET,
  TILES,
  netWorth,
  type ClientMsg,
  type GameEvent,
  type Player,
  type PublicQuestion,
  type PublicState,
  type ServerMsg,
} from '../../shared/game';
import Board, { TileIcon } from './Board';
import Polygon from './Polygon';
import { Avatar, AVATARS } from './avatars';
import { strings as s } from './strings';

type SavedSeat = { code: string; token: string; you: string };
type Snapshot = { state: PublicState; offset: number; connection: number };
type AnswerResult = NonNullable<PublicState['result']>;
type Toast = { event: GameEvent; expires: number };
const seatKey = 'polygon-monopoly-seat';
const inviteParam = 'room';

function invitedRoomCode(url = new URL(location.href)): string {
  const code = url.searchParams.get(inviteParam)?.trim().toUpperCase() ?? '';
  return code.length === 4 && Array.from(code).every((letter) => ROOM_ALPHABET.includes(letter))
    ? code
    : '';
}

function loadSeat(): SavedSeat | undefined {
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

function useConnection() {
  const [initialSeat] = useState(loadSeat);
  const saved = useRef(initialSeat);
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef(false);
  const lastSeenEventId = useRef(0);
  const connection = useRef(0);
  const [cycle, setCycle] = useState(0);
  const [you, setYou] = useState(initialSeat?.you);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [ready, setReady] = useState(false);
  const [retrying, setRetrying] = useState(Boolean(initialSeat));
  const [error, setError] = useState('');
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
            JSON.stringify({ t: 'rejoin', code: seat.code, token: seat.token } satisfies ClientMsg),
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
        pending.current = false;
        if (message.t === 'state') {
          const state = message.state;
          const now = Date.now();
          if (welcome) {
            saved.current = { code: state.code, token: welcome.token, you: welcome.you };
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
              setToasts((shown) =>
                [...shown.filter(({ expires }) => expires > now), ...entries].slice(-3),
              );
            }
          }
          lastSeenEventId.current = state.events.at(-1)?.id ?? 0;
          setSnapshot({ state, offset: state.now - now, connection: connection.current });
          setReady(true);
          setRetrying(false);
          setError('');
        } else {
          if (rejoining) {
            rejoining = false;
            saved.current = undefined;
            clearSeat(true);
            setSnapshot(undefined);
            setYou(undefined);
            setReady(true);
            setRetrying(false);
          }
          setError(message.msg);
        }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        pending.current = false;
        setToasts([]);
        if (event.code === 4000) {
          saved.current = undefined;
          clearSeat(false);
          setSnapshot(undefined);
          setYou(undefined);
          setError(s.error.seatMoved);
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
      () => setToasts((shown) => shown.filter(({ expires }) => expires > Date.now())),
      Math.max(1, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [toasts]);

  function send(message: ClientMsg) {
    const ws = socket.current;
    if (!ready || pending.current || ws?.readyState !== WebSocket.OPEN) return false;
    setError('');
    pending.current = true;
    ws.send(JSON.stringify(message));
    return true;
  }

  function home() {
    saved.current = undefined;
    clearSeat(true);
    pending.current = false;
    setReady(false);
    setRetrying(false);
    setSnapshot(undefined);
    setYou(undefined);
    setError('');
    setToasts([]);
    setCycle((value) => value + 1);
  }

  return { snapshot, you, send, ready, retrying, error, home, toasts };
}

function PlayerToken({ player, size = 24 }: { player: Player; size?: number }) {
  return (
    <span
      className="player-token"
      style={{ backgroundColor: player.color, width: size + 6, height: size + 6 }}
      aria-hidden="true"
    >
      <Avatar id={player.avatar} size={size} />
    </span>
  );
}

function Home({ ready, send }: { ready: boolean; send: (message: ClientMsg) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => invitedRoomCode());
  const nickname = name.trim();

  return (
    <main className="home">
      <div className="home-hero">
        <div className="hero-shapes" aria-hidden="true">
          <div className="hero-triangle">
            <Polygon n={3} fill="#ffcb57" label />
          </div>
          <div className="hero-hexagon">
            <Polygon n={6} fill="#bdf4e4" label />
          </div>
          <div className="hero-octagon">
            <Polygon n={8} fill="#dcd5ff" label />
          </div>
        </div>
        <p className="home-meta">{s.invite(MAX_PLAYERS, GAME_MINUTES)}</p>
        <h1>{s.title}</h1>
      </div>
      <form
        className="home-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 4) send({ t: 'join', name: nickname, code });
          else if (!code) send({ t: 'create', name: nickname });
        }}
      >
        <label htmlFor="nickname">{s.nickname}</label>
        <input
          id="nickname"
          placeholder={s.nicknameHint}
          name="nickname"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="home-modes">
          <button
            type="button"
            className="action primary"
            disabled={!ready || !nickname}
            onClick={() => send({ t: 'create', name: nickname })}
          >
            {s.create}
          </button>
          <button
            type="button"
            className="action secondary"
            disabled={!ready || !nickname}
            onClick={() => send({ t: 'create', name: nickname, withBot: true })}
          >
            {s.playBot}
          </button>
        </div>
        <div className="join-fields">
          <label htmlFor="room-code">{s.code}</label>
          <input
            id="room-code"
            placeholder={s.codeHint}
            name="room-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(event) => {
              const letters = Array.from(event.target.value.toUpperCase()).filter((letter) =>
                ROOM_ALPHABET.includes(letter),
              );
              setCode(letters.slice(0, 4).join(''));
            }}
          />
          <button
            type="submit"
            className="action secondary"
            disabled={!ready || !nickname || code.length !== 4}
          >
            {s.join}
          </button>
        </div>
      </form>
    </main>
  );
}

function LobbyInvite({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false);
  const image = useMemo(() => {
    const url = new URL('/', location.origin);
    url.searchParams.set(inviteParam, code);
    const qr = qrcode(0, 'M');
    qr.addData(url.href);
    qr.make();
    return `data:image/svg+xml,${encodeURIComponent(qr.createSvgTag({ scalable: true }))}`;
  }, [code]);
  const alt = s.inviteQrAlt(code);

  return (
    <section className="room-ticket">
      <div>
        <h1>{s.code}</h1>
        <strong>{code}</strong>
        <p>{s.shareCode}</p>
      </div>
      <button
        type="button"
        className="lobby-qr"
        aria-label={s.expandInviteQr}
        onClick={() => setExpanded(true)}
      >
        <img src={image} alt={alt} width="104" height="104" />
      </button>
      {expanded && (
        <InfoDialog title={s.invitePlayers} close={() => setExpanded(false)}>
          <img className="invite-qr-large" src={image} alt={alt} width="256" height="256" />
          <p className="invite-qr-caption">{s.shareCode}</p>
        </InfoDialog>
      )}
    </section>
  );
}

function Lobby({
  state,
  you,
  ready,
  send,
  home,
}: {
  state: PublicState;
  you?: string;
  ready: boolean;
  send: (message: ClientMsg) => void;
  home: () => void;
}) {
  const host = you === state.hostId;
  const me = state.players.find((player) => player.id === you);
  const bot = state.players.find((player) => player.bot);
  return (
    <main className="lobby">
      {bot ? (
        <section className="room-ticket practice-ticket">
          <div>
            <h1>{s.practice}</h1>
            <p>{s.practiceDescription}</p>
          </div>
          <PlayerToken player={bot} size={54} />
        </section>
      ) : (
        <LobbyInvite code={state.code} />
      )}
      <div className="lobby-content">
        <h2 className="section-label">{s.players(state.players.length, bot ? 2 : MAX_PLAYERS)}</h2>
        <ul className="player-list">
          {state.players.map((player) => (
            <li key={player.id}>
              <PlayerToken player={player} />
              <span className="player-name">{player.name}</span>
              <span className="player-status">
                {player.id === you && <span>{s.you}</span>}
                {player.id === state.hostId && <span>{s.host}</span>}
                {player.bot && <span>{s.computer}</span>}
                {!player.connected && <span>{s.offline}</span>}
              </span>
            </li>
          ))}
        </ul>
        {me && (
          <section className="avatar-picker" aria-labelledby="avatar-heading">
            <h2 id="avatar-heading" className="section-label">
              {s.chooseAvatar}
            </h2>
            <div className="avatar-grid">
              {AVATARS.map(({ id, name }) => {
                const claimant = state.players.find(
                  (player) => player.id !== me.id && player.avatar === id,
                );
                const selected = id === me.avatar;
                return (
                  <button
                    type="button"
                    key={id}
                    className={claimant ? 'avatar-choice avatar-taken' : 'avatar-choice'}
                    aria-label={claimant ? s.avatarClaimedBy(name, claimant.name) : name}
                    aria-pressed={selected}
                    disabled={!ready || Boolean(claimant)}
                    onClick={() => {
                      if (!selected) send({ t: 'avatar', id });
                    }}
                  >
                    <span
                      className="avatar-circle"
                      aria-hidden="true"
                      style={{
                        backgroundColor: claimant
                          ? `color-mix(in srgb, ${me.color} 55%, white)`
                          : me.color,
                        outlineColor: claimant?.color,
                      }}
                    >
                      <Avatar id={id} size={36} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <div className="lobby-footer">
        {host ? (
          <>
            {state.players.length < 2 && <p>{s.waitForPlayers}</p>}
            <button
              className="action primary"
              disabled={!ready || state.players.length < 2}
              onClick={() => send({ t: 'start' })}
            >
              {bot ? s.startPractice : s.start}
            </button>
            {bot && (
              <button className="action secondary" onClick={home}>
                {s.backHome}
              </button>
            )}
          </>
        ) : (
          <p>{s.waitForHost}</p>
        )}
      </div>
    </main>
  );
}

function Results({ state, home }: { state: PublicState; home: () => void }) {
  const ranked = state.players
    .map((player) => ({ player, worth: netWorth(player, state.owners) }))
    .sort((a, b) => b.worth - a.worth);
  const winners = ranked
    .filter(({ worth }) => worth === ranked[0].worth)
    .map(({ player }) => player.name);

  return (
    <main className="results">
      <section className="room-ticket">
        <p>{s.gameOver}</p>
        <h1>{winners.length === 1 ? s.winner(winners[0]) : s.tied(winners)}</h1>
      </section>
      <h2 className="section-label">{s.netWorth}</h2>
      <ol className="player-list ranking">
        {ranked.map(({ player, worth }) => (
          <li key={player.id}>
            <span className="rank">{ranked.findIndex((entry) => entry.worth === worth) + 1}</span>
            <PlayerToken player={player} />
            <span className="player-name">{player.name}</span>
            <strong>{s.money(worth)}</strong>
          </li>
        ))}
      </ol>
      <button className="action primary" onClick={home}>
        {s.backHome}
      </button>
    </main>
  );
}

function InfoDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="info-dialog"
      aria-labelledby="dialog-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="info-card">
        <div className="info-heading">
          <h2 id="dialog-title">{title}</h2>
          <button className="action secondary close" aria-label={s.close} onClick={close}>
            ×
          </button>
        </div>
        <div className="info-scroll">{children}</div>
      </div>
    </dialog>
  );
}

function Owner({ player }: { player?: Player }) {
  return (
    <span className="owner">
      {player && <PlayerToken player={player} size={12} />}
      {player?.name ?? s.unowned}
    </span>
  );
}

function TileInfo({
  index,
  setIndex,
  close,
  browse,
  state,
}: {
  index: number;
  setIndex: (index: number) => void;
  close: () => void;
  browse: () => void;
  state: PublicState;
}) {
  const tile = TILES[index];
  const owner = state.players.find((player) => player.id === state.owners[index]);
  const occupants = state.players
    .filter((player) => player.pos === index)
    .map((player) => player.name);
  const n = tile.n ?? 0;
  const title = tile.kind === 'property' ? s.property(n) : s.tileNames[tile.kind];
  const degrees = (angle: number) => `${Math.round(angle * 100) / 100}°`;

  return (
    <InfoDialog title={title} close={close}>
      {tile.kind === 'property' ? (
        <>
          <div className="tile-diagram">
            <Polygon n={n} mark="both" />
          </div>
          <div className="diagram-key">
            <span>
              <i />
              {s.apothem}
            </span>
            <span>
              <i />
              {s.radius}
            </span>
          </div>
          <dl className="facts">
            <div>
              <dt>{s.interiorAngle}</dt>
              <dd>{degrees(((n - 2) * 180) / n)}</dd>
            </div>
            <div>
              <dt>{s.centralAngle}</dt>
              <dd>{degrees(360 / n)}</dd>
            </div>
            <div>
              <dt>{s.diagonals}</dt>
              <dd>{(n * (n - 3)) / 2}</dd>
            </div>
            <div>
              <dt>{s.price}</dt>
              <dd className="money">{s.money(tile.price!)}</dd>
            </div>
            <div>
              <dt>{s.rent}</dt>
              <dd className="money">{s.money(tile.rent!)}</dd>
            </div>
            <div>
              <dt>{s.owner}</dt>
              <dd>
                <Owner player={owner} />
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <div className="special-detail">
          <TileIcon kind={tile.kind} />
          <p>{s.tileDescriptions[tile.kind]}</p>
        </div>
      )}
      {occupants.length > 0 && <p className="occupants">{s.occupants(occupants)}</p>}
      <div className="tile-nav">
        <button
          className="action secondary"
          aria-label={s.previousTile}
          onClick={() => setIndex((index - 1 + TILES.length) % TILES.length)}
        >
          ‹
        </button>
        <span>{s.tileNumber(index, TILES.length)}</span>
        <button className="action secondary" onClick={browse}>
          {s.tileList}
        </button>
        <button
          className="action secondary"
          aria-label={s.nextTile}
          onClick={() => setIndex((index + 1) % TILES.length)}
        >
          ›
        </button>
      </div>
    </InfoDialog>
  );
}

const propertyGroups = Array.from({ length: 10 }, (_, index) => {
  const n = index + 3;
  return { n, indices: TILES.flatMap((tile, tileIndex) => (tile.n === n ? [tileIndex] : [])) };
});

function TilesSheet({
  state,
  select,
  close,
}: {
  state: PublicState;
  select: (index: number) => void;
  close: () => void;
}) {
  return (
    <InfoDialog title={s.tileList} close={close}>
      {propertyGroups.map(({ n, indices }) => (
        <section className="tile-group" key={n}>
          <h3>{s.property(n)}</h3>
          {indices.map((index) => {
            const tile = TILES[index];
            const owner = state.players.find((player) => player.id === state.owners[index]);
            return (
              <button
                type="button"
                className="property-row"
                key={index}
                onClick={() => select(index)}
              >
                <Polygon n={n} ownerColor={owner?.color} label />
                <span className="property-row-title">
                  {s.property(n)} <small>#{index + 1}</small>
                </span>
                <span className="row-prices money">
                  {s.price} {s.money(tile.price!)} · {s.rent} {s.money(tile.rent!)}
                </span>
                <Owner player={owner} />
              </button>
            );
          })}
        </section>
      ))}
    </InfoDialog>
  );
}

function CurrentTile({
  state,
  diceSum,
  you,
}: {
  state: PublicState;
  diceSum?: number;
  you?: string;
}) {
  const index = state.players[state.turn].pos;
  const latest = state.events.at(-1);
  const tile = TILES[index];
  const owner = state.players.find((player) => player.id === state.owners[index]);

  return (
    <>
      <div className="landing-card">
        {tile.kind === 'property' ? (
          <>
            <Polygon n={tile.n!} ownerColor={owner?.color} label />
            <div>
              <h2>{s.property(tile.n!)}</h2>
              <p className="landing-prices money">
                {s.price} <strong>{s.money(tile.price!)}</strong>
                <span> · </span>
                {s.rent} <strong>{s.money(tile.rent!)}</strong>
              </p>
              <p className="landing-owner">
                {s.owner} <Owner player={owner} />
              </p>
            </div>
          </>
        ) : (
          <>
            <TileIcon kind={tile.kind} />
            <div>
              <h2>{s.tileNames[tile.kind]}</h2>
              <p>{s.tileDescriptions[tile.kind]}</p>
            </div>
          </>
        )}
      </div>
      <p className="latest-log" aria-live="polite">
        {latest && describeEvent(latest, state, you).text}
      </p>
      {diceSum !== undefined && <p className="roll-total">{s.diceSum(diceSum)}</p>}
    </>
  );
}

function RoomCode({ code }: { code: string }) {
  const [feedback, setFeedback] = useState('');
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);

  async function copy() {
    let copied = false;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(code);
        copied = true;
      } catch {}
    }
    if (!copied) {
      const input = document.createElement('textarea');
      const focus = document.activeElement;
      input.value = code;
      input.readOnly = true;
      input.className = 'clipboard-input';
      document.body.append(input);
      input.select();
      try {
        copied = document.execCommand('copy');
      } catch {}
      input.remove();
      if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
    }
    setFeedback(copied ? s.copied : s.copyFailed);
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setFeedback(''), 2000);
  }

  return (
    <span className="room-chip-wrap">
      <button className="action room-chip" aria-label={s.copyCode(code)} onClick={copy}>
        {code}
      </button>
      {feedback && (
        <span className="copy-feedback" role="status">
          {feedback}
        </span>
      )}
    </span>
  );
}

function useGameMotion({ state, connection }: Snapshot) {
  const previous = useRef({ state, connection });
  const [positions, setPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.players.map(({ id, pos }) => [id, pos])),
  );
  const queues = useRef<Record<string, { pos: number; landing?: number }[]>>({});
  const [dice, setDice] = useState(state.dice);
  const [tumbling, setTumbling] = useState(false);
  const [cashChanges, setCashChanges] = useState<Record<string, { delta: number; id: number }>>({});
  const animationId = useRef(0);
  const [landings, setLandings] = useState<Record<number, number>>({});
  const [stamps, setStamps] = useState<Record<number, number>>({});
  const diceTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const diceEnd = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const movementTimer = setInterval(() => {
      const steps: Record<string, number> = {};
      const landed: Record<number, number> = {};
      for (const [id, queue] of Object.entries(queues.current)) {
        const step = queue.shift();
        if (step) {
          steps[id] = step.pos;
          if (step.landing !== undefined) landed[step.pos] = step.landing;
        }
        if (!queue.length) delete queues.current[id];
      }
      if (Object.keys(landed).length) setLandings((shown) => ({ ...shown, ...landed }));
      if (Object.keys(steps).length) setPositions((shown) => ({ ...shown, ...steps }));
    }, 150);
    return () => {
      clearInterval(movementTimer);
      clearInterval(diceTimer.current);
      clearTimeout(diceEnd.current);
    };
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = { state, connection };
    if (before.connection !== connection) {
      queues.current = {};
      clearInterval(diceTimer.current);
      clearTimeout(diceEnd.current);
      setPositions(Object.fromEntries(state.players.map(({ id, pos }) => [id, pos])));
      setTumbling(false);
      setDice(state.dice);
      setLandings({});
      setStamps({});
      setCashChanges({});
      return;
    }
    const newEvents = state.events.filter(({ id }) => id > (before.state.events.at(-1)?.id ?? 0));
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cursors = Object.fromEntries(before.state.players.map(({ id, pos }) => [id, pos]));
    const purchased: Record<number, number> = {};
    const changes: typeof cashChanges = {};
    let rolled = false;

    for (const event of newEvents) {
      if (event.kind === 'buy') purchased[event.tile] = event.id;
      if (event.kind !== 'roll') continue;
      const from = cursors[event.player];
      const distance = event.dice[0] + event.dice[1];
      const landing = (from + distance) % TILES.length;
      cursors[event.player] = landing;
      rolled = true;
      if (!reduceMotion) {
        const queue = (queues.current[event.player] ??= []);
        for (let step = 1; step <= distance; step += 1) {
          queue.push({
            pos: (from + step) % TILES.length,
            landing: step === distance ? event.id : undefined,
          });
        }
      }
    }
    const snapped: Record<string, number> = {};
    for (const player of state.players) {
      const old = before.state.players.find(({ id }) => id === player.id);
      if (reduceMotion || !old || cursors[player.id] !== player.pos) {
        delete queues.current[player.id];
        snapped[player.id] = player.pos;
      }
      if (old && player.cash !== old.cash) {
        changes[player.id] = { delta: player.cash - old.cash, id: ++animationId.current };
      }
    }
    if (Object.keys(snapped).length) setPositions((shown) => ({ ...shown, ...snapped }));
    if (Object.keys(purchased).length) setStamps((shown) => ({ ...shown, ...purchased }));
    if (Object.keys(changes).length) setCashChanges((shown) => ({ ...shown, ...changes }));

    if (rolled && state.dice) {
      clearInterval(diceTimer.current);
      clearTimeout(diceEnd.current);
      if (reduceMotion) {
        setDice(state.dice);
        setTumbling(false);
      } else {
        const randomFaces = () =>
          setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
        setTumbling(true);
        randomFaces();
        diceTimer.current = setInterval(randomFaces, 75);
        diceEnd.current = setTimeout(() => {
          clearInterval(diceTimer.current);
          setDice(state.dice);
          setTumbling(false);
        }, 600);
      }
    }
  }, [state, connection]);

  return { positions, dice, tumbling, cashChanges, landings, stamps };
}

function describeEvent(event: GameEvent, state: PublicState, you?: string) {
  const player =
    'player' in event ? state.players.find(({ id }) => id === event.player) : undefined;
  const mine = player?.id === you && Boolean(player);
  const p = mine ? s.you : (player?.name ?? '');
  const n = 'tile' in event ? TILES[event.tile].n! : 0;
  const amount = 'amount' in event ? s.money(Math.abs(event.amount)) : '';
  const eventText = s.events;
  let text: string;
  let tone = 'info';
  switch (event.kind) {
    case 'joined':
      text = eventText.joined(p);
      break;
    case 'left':
      text = eventText.left(p);
      break;
    case 'back':
      text = eventText.back(p, mine);
      break;
    case 'started':
      text = eventText.started;
      tone = 'good';
      break;
    case 'over':
      text = eventText.over;
      break;
    case 'oneMinute':
      text = eventText.oneMinute;
      break;
    case 'roll':
      text = eventText.roll(p, ...event.dice);
      break;
    case 'lap':
      text = eventText.lap(p, amount);
      tone = 'good';
      break;
    case 'question':
      text = eventText.question(
        p,
        mine,
        event.q === 'chance' ? 'chance' : event.mystery ? 'mystery' : n,
      );
      break;
    case 'answer':
      text = event.timeout
        ? eventText.timeout(p)
        : event.correct
          ? eventText.correct(p)
          : eventText.wrong(p);
      tone = event.correct ? 'good' : 'bad';
      break;
    case 'buy':
      text = eventText.buy(p, n, amount);
      tone = 'good';
      break;
    case 'skip':
      text = eventText.skip(p, n);
      break;
    case 'cantAfford':
      text = eventText.cantAfford(p, n);
      tone = 'bad';
      break;
    case 'rent': {
      const payee =
        event.to === you ? s.you : (state.players.find(({ id }) => id === event.to)?.name ?? '');
      text = eventText.rent(p, amount, payee, event.half);
      tone = event.to === you ? 'good' : 'bad';
      break;
    }
    case 'tax':
      text = eventText.tax(p, amount);
      tone = 'bad';
      break;
    case 'chance':
      text = eventText.chance(p, amount, event.amount > 0);
      tone = event.amount > 0 ? 'good' : 'bad';
      break;
    case 'rest':
      text = eventText.rest(p, mine);
      break;
  }
  return { text, tone, player };
}

function EventMessage({
  event,
  state,
  you,
}: {
  event: GameEvent;
  state: PublicState;
  you?: string;
}) {
  const { text, tone, player } = describeEvent(event, state, you);
  return (
    <li className={`event-message event-${tone}`}>
      {player && <PlayerToken player={player} size={16} />}
      <span>{text}</span>
    </li>
  );
}

function questionStakes(
  question: PublicQuestion,
  state: PublicState,
  you?: string,
): [string, string] {
  const active = state.players[state.turn];
  const name = active.id === you ? undefined : active.name;
  const tile = TILES[question.tile];
  switch (question.kind) {
    case 'buy':
      return [s.stakes.buyRight(s.money(tile.price!), name), s.stakes.buyWrong];
    case 'rent': {
      const owner = state.players.find(({ id }) => id === state.owners[question.tile])!;
      return [
        s.stakes.rentRight(s.money(tile.rent! / 2), name),
        s.stakes.rentWrong(s.money(tile.rent!), owner.name, name),
      ];
    }
    case 'chance':
      return [s.stakes.chanceRight, s.stakes.chanceWrong];
  }
}

function Stakes({ lines }: { lines: [string, string] }) {
  return (
    <span className="stakes">
      <span className="right-stake">✓ {lines[0]}</span>{' '}
      <span className="wrong-stake">✗ {lines[1]}</span>
    </span>
  );
}

function QuestionSheet({
  question,
  player,
  mine,
  actionable,
  failed,
  stakes,
  progress,
  send,
}: {
  question: PublicQuestion;
  player: Player;
  mine: boolean;
  actionable: boolean;
  failed: boolean;
  stakes: [string, string];
  progress: ReactNode;
  send: (message: ClientMsg) => boolean;
}) {
  const [selection, select] = useState<number>();
  const [sent, markSent] = useState(false);
  useEffect(() => {
    if (failed) markSent(false);
  }, [failed]);
  const disabled = !actionable || (sent && !failed);
  return (
    <section
      className={`game-sheet question-sheet ${mine ? 'my-question' : 'watch-question'}`}
      aria-labelledby="question-title"
    >
      <p className="question-ribbon" style={mine ? { backgroundColor: player.color } : undefined}>
        {mine ? s.yourQuestion : s.theirQuestion(player.name)}
      </p>
      <div className="question-content">
        <div
          className={`question-prompt${question.n === undefined ? ' mystery-prompt' : ''}`}
          lang="es"
        >
          {question.n !== undefined && (
            <div className="question-diagram">
              <Polygon n={question.n} mark={question.mark} />
            </div>
          )}
          <h2 id="question-title">{question.text}</h2>
        </div>
        <p className="question-hint" lang="es">
          <span aria-hidden="true">💡 </span>
          {question.hint}
        </p>
        {mine ? (
          <>
            <p>
              <Stakes lines={stakes} />
            </p>
            <div className="answer-grid" lang="es">
              {question.options.map((option, index) => (
                <button
                  className="action answer"
                  key={option}
                  disabled={disabled}
                  aria-pressed={selection === index}
                  onClick={() => select(index)}
                >
                  {selection === index && <span aria-hidden="true">✓ </span>}
                  {option}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <ul className="answer-grid watch-options" lang="es">
              {question.options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ul>
            <p>
              <Stakes lines={stakes} />
            </p>
            <p className="watch-note">{s.watchOnly(player.name)}</p>
          </>
        )}
      </div>
      {mine && (
        <button
          className="action primary lock-answer"
          disabled={disabled || selection === undefined}
          onClick={() => {
            if (selection !== undefined && send({ t: 'answer', index: selection })) markSent(true);
          }}
        >
          {sent && !failed ? s.answerSent : s.lockAnswer}
        </button>
      )}
      {progress}
    </section>
  );
}

function HowTo({ close }: { close: () => void }) {
  const [step, setStep] = useState(0);
  const total = s.howToCards.length;
  const last = step === total - 1;
  return (
    <InfoDialog title={s.howTo} close={close}>
      <div className="tutorial-polygon">
        <Polygon
          n={[3, 5, 6, 8, 10][step]}
          mark={step === 1 ? 'radius' : step === 2 ? 'apothem' : 'none'}
          label
        />
      </div>
      <p className="tutorial-copy">{s.howToCards[step]}</p>
      {step === 3 && (
        <ul className="tutorial-legend">
          {(['start', 'rest', 'chance', 'tax'] as const).map((kind) => (
            <li key={kind}>
              <TileIcon kind={kind} />
              <span>
                <strong>{s.tileNames[kind]}</strong>
                {s.tileDescriptions[kind]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="tutorial-dots" role="img" aria-label={s.howToStep(step + 1, total)}>
        {s.howToCards.map((_, index) => (
          <span key={index} className={index === step ? 'active' : undefined} />
        ))}
      </div>
      <div className="tutorial-actions">
        <button
          className="action secondary"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          {s.howToBack}
        </button>
        <button className="action primary" onClick={() => (last ? close() : setStep(step + 1))}>
          {last ? s.howToDone : s.howToNext}
        </button>
      </div>
    </InfoDialog>
  );
}

function Game({
  snapshot,
  you,
  ready,
  error,
  send,
  home,
  openHowTo,
  feedback,
}: {
  snapshot: Snapshot;
  you?: string;
  ready: boolean;
  error: string;
  send: (message: ClientMsg) => boolean;
  home: () => void;
  openHowTo: () => void;
  feedback?: ReactNode;
}) {
  const { state, offset } = snapshot;
  const [clock, setClock] = useState(Date.now);
  const [sheet, setSheet] = useState<'tiles' | 'formulas' | 'log' | 'leave' | number>();
  const { positions, dice, tumbling, cashChanges, landings, stamps } = useGameMotion(snapshot);
  const currentChip = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const chip = currentChip.current;
    const strip = chip?.parentElement;
    if (!chip || !strip) return;
    const { left, right } = chip.getBoundingClientRect();
    const bounds = strip.getBoundingClientRect();
    if (left < bounds.left) strip.scrollLeft += left - bounds.left - 4;
    if (right > bounds.right) strip.scrollLeft += right - bounds.right + 4;
  }, [state.turn]);

  const now = clock + offset;
  const gameSeconds = Math.max(0, Math.ceil((state.endsAt! - now) / 1000));
  const phaseSeconds = Math.max(0, Math.ceil((state.deadline! - now) / 1000));
  const player = state.players[state.turn];
  const myTurn = player.id === you;
  const actionable = myTurn && ready && phaseSeconds > 0 && gameSeconds > 0;
  const question = state.question;
  const property = TILES[player.pos];
  const rollPhase = state.phase === 'roll';
  const clockLabel = `${Math.floor(gameSeconds / 60)}:${String(gameSeconds % 60).padStart(2, '0')}`;
  const fraction = (duration: number) =>
    Math.max(0, Math.min(1, (state.deadline! - now) / (duration * 1000)));
  const urgent = phaseSeconds <= 5;
  const progress = (duration: number) => (
    <span className={`countdown${urgent ? ' urgent' : ''}`} aria-hidden="true">
      <span style={{ transform: `scaleX(${fraction(duration)})` }} />
    </span>
  );
  const close = () => setSheet(undefined);
  const stakes = question ? questionStakes(question, state, you) : undefined;
  const buyPhase = state.phase === 'buy';
  const deadlineDuration = rollPhase ? ROLL_SECONDS : question ? QUESTION_SECONDS : BUY_SECONDS;
  const headline = rollPhase
    ? myTurn
      ? s.banner.roll
      : s.banner.otherRoll(player.name)
    : question
      ? myTurn
        ? s.banner.question
        : s.banner.otherQuestion(player.name)
      : myTurn
        ? s.banner.buy
        : s.banner.otherBuy(player.name);
  const hint = rollPhase ? (
    myTurn ? (
      s.banner.rollHint
    ) : (
      s.banner.otherRollHint
    )
  ) : question ? (
    myTurn ? (
      <Stakes lines={stakes!} />
    ) : (
      s.banner.otherQuestionHint(player.name, question.n)
    )
  ) : myTurn ? (
    s.banner.buyHint
  ) : (
    s.banner.otherBuyHint
  );

  return (
    <main
      className={`game ${question ? (myTurn ? 'live-question' : 'spectator-question') : buyPhase ? 'buy-phase' : ''}`}
    >
      <header className="game-header">
        <h1>{s.title}</h1>
        {state.players.some((player) => player.bot) ? (
          <button className="action secondary" onClick={() => setSheet('leave')}>
            {s.leavePractice}
          </button>
        ) : (
          state.code && <RoomCode code={state.code} />
        )}
        <span
          className={`game-clock${gameSeconds <= 60 ? ' final-minute' : ''}`}
          aria-label={`${s.clock} ${clockLabel}`}
        >
          {clockLabel}
        </span>
      </header>
      <section
        className={`turn-banner${myTurn ? ' my-turn' : ''}`}
        style={{ '--turn-color': player.color } as CSSProperties}
      >
        <PlayerToken player={player} size={30} />
        <div className="turn-copy">
          <h2 aria-live="polite">{headline}</h2>
          <p className="turn-hint">{hint}</p>
        </div>
        <div className="turn-ring" role="img" aria-label={s.turnTime(phaseSeconds)}>
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="19" />
            <circle
              className="remaining"
              cx="22"
              cy="22"
              r="19"
              pathLength="100"
              strokeDasharray={`${fraction(deadlineDuration) * 100} 100`}
            />
          </svg>
          <span>{phaseSeconds}</span>
        </div>
      </section>
      <Board state={state} positions={positions} landings={landings} stamps={stamps}>
        <CurrentTile
          state={state}
          you={you}
          diceSum={dice && !tumbling ? dice[0] + dice[1] : undefined}
        />
      </Board>
      <section className="dock">
        <ul className="player-chips" aria-label={s.scoreboard}>
          {state.players.map((candidate) => {
            const change = cashChanges[candidate.id];
            const worth = s.money(netWorth(candidate, state.owners));
            return (
              <li
                className={`player-chip${candidate.id === player.id ? ' current-chip' : ''}${candidate.connected ? '' : ' offline-chip'}`}
                key={candidate.id}
                ref={candidate.id === player.id ? currentChip : undefined}
                style={{ borderColor: candidate.id === player.id ? candidate.color : undefined }}
                aria-current={candidate.id === player.id ? 'true' : undefined}
              >
                <span className="chip-name">
                  <PlayerToken player={candidate} size={14} />
                  {candidate.id === player.id && (
                    <span className="turn-marker" aria-hidden="true">
                      ▶
                    </span>
                  )}
                  <span>{candidate.name}</span>
                  {!candidate.connected && <span className="sr-only"> {s.offline}</span>}
                </span>
                <strong className="money">
                  <span className="sr-only">{s.netWorth} </span>
                  {worth}
                </strong>
                <span className={`chip-cash money${change ? ' cash-flash' : ''}`} key={change?.id}>
                  {s.cashValue(s.money(candidate.cash))}
                  {change && (
                    <span
                      className={`cash-float ${change.delta > 0 ? 'gain' : 'loss'}`}
                      aria-hidden="true"
                    >
                      {s.cashChange(change.delta)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {buyPhase ? (
          <section className="buy-offer" aria-labelledby="buy-offer-title">
            <h3 id="buy-offer-title" className="money">
              {myTurn
                ? s.buyOffer(property.n!, s.money(property.price!))
                : s.otherBuyOffer(player.name, property.n!, s.money(property.price!))}
            </h3>
            {myTurn && (
              <p className="money">
                {s.buyRent(s.money(property.rent!), s.money(property.rent! / 2))}
              </p>
            )}
            <div className="buy-actions">
              {myTurn ? (
                <>
                  <button
                    className="action primary money"
                    disabled={!actionable}
                    onClick={() => send({ t: 'buy' })}
                  >
                    {s.buy(property.price!)}
                  </button>
                  <button
                    className="action secondary"
                    disabled={!actionable}
                    onClick={() => send({ t: 'skip' })}
                  >
                    {s.skip}
                  </button>
                </>
              ) : (
                <p className="buy-wait">{s.deciding(player.name)}</p>
              )}
            </div>
          </section>
        ) : (
          !(question && myTurn) && (
            <div className="action-row">
              {rollPhase && (
                <div
                  className={`dice${tumbling ? ' tumbling' : ''}`}
                  role="img"
                  aria-label={tumbling ? s.rolling : dice ? s.dice(...dice) : s.noDice}
                >
                  <span>{dice?.[0] ?? '–'}</span>
                  <span>{dice?.[1] ?? '–'}</span>
                </div>
              )}
              <button
                className={`action primary roll-button${rollPhase ? '' : ' waiting-action'}`}
                disabled={!rollPhase || !actionable}
                onClick={() => send({ t: 'roll' })}
              >
                {rollPhase
                  ? myTurn
                    ? s.roll
                    : s.waitingFor(player.name)
                  : s.answering(player.name)}
              </button>
            </div>
          )
        )}
        <nav className="dock-tools">
          <button className="action secondary" onClick={() => setSheet('tiles')}>
            {s.tileList}
          </button>
          <button className="action secondary" onClick={() => setSheet('formulas')}>
            {s.formulas}
          </button>
          <button className="action secondary" onClick={() => setSheet('log')}>
            {s.eventLog}
          </button>
          <button className="action secondary" aria-label={s.howTo} onClick={openHowTo}>
            ?
          </button>
        </nav>
      </section>
      {question && stakes && (
        <QuestionSheet
          key={`${snapshot.connection}-${state.deadline}-${state.turn}-${state.result?.id}`}
          question={question}
          player={player}
          mine={myTurn}
          actionable={actionable}
          failed={!ready || Boolean(error)}
          stakes={stakes}
          progress={progress(QUESTION_SECONDS)}
          send={send}
        />
      )}
      {feedback}
      {sheet === 'formulas' && (
        <InfoDialog title={s.formulas} close={close}>
          <p>{s.formulaNotes}</p>
          <dl className="facts">
            {s.formulaList.map(([label, formula]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formula}</dd>
              </div>
            ))}
          </dl>
        </InfoDialog>
      )}
      {sheet === 'tiles' && <TilesSheet state={state} select={setSheet} close={close} />}
      {sheet === 'log' && (
        <InfoDialog title={s.eventLog} close={close}>
          {state.events.length ? (
            <ol className="event-list" reversed>
              {state.events
                .slice()
                .reverse()
                .map((event) => (
                  <EventMessage key={event.id} event={event} state={state} you={you} />
                ))}
            </ol>
          ) : (
            <p>{s.emptyLog}</p>
          )}
        </InfoDialog>
      )}
      {sheet === 'leave' && (
        <InfoDialog title={s.leavePracticeTitle} close={close}>
          <div className="leave-practice-actions">
            <button className="action primary" onClick={close}>
              {s.keepPlaying}
            </button>
            <button className="action secondary" onClick={home}>
              {s.leave}
            </button>
          </div>
        </InfoDialog>
      )}
      {typeof sheet === 'number' && (
        <TileInfo
          state={state}
          index={sheet}
          setIndex={setSheet}
          close={close}
          browse={() => setSheet('tiles')}
        />
      )}
    </main>
  );
}

function ResultOverlay({
  result,
  name,
  mine,
  dismiss,
}: {
  result: AnswerResult;
  name: string;
  mine: boolean;
  dismiss: () => void;
}) {
  const correct = result.chosen === result.correct;
  const timedOut = result.chosen === -1;
  const who = mine ? s.you : name;
  const title = timedOut
    ? s.resultTimeout(who)
    : correct
      ? s.resultCorrect(who)
      : s.resultIncorrect(who);
  const others = result.options.filter(
    (_, index) => index !== result.correct && index !== result.chosen,
  );
  return (
    <section
      className={`answer-result ${correct ? 'result-success' : timedOut ? 'result-timeout' : 'result-miss'}`}
      aria-labelledby="result-title"
      aria-live="polite"
    >
      <div className="solution-heading">
        <h2 id="result-title">{title}</h2>
        <button className="solution-close" aria-label={s.close} onClick={dismiss}>
          ×
        </button>
      </div>
      <div className="result-question">
        <Polygon n={result.n} mark={result.mark} />
        <p lang="es">{result.text}</p>
      </div>
      <dl className="result-options">
        <div className="correct">
          <dt>{s.correctAnswer}</dt>
          <dd lang="es">{result.options[result.correct]}</dd>
        </div>
        {!timedOut && !correct && (
          <div className="wrong">
            <dt>{mine ? s.yourAnswer : s.playerAnswer(name)}</dt>
            <dd lang="es">{result.options[result.chosen]}</dd>
          </div>
        )}
      </dl>
      <p className="result-other-options">{s.otherOptions(others)}</p>
      <div className="worked-solution">
        <h3>{s.workedSolution}</h3>
        <p className="explanation" lang="es">
          {result.explanation}
        </p>
      </div>
    </section>
  );
}

export default function App() {
  const { snapshot, you, send, ready, retrying, error, home, toasts } = useConnection();
  const state = snapshot?.state;
  const seen = useRef<{ connection: number; id?: number }>(undefined);
  const [result, showResult] = useState<AnswerResult>();
  const [tutorial, setTutorial] = useState(false);
  const readHowTo = useRef(false);
  const playing = Boolean(state && state.phase !== 'lobby' && state.phase !== 'over');
  const myTurn = playing && state?.players[state.turn].id === you;

  useEffect(() => {
    if (!state) {
      setTutorial(false);
      return;
    }
    if (state.phase !== 'lobby' || readHowTo.current) return;
    readHowTo.current = true;
    try {
      if (localStorage.getItem('seenHowTo')) return;
      localStorage.setItem('seenHowTo', '1');
    } catch {}
    setTutorial(true);
  }, [state?.phase]);

  useEffect(() => {
    document.title = myTurn ? s.turnTitle : s.title;
    if (myTurn) navigator.vibrate?.(200);
  }, [myTurn]);

  useEffect(() => {
    const previous = seen.current;
    seen.current = snapshot && { connection: snapshot.connection, id: snapshot.state.result?.id };
    if (!state?.result || !previous || previous.connection !== snapshot?.connection) {
      showResult(undefined);
      return;
    }
    if (previous.id !== state.result.id) {
      showResult(state.result);
      const timer = setTimeout(() => showResult(undefined), 6000);
      return () => clearTimeout(timer);
    }
  }, [snapshot?.connection, state?.result?.id]);

  const feedback =
    state && (toasts.length > 0 || result) ? (
      <div className="feedback-layer">
        <ul className="toast-stack" aria-live="polite" aria-relevant="additions">
          {toasts.map(({ event }) => (
            <EventMessage key={event.id} event={event} state={state} you={you} />
          ))}
        </ul>
        {result && (
          <div className="solution-space">
            <ResultOverlay
              key={result.id}
              result={result}
              mine={result.playerId === you}
              name={state.players.find((player) => player.id === result.playerId)?.name ?? ''}
              dismiss={() => showResult(undefined)}
            />
          </div>
        )}
      </div>
    ) : undefined;

  let screen: ReactNode;
  if (!snapshot) {
    screen = <Home ready={ready} send={send} />;
  } else if (snapshot.state.phase === 'lobby') {
    screen = <Lobby state={snapshot.state} you={you} ready={ready} send={send} home={home} />;
  } else if (snapshot.state.phase === 'over') {
    screen = <Results state={snapshot.state} home={home} />;
  } else {
    screen = (
      <Game
        snapshot={snapshot}
        you={you}
        ready={ready}
        error={error}
        send={send}
        home={home}
        feedback={feedback}
        openHowTo={() => setTutorial(true)}
      />
    );
  }

  return (
    <div className="app">
      <div className={`screen${playing ? ' playing' : ''}`}>
        {screen}
        {!playing && feedback}
        {tutorial && state && <HowTo close={() => setTutorial(false)} />}
        {(retrying || !ready || error) && (
          <div className="status" role="status">
            {retrying ? s.reconnecting : error || s.connecting}
          </div>
        )}
      </div>
      <p className="rotate-message">{s.rotate}</p>
    </div>
  );
}
