import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import qrcode from 'qrcode-generator';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleQuestionMark,
  Lightbulb,
  Maximize,
  Minimize,
  Minus,
  Play,
  X,
} from 'lucide-react';
import {
  AVATAR_IDS,
  MAX_PLAYERS,
  ROOM_ALPHABET,
  TILES,
  netWorth,
  topicTheme,
  type AnswerResult,
  type ClientMsg,
  type GameEvent,
  type Language,
  type Player,
  type PublicQuestion,
  type PublicState,
  type QuestionSolution,
  type ServerMsg,
  type Topic,
} from '../../shared/game';
import Board, { ChessBoard, chessMoveLabel, PlayerAvatar, TileIcon } from './Board';
import { TopicArt, propertyName } from './TopicArt';
import { GameSettingsScreen, Home, LanguagePicker, SettingsSummary } from './RoomSetup';
import {
  LanguageContext,
  strings as wireStrings,
  useLanguage,
  useStrings,
  type Strings,
} from './strings';

type SavedSeat = { code: string; token: string; you: string };
type Snapshot = { state: PublicState; offset: number; connection: number };
type ReviewPanel = 'answers' | 'recap';
type Toast = { event: GameEvent; expires: number };
const seatKey = 'polygon-monopoly-seat';
const inviteParam = 'room';

function invitedRoomCode(url = new URL(location.href)): string {
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

function ExitConfirmation({
  state,
  you,
  ready,
  leaving,
  status,
  close,
  confirm,
}: {
  state: PublicState;
  you?: string;
  ready: boolean;
  leaving: boolean;
  status: string;
  close: () => void;
  confirm: () => void;
}) {
  const s = useStrings();
  const lobby = state.phase === 'lobby';
  const host = you === state.hostId;
  const presenter = host && state.mode === 'projector';
  const remaining = state.players.filter(({ id }) => id !== you).length;
  const action = presenter ? s.endSession : lobby ? s.leaveRoom : s.leaveGame;
  const seat = lobby ? s.exit.freeSeat : s.exit.forfeit;
  let consequence = '';
  if (presenter) {
    consequence = lobby ? s.exit.closeProjector : s.exit.finishProjector;
  } else if (state.mode === 'practice') {
    consequence = s.exit.practice;
  } else if (state.mode === 'friends' && remaining === 0) {
    consequence = s.exit.lastPlayer;
  } else {
    if (state.mode === 'friends' && host) consequence = s.exit.handoff;
    if (!lobby && remaining === 1) consequence += `${consequence ? ' ' : ''}${s.exit.lastOpponent}`;
  }

  return (
    <InfoDialog title={s.exit.question(action)} close={close} dismissible={!leaving}>
      <div className="exit-confirmation">
        {!presenter && state.mode !== 'practice' && <p>{seat}</p>}
        {consequence && <p>{consequence}</p>}
        <div className="exit-actions">
          <button className="action secondary" onClick={close} disabled={leaving}>
            {s.cancel}
          </button>
          <button className="action danger" disabled={!ready || leaving} onClick={confirm}>
            {leaving ? s.leaving : action}
          </button>
        </div>
        {status && <p role="status">{status}</p>}
      </div>
    </InfoDialog>
  );
}

function PlayerToken({ player, size = 30 }: { player: Player; size?: number }) {
  return (
    <span
      className="player-token"
      style={{
        backgroundColor: player.color,
        width: size + 6,
        height: size + 6,
      }}
      aria-hidden="true"
    >
      <PlayerAvatar id={player.avatar} />
    </span>
  );
}

function LobbyInvite({ code }: { code: string }) {
  const s = useStrings();
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

function FullscreenButton() {
  const s = useStrings();
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const label = active ? s.exitFullscreen : s.fullscreen;
  const Icon = active ? Minimize : Maximize;
  return (
    <div className="fullscreen-control">
      <button
        className="action secondary"
        aria-label={label}
        onClick={async () => {
          setFailed(false);
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
          } catch {
            setFailed(true);
          }
        }}
      >
        <span className="fullscreen-label">{label}</span>
        <Icon className="fullscreen-icon" size={20} aria-hidden="true" />
      </button>
      {failed && <span role="status">{s.noFullscreen}</span>}
    </div>
  );
}

function HostRoster({
  state,
  send,
  ready,
  close,
}: {
  state: PublicState;
  send: (message: ClientMsg) => boolean;
  ready: boolean;
  close: () => void;
}) {
  const s = useStrings();
  const [selected, select] = useState<string>();
  const player = state.players.find(({ id }) => id === selected);
  return (
    <InfoDialog title={s.managePlayers} close={close}>
      {player ? (
        <div className="remove-confirmation">
          <p>{s.confirmRemove(player.name)}</p>
          <button className="action secondary" onClick={() => select(undefined)}>
            {s.cancel}
          </button>
          <button
            className="action danger"
            disabled={!ready}
            onClick={() => {
              if (send({ t: 'remove', player: player.id })) select(undefined);
            }}
          >
            {s.removePlayer}
          </button>
        </div>
      ) : state.players.length ? (
        <ul className="player-list">
          {state.players.map((candidate) => (
            <li key={candidate.id}>
              <PlayerToken player={candidate} />
              <span className="player-name">{candidate.name}</span>
              {!candidate.connected && <span className="player-status">{s.offline}</span>}
              <button
                className="action secondary"
                disabled={!ready}
                onClick={() => select(candidate.id)}
                aria-label={s.removePlayerLabel(candidate.name)}
              >
                {s.remove}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{s.noPlayers}</p>
      )}
    </InfoDialog>
  );
}

function Lobby({
  state,
  you,
  ready,
  send,
  openExit,
  openHowTo,
  openReview,
}: {
  state: PublicState;
  you?: string;
  ready: boolean;
  send: (message: ClientMsg) => boolean;
  openExit: () => void;
  openHowTo: () => void;
  openReview: (panel: ReviewPanel) => void;
}) {
  const s = useStrings();
  const host = you === state.hostId;
  const me = state.players.find((player) => player.id === you);
  const bot = state.players.find((player) => player.bot);
  const presenter = host && state.mode === 'projector';
  const [setupOpen, setSetupOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const canStart = state.players.filter(({ connected }) => connected).length >= 2;
  if (setupOpen && host) {
    return (
      <GameSettingsScreen
        settings={state.settings}
        ready={ready}
        close={() => setSetupOpen(false)}
        openExit={openExit}
        save={(settings) => send({ t: 'settings', settings })}
      />
    );
  }
  return (
    <main className="lobby entrance">
      <header className="lobby-heading">
        <strong>{s.title}</strong>
        <div className="lobby-heading-tools">
          {presenter && <FullscreenButton />}
          <LanguagePicker />
        </div>
      </header>
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
      <section className="lobby-setup" aria-label={s.setup.setup}>
        <SettingsSummary settings={state.settings} />
        <p className="rules-summary">{s.rulesSummary}</p>
        <div className="lobby-tools">
          {host && (
            <button className="action secondary" onClick={() => setSetupOpen(true)}>
              {s.setup.settings}
            </button>
          )}
          <button className="action secondary" onClick={openHowTo}>
            {s.howTo}
          </button>
          {presenter && (
            <button className="action secondary" onClick={() => setRosterOpen(true)}>
              {s.managePlayers}
            </button>
          )}
        </div>
      </section>
      <div className="lobby-content">
        {state.matchReview && <ReviewButtons personal={Boolean(me)} open={openReview} />}
        <section className="lobby-lineup" aria-labelledby="lineup-heading">
          <header className="lineup-heading">
            <h2 id="lineup-heading">{s.players}</h2>
            <span>{s.seats(state.players.length, bot ? 2 : MAX_PLAYERS)}</span>
          </header>
          {state.players.length ? (
            <ul className="lobby-roster">
              {state.players.map((player) => (
                <li key={player.id} className={player.id === you ? 'your-seat' : undefined}>
                  <PlayerToken player={player} size={32} />
                  <div className="lobby-seat-copy">
                    <span className="player-name">{player.name}</span>
                    <span className="player-status">
                      {player.id === you && <span>{s.you}</span>}
                      {player.id === state.hostId && <span>{s.host}</span>}
                      {player.bot && <span>{s.computer}</span>}
                      {!player.connected && <span>{s.offline}</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-lineup">{s.noPlayers}</p>
          )}
        </section>
        {me && (
          <section className="avatar-picker" aria-labelledby="avatar-heading">
            <header className="avatar-picker-heading">
              <h2 id="avatar-heading">{s.chooseAvatar}</h2>
              <div className="avatar-preview" aria-live="polite">
                <PlayerToken key={me.avatar} player={me} size={32} />
                <span className="sr-only">{s.selectedAvatar} </span>
                <strong>{s.avatars[me.avatar]}</strong>
              </div>
            </header>
            <div className="avatar-grid">
              {AVATAR_IDS.map((id) => {
                const name = s.avatars[id];
                const claimant = state.players.find(
                  (player) => player.id !== me.id && player.avatar === id,
                );
                const selected = id === me.avatar;
                const label = claimant ? s.avatarClaimedBy(name, claimant.name) : name;
                return (
                  <button
                    type="button"
                    key={id}
                    className={claimant ? 'avatar-choice avatar-taken' : 'avatar-choice'}
                    aria-label={label}
                    title={claimant ? label : undefined}
                    aria-pressed={selected}
                    disabled={!ready || Boolean(claimant)}
                    onClick={() => {
                      if (!selected) send({ t: 'avatar', id });
                    }}
                  >
                    <span
                      className="avatar-icon"
                      style={{
                        backgroundColor: me.color,
                        borderColor: claimant?.color,
                      }}
                      aria-hidden="true"
                    >
                      <PlayerAvatar id={id} />
                    </span>
                    <span className="avatar-label">{name}</span>
                    {selected && (
                      <span className="avatar-mark" aria-hidden="true">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                    {claimant && (
                      <span className="avatar-mark taken-mark" aria-hidden="true">
                        <X size={10} strokeWidth={3} />
                      </span>
                    )}
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
            {!canStart && <p>{s.waitForPlayers}</p>}
            <button
              className="action primary"
              disabled={!ready || !canStart}
              onClick={() => send({ t: 'start' })}
            >
              {bot ? s.startPractice : s.start}
            </button>
          </>
        ) : (
          <p>{s.waitForHost}</p>
        )}
        <button className="action secondary" onClick={openExit}>
          {presenter ? s.endSession : s.leaveRoom}
        </button>
      </div>
      {rosterOpen && presenter && (
        <HostRoster state={state} ready={ready} send={send} close={() => setRosterOpen(false)} />
      )}
    </main>
  );
}

function Results({
  state,
  home,
  ready,
  leaving,
  presenter,
  rematch,
  personal,
  openReview,
}: {
  state: PublicState;
  home: () => void;
  ready: boolean;
  leaving: boolean;
  presenter: boolean;
  rematch?: () => void;
  personal: boolean;
  openReview: (panel: ReviewPanel) => void;
}) {
  const s = useStrings();
  const ranked = state.standings ?? [];
  const winners = ranked
    .filter(({ worth }) => worth === ranked[0]?.worth)
    .map(({ player }) => player.name);

  return (
    <main className="results entrance">
      <LanguagePicker />
      <section className="room-ticket">
        <p className="topic-caption">
          <TopicArt topic={state.settings.topic} />
          {s.gameOver} · {s.topics[state.settings.topic]}
        </p>
        <h1>
          {winners.length === 0
            ? s.gameOver
            : winners.length === 1
              ? s.winner(winners[0])
              : s.tied(winners)}
        </h1>
        {state.endedByHost && <p>{s.sessionEnded}</p>}
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
      {presenter && <FullscreenButton />}
      <div className="results-actions">
        {state.matchReview && <ReviewButtons personal={personal} open={openReview} />}
        <div className="results-action-row">
          {rematch && (
            <button className="action primary" onClick={rematch} disabled={!ready || leaving}>
              {s.rematch}
            </button>
          )}
          <button
            className={rematch ? 'action secondary' : 'action primary'}
            onClick={home}
            disabled={!ready || leaving}
          >
            {leaving ? s.leaving : s.backHome}
          </button>
        </div>
      </div>
    </main>
  );
}

function ReviewButtons({
  personal,
  open,
}: {
  personal: boolean;
  open: (panel: ReviewPanel) => void;
}) {
  const s = useStrings();
  return (
    <div className="results-action-row">
      {personal && (
        <button className="action secondary" onClick={() => open('answers')}>
          {s.matchReview.answers}
        </button>
      )}
      <button className="action secondary" onClick={() => open('recap')}>
        {s.matchReview.recap}
      </button>
    </div>
  );
}

function InfoDialog({
  title,
  close,
  dismissible = true,
  children,
}: {
  title: string;
  close: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const s = useStrings();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="info-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) close();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) close();
      }}
    >
      <div className="info-card">
        <div className="info-heading">
          <h2 id={titleId}>{title}</h2>
          {dismissible && (
            <button className="action secondary close" aria-label={s.close} onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="info-scroll">{children}</div>
      </div>
    </dialog>
  );
}

function HomeFooter() {
  const { project } = useStrings();
  const [policy, setPolicy] = useState<'terms' | 'privacy'>();
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!policy) trigger.current?.focus({ preventScroll: true });
  }, [policy]);

  return (
    <footer className="home-footer">
      <p>
        <a href="https://github.com/theoldzoom/pologony" target="_blank" rel="noreferrer">
          {project.credit.link}
        </a>{' '}
        {project.credit.text}{' '}
        <a href="https://zoomhub.xyz/" target="_blank" rel="noreferrer">
          {project.authors.xavier}
        </a>{' '}
        &amp; {project.authors.goat}
      </p>
      <div className="home-policy-links">
        {(['terms', 'privacy'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className="text-button"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setPolicy(kind);
            }}
          >
            {project[kind].title}
          </button>
        ))}
      </div>
      {policy && (
        <InfoDialog title={project[policy].title} close={() => setPolicy(undefined)}>
          <div className="policy-copy">
            {project[policy].paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {policy === 'terms' && (
              <a href="https://github.com/theoldzoom/pologony" target="_blank" rel="noreferrer">
                {project.source}
              </a>
            )}
          </div>
        </InfoDialog>
      )}
    </footer>
  );
}

function Owner({ player }: { player?: Player }) {
  const s = useStrings();
  return (
    <span className="owner">
      {player && <PlayerToken player={player} size={16} />}
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
  const s = useStrings();
  const tile = TILES[index];
  const owner = state.players.find((player) => player.id === state.owners[index]);
  const occupants = state.players
    .filter((player) => player.pos === index)
    .map((player) => player.name);
  const n = tile.n ?? 0;
  const topic = state.settings.topic;
  const title =
    tile.kind === 'property' ? propertyName(s, topic, n, index) : s.tileNames[tile.kind];
  const degrees = (angle: number) => `${Math.round(angle * 100) / 100}°`;

  return (
    <InfoDialog title={title} close={close}>
      {tile.kind === 'property' ? (
        <>
          <div className="tile-diagram">
            <TopicArt topic={topic} sides={n} index={index} mark="both" />
          </div>
          {topic === 'polygons' && (
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
          )}
          <dl className="facts">
            {topic === 'polygons' && (
              <>
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
              </>
            )}
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
          <ChevronLeft size={20} aria-hidden="true" />
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
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </InfoDialog>
  );
}

const propertyGroups = Array.from({ length: 10 }, (_, index) => {
  const n = index + 3;
  return {
    n,
    indices: TILES.flatMap((tile, tileIndex) => (tile.n === n ? [tileIndex] : [])),
  };
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
  const s = useStrings();
  return (
    <InfoDialog title={s.tileList} close={close}>
      {(state.settings.topic === 'polygons'
        ? propertyGroups
        : [{ n: 0, indices: propertyGroups.flatMap(({ indices }) => indices) }]
      ).map(({ n, indices }) => (
        <section className="tile-group" key={n}>
          {n > 0 && <h3>{propertyName(s, 'polygons', n, indices[0])}</h3>}
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
                <TopicArt
                  topic={state.settings.topic}
                  sides={tile.n}
                  index={index}
                  ownerColor={owner?.color}
                  label
                />
                <span className="property-row-title">
                  {propertyName(s, state.settings.topic, tile.n!, index)}{' '}
                  <small>#{index + 1}</small>
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
  dice,
  you,
}: {
  state: PublicState;
  dice?: [number, number];
  you?: string;
}) {
  const s = useStrings();
  const index = state.players[state.turn].pos;
  const tile = TILES[index];
  const owner = state.players.find((player) => player.id === state.owners[index]);
  const latest = state.events.at(-1);

  return (
    <div className="table-center">
      <div className="landing-card" key={index}>
        {tile.kind === 'property' ? (
          <>
            <TopicArt
              topic={state.settings.topic}
              sides={tile.n}
              index={index}
              ownerColor={owner?.color}
            />
            <div>
              <h2>{propertyName(s, state.settings.topic, tile.n!, index)}</h2>
              <p className="money">
                {s.price} {s.money(tile.price!)} · {s.rent} {s.money(tile.rent!)}
              </p>
              <p className="landing-owner">
                <Owner player={owner} />
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
      {dice && <p className="roll-total">{s.diceSum(dice[0] + dice[1])}</p>}
      {latest && <p className="latest-log">{describeEvent(s, latest, state, you).text}</p>}
    </div>
  );
}

function RoomCode({ code }: { code: string }) {
  const s = useStrings();
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
  const [moving, setMoving] = useState(false);
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
      else setMoving(false);
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
      setMoving(false);
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
      if (from === undefined) continue;
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
        changes[player.id] = {
          delta: player.cash - old.cash,
          id: ++animationId.current,
        };
      }
    }
    if (Object.keys(snapped).length) setPositions((shown) => ({ ...shown, ...snapped }));
    if (Object.keys(purchased).length) setStamps((shown) => ({ ...shown, ...purchased }));
    if (Object.keys(changes).length) setCashChanges((shown) => ({ ...shown, ...changes }));

    if (rolled && state.dice) {
      if (Object.keys(queues.current).length) setMoving(true);
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

  return { positions, dice, tumbling, moving, cashChanges, landings, stamps };
}

function describeEvent(s: Strings, event: GameEvent, state: PublicState, you?: string) {
  const player =
    'player' in event ? state.players.find(({ id }) => id === event.player) : undefined;
  const mine = player?.id === you && Boolean(player);
  const playerName = (id: string) =>
    state.players.find((candidate) => candidate.id === id)?.name ??
    state.events.find(
      (item): item is Extract<GameEvent, { kind: 'removed' }> =>
        item.kind === 'removed' && item.player === id,
    )?.name ??
    s.player;
  const p = mine ? s.you : 'player' in event ? playerName(event.player) : '';
  const property =
    'tile' in event
      ? propertyName(s, state.settings.topic, TILES[event.tile].n ?? 0, event.tile)
      : '';
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
    case 'removed':
      text = eventText.removed(event.name, event.reason === 'voluntary');
      break;
    case 'turnSkipped':
      text = eventText.turnSkipped(p, mine);
      break;
    case 'started':
      text = eventText.started;
      tone = 'good';
      break;
    case 'rematch':
      text = eventText.rematch;
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
        event.q === 'chance'
          ? s.tileNames.chance
          : state.settings.topic === 'polygons'
            ? event.mystery
              ? s.polygonTopic
              : property
            : s.topics[state.settings.topic],
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
      text = eventText.buy(p, property, amount);
      tone = 'good';
      break;
    case 'skip':
      text = eventText.skip(p, property);
      break;
    case 'cantAfford':
      text = eventText.cantAfford(p, property);
      tone = 'bad';
      break;
    case 'rent': {
      const payee = event.to === you ? s.you : playerName(event.to);
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
  const s = useStrings();
  const { text, tone, player } = describeEvent(s, event, state, you);
  return (
    <li className={`event-message event-${tone}`}>
      {player && <PlayerToken player={player} size={16} />}
      <span>{text}</span>
    </li>
  );
}

function ToastStack({ toasts, state, you }: { toasts: Toast[]; state: PublicState; you?: string }) {
  return (
    <ul className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map(({ event }) => (
        <EventMessage key={event.id} event={event} state={state} you={you} />
      ))}
    </ul>
  );
}

function questionStakes(
  s: Strings,
  question: PublicQuestion,
  state: PublicState,
  mine: boolean,
): [string, string] {
  const tile = TILES[question.tile];
  const player = mine ? undefined : state.players[state.turn].name;
  switch (question.kind) {
    case 'buy':
      return [s.stakes.buyRight(s.money(tile.price!), player), s.stakes.buyWrong(player)];
    case 'rent': {
      const owner = state.players.find(({ id }) => id === state.owners[question.tile]);
      return [
        s.stakes.rentRight(s.money(tile.rent! / 2), player),
        s.stakes.rentWrong(s.money(tile.rent!), owner?.name, player),
      ];
    }
    case 'chance':
      return [s.stakes.chanceRight, s.stakes.chanceWrong];
  }
}

function Stakes({ lines }: { lines: [string, string] }) {
  return (
    <p className="stakes">
      <span className="right-stake">
        <Check className="inline-icon" aria-hidden="true" /> {lines[0]}
      </span>
      <span className="wrong-stake">
        <X className="inline-icon" aria-hidden="true" /> {lines[1]}
      </span>
    </p>
  );
}

function QuestionSheet({
  question,
  topic,
  player,
  mine,
  actionable,
  failed,
  stakes,
  timeLeft,
  urgent,
  submitAnswer,
  rollControls,
}: {
  question: PublicQuestion;
  topic: Topic;
  player: Player;
  mine: boolean;
  actionable: boolean;
  failed: boolean;
  stakes: [string, string];
  timeLeft: number;
  urgent: boolean;
  submitAnswer: (index: number) => boolean;
  rollControls: ReactNode;
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const copy = language === 'en' ? question.english : question;
  const [selection, select] = useState<number>();
  const [sent, markSent] = useState(false);
  useEffect(() => {
    if (failed) markSent(false);
  }, [failed]);
  const disabled = !actionable || sent;
  const chess = question.chess;

  return (
    <section
      className={`game-sheet question-card question-sheet ${mine ? 'my-question' : 'watch-question'}${chess ? ' chess-question' : ''}`}
      data-chess-step={chess?.step}
      aria-labelledby="question-title"
    >
      <header className="question-ribbon">
        <div>
          <strong>{mine ? s.yourQuestion : s.theirQuestion(player.name)}</strong>
          {chess && <h2 id="question-title">{copy.text}</h2>}
        </div>
        {chess && (
          <div className="chess-turn">
            <span>{s.chessPuzzle.toMove[chess.turn]}</span>
            {chess.step && <strong>{s.chessPuzzle.step(chess.step)}</strong>}
            {(mine || chess.lastReply) && (
              <span aria-live="polite">
                {selection !== undefined
                  ? chessMoveLabel(s, copy.options[selection])
                  : chess.lastReply
                    ? s.chessPuzzle.reply(chessMoveLabel(s, chess.lastReply))
                    : ''}
              </span>
            )}
          </div>
        )}
      </header>
      <div className="question-body">
        {chess ? (
          <ChessBoard
            puzzle={chess}
            moves={mine ? copy.options : undefined}
            selected={selection}
            select={mine && !disabled ? select : undefined}
          />
        ) : (
          <div className="question-prompt with-diagram">
            <div className={topic === 'polygons' ? 'question-diagram' : 'question-emblem'}>
              <TopicArt topic={topic} sides={question.n} mark={question.mark} />
            </div>
            <h2 id="question-title">{copy.text}</h2>
          </div>
        )}
        <div className={chess ? 'question-details chess-details' : 'question-details'}>
          <p className="question-hint">
            <Lightbulb className="inline-icon" aria-hidden="true" /> {copy.hint}
          </p>
          <Stakes lines={stakes} />
          {chess && !mine && <p className="watch-note">{s.watchOnly(player.name)}</p>}
        </div>
        {!chess &&
          (mine ? (
            <div className="answer-grid">
              {copy.options.map((option, index) => (
                <button
                  className="action answer"
                  key={option}
                  disabled={disabled}
                  aria-pressed={selection === index}
                  onClick={() => select(index)}
                >
                  {selection === index && (
                    <>
                      <Check className="inline-icon" aria-hidden="true" />{' '}
                    </>
                  )}
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <ul className="answer-grid watch-options">
              {copy.options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ul>
          ))}
        {!chess && !mine && <p className="watch-note">{s.watchOnly(player.name)}</p>}
      </div>
      <div className="question-actions">
        <div className="question-roll">{rollControls}</div>
        {mine && (
          <button
            className="action primary lock-answer"
            disabled={disabled || selection === undefined}
            onClick={() => {
              if (selection !== undefined && submitAnswer(selection)) markSent(true);
            }}
          >
            {sent
              ? s.answerSent
              : chess && selection === undefined
                ? s.chessPuzzle.chooseMove
                : s.lockAnswer}
          </button>
        )}
      </div>
      <div className={`question-timer${urgent ? ' urgent' : ''}`} aria-hidden="true">
        <span style={{ transform: `scaleX(${timeLeft})` }} />
      </div>
    </section>
  );
}

function HowTo({ close, topic }: { close: () => void; topic: Topic }) {
  const s = useStrings();
  const [step, setStep] = useState(0);
  const total = s.howToCards.length;
  const last = step === total - 1;
  return (
    <InfoDialog title={s.howTo} close={close}>
      <div className="tutorial-polygon">
        <TopicArt
          topic={topic}
          sides={[3, 5, 6, 8, 10][step]}
          index={step}
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
  openExit,
  openHowTo,
  toasts,
}: {
  snapshot: Snapshot;
  you?: string;
  ready: boolean;
  error: string;
  send: (message: ClientMsg) => boolean;
  openExit: () => void;
  openHowTo: () => void;
  toasts: Toast[];
}) {
  const s = useStrings();
  const { state, offset } = snapshot;
  const [clock, setClock] = useState(Date.now);
  const [sheet, setSheet] = useState<'tiles' | 'formulas' | 'log' | 'roster' | number>();
  const [readAnswer, setReadAnswer] = useState(state.result?.id);
  const [review, setReview] = useState<AnswerResult>();
  const asking = state.phase === 'question';
  const visibleReview = asking || sheet ? undefined : review;
  const resultSeen = useRef({
    connection: snapshot.connection,
    id: state.result?.id,
  });

  useEffect(() => {
    const previous = resultSeen.current;
    const result = state.result;
    resultSeen.current = { connection: snapshot.connection, id: result?.id };
    if (!result || previous.connection !== snapshot.connection) {
      setReview(undefined);
      setReadAnswer(result?.id);
      return;
    }
    if (asking) {
      setReview(undefined);
      return;
    }
    if (result.id === previous.id) return;
    setReview(result);
    const timer = setTimeout(() => setReview(undefined), 6000);
    return () => clearTimeout(timer);
  }, [asking, snapshot.connection, state.result?.id]);
  const { positions, dice, tumbling, moving, cashChanges, landings, stamps } =
    useGameMotion(snapshot);
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
  const presenter = state.mode === 'projector' && state.hostId === you;
  const topic = state.settings.topic;
  const propertyLabel = propertyName(s, topic, TILES[player.pos].n ?? 0, player.pos);
  const actionable = myTurn && ready && phaseSeconds > 0 && gameSeconds > 0;
  const question = state.question;
  const playingRoll = tumbling || moving;
  const showQuestion = playingRoll ? undefined : question;
  const property = TILES[player.pos];
  const rollPhase = state.phase === 'roll';
  const clockLabel = `${Math.floor(gameSeconds / 60)}:${String(gameSeconds % 60).padStart(2, '0')}`;
  const fraction = (duration: number) =>
    Math.max(0, Math.min(1, (state.deadline! - now) / (duration * 1000)));
  const close = () => setSheet(undefined);
  const buyPhase = state.phase === 'buy';
  const deadlineDuration = rollPhase
    ? state.settings.rollSeconds
    : question
      ? state.settings.questionSeconds
      : state.settings.buySeconds;
  const headline = question
    ? myTurn
      ? s.banner.question
      : s.banner.otherQuestion(player.name)
    : buyPhase
      ? myTurn
        ? s.banner.buy
        : s.banner.otherBuy(player.name)
      : myTurn
        ? s.banner.roll
        : s.banner.otherRoll(player.name);
  const stakes = question ? questionStakes(s, question, state, myTurn) : undefined;
  const hint = playingRoll
    ? s.banner.landing
    : question
      ? myTurn
        ? stakes?.[0]
        : s.banner.watchQuestion
      : buyPhase
        ? myTurn
          ? s.banner.buyHint
          : s.banner.wait
        : myTurn
          ? s.banner.rollHint
          : s.banner.wait;
  const result = state.result;
  const myColor = state.players.find(({ id }) => id === you)?.color;
  const unreadAnswer = result && sheet !== 'log' && result.id !== readAnswer;
  const answerer = (answer: AnswerResult) =>
    answer.playerId === you
      ? s.you
      : (state.players.find(({ id }) => id === answer.playerId)?.name ?? s.previousPlayer);
  const rollControls = (
    <div className="action-row">
      <div
        className={`dice${tumbling ? ' tumbling' : ''}`}
        role="img"
        aria-label={tumbling ? s.rolling : dice ? s.dice(...dice) : s.noDice}
      >
        <span>{dice?.[0] ?? <Minus size={16} aria-hidden="true" />}</span>
        <span>{dice?.[1] ?? <Minus size={16} aria-hidden="true" />}</span>
      </div>
      {myTurn || question || playingRoll ? (
        <button
          className="action primary roll-button"
          disabled={!rollPhase || !actionable || playingRoll}
          onClick={() => send({ t: 'roll', version: state.version })}
        >
          {s.roll}
        </button>
      ) : (
        <p className="waiting-action">{s.waitingFor(player.name)}</p>
      )}
    </div>
  );

  return (
    <main
      className={`game ${showQuestion ? (myTurn ? 'answering-turn' : 'watching-turn') : buyPhase ? 'buying-turn' : 'rolling-turn'}`}
      style={{ '--turn-color': player.color } as CSSProperties}
    >
      <div className="game-content">
        <header className="game-header">
          <h1>
            {s.title} <span>{s.topics[topic]}</span>
          </h1>
          {presenter && <FullscreenButton />}
          {state.mode !== 'practice' && <RoomCode code={state.code} />}
          <button className="action secondary game-exit" onClick={openExit}>
            {presenter ? s.endSession : s.leaveGame}
          </button>
          <span
            className={`game-clock${gameSeconds <= 60 ? ' final-minute' : ''}`}
            aria-label={`${s.clock} ${clockLabel}`}
          >
            {clockLabel}
          </span>
          <LanguagePicker />
        </header>
        <Board state={state} positions={positions} landings={landings} stamps={stamps}>
          <CurrentTile state={state} dice={tumbling ? undefined : dice} you={you} />
        </Board>
        <div className="game-sidebar">
          <section className={`turn-banner${myTurn ? ' my-turn' : ''}`}>
            <PlayerToken player={player} size={34} />
            <div className="turn-copy" aria-live="polite">
              <h2 key={headline}>{headline}</h2>
              <p className="turn-hint">{hint}</p>
            </div>
            <div
              className={`turn-ring${phaseSeconds <= 5 ? ' urgent' : ''}`}
              role="img"
              aria-label={s.turnTime(phaseSeconds)}
            >
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
          <div className="phase-panel">
            {showQuestion && stakes && (
              <QuestionSheet
                key={`${snapshot.connection}-${state.version}`}
                question={showQuestion}
                topic={topic}
                player={player}
                mine={myTurn}
                stakes={stakes}
                timeLeft={fraction(deadlineDuration)}
                urgent={phaseSeconds <= 5}
                actionable={actionable}
                failed={!ready || Boolean(error)}
                submitAnswer={(index) => send({ t: 'answer', index, version: state.version })}
                rollControls={rollControls}
              />
            )}
            {buyPhase && (
              <section className="buy-offer" aria-labelledby="buy-offer-title">
                <h3 id="buy-offer-title">
                  {myTurn
                    ? s.buyOffer(propertyLabel, s.money(property.price!), topic === 'polygons')
                    : s.otherBuyOffer(player.name, propertyLabel, s.money(property.price!))}
                </h3>
                {myTurn && (
                  <>
                    <p className="money">
                      {s.buyRent(s.money(property.rent!), s.money(property.rent! / 2))}
                    </p>
                    <div className="buy-actions">
                      <button
                        className="action primary money"
                        disabled={!actionable}
                        onClick={() => send({ t: 'buy', version: state.version })}
                      >
                        {s.buy(property.price!)}
                      </button>
                      <button
                        className="action secondary"
                        disabled={!actionable}
                        onClick={() => send({ t: 'skip', version: state.version })}
                      >
                        {s.skip}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
            {visibleReview && (
              <div className="desktop-review">
                <AnswerReview
                  result={visibleReview}
                  topic={topic}
                  name={answerer(visibleReview)}
                  mine={visibleReview.playerId === you}
                  color={myColor}
                  placement="panel"
                  dismiss={() => {
                    setReadAnswer(visibleReview.id);
                    setReview(undefined);
                  }}
                />
              </div>
            )}
          </div>
          {presenter && (
            <div className="host-controls" aria-label={s.hostControls}>
              <button className="action secondary" onClick={() => setSheet('roster')}>
                {s.managePlayers}
              </button>
              <button
                className="action secondary"
                disabled={!ready || phaseSeconds <= 0 || gameSeconds <= 0}
                onClick={() => send({ t: 'skipTurn', version: state.version })}
              >
                {s.skipTurn}
              </button>
              <button
                className="action secondary"
                disabled={!ready || phaseSeconds <= 0 || gameSeconds <= 0}
                title={rollPhase ? s.timeout.roll : question ? s.timeout.question : s.timeout.buy}
                onClick={() => send({ t: 'applyTimeout', version: state.version })}
              >
                {s.applyTimeout}
              </button>
            </div>
          )}
          <section className="dock">
            <ul className="player-chips" aria-label={s.scoreboard}>
              {state.players.map((candidate) => {
                const change = cashChanges[candidate.id];
                const worth = netWorth(candidate, state.owners);
                return (
                  <li
                    className={`player-chip${candidate.id === player.id ? ' current-chip' : ''}${candidate.connected ? '' : ' offline-chip'}`}
                    key={candidate.id}
                    ref={candidate.id === player.id ? currentChip : undefined}
                    style={{
                      borderColor: candidate.id === player.id ? candidate.color : undefined,
                    }}
                    aria-current={candidate.id === player.id ? 'true' : undefined}
                  >
                    <span className="chip-name">
                      <PlayerToken player={candidate} size={20} />
                      {candidate.id === player.id && (
                        <Play
                          className="turn-marker"
                          size={12}
                          fill="currentColor"
                          aria-hidden="true"
                        />
                      )}
                      <span>{candidate.name}</span>
                      {!candidate.connected && <span className="sr-only"> {s.offline}</span>}
                    </span>
                    <div className="chip-money">
                      <strong className="money">
                        <span className="chip-worth-label">{s.netWorth}</span> {s.money(worth)}
                      </strong>
                      <span
                        className={`chip-cash money${change ? ' cash-flash' : ''}`}
                        key={change ? `cash-${change.id}` : 'cash'}
                      >
                        {s.cashValue(s.money(candidate.cash))}
                      </span>
                      {change && (
                        <span
                          key={change.id}
                          className={`cash-float ${change.delta > 0 ? 'gain' : 'loss'}`}
                          aria-hidden="true"
                        >
                          {s.cashChange(change.delta)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {buyPhase ? <div className="action-row inactive-action" /> : rollControls}
          </section>
        </div>
      </div>
      <nav className="dock-tools" aria-label={s.gameTools}>
        <button className="action secondary" onClick={() => setSheet('tiles')}>
          {s.tileList}
        </button>
        {topic === 'polygons' && (
          <button className="action secondary" onClick={() => setSheet('formulas')}>
            {s.formulas}
          </button>
        )}
        <button
          className="action secondary log-tool"
          onClick={() => {
            setReadAnswer(result?.id);
            setReview(undefined);
            setSheet('log');
          }}
        >
          {s.eventLog}
          {unreadAnswer && <span key={result.id} className="log-indicator" aria-hidden="true" />}
        </button>
        <button className="action secondary" aria-label={s.howTo} onClick={openHowTo}>
          <CircleQuestionMark size={18} aria-hidden="true" />
        </button>
      </nav>
      {(toasts.length > 0 || visibleReview) && (
        <div className="game-feedback">
          <ToastStack toasts={toasts} state={state} you={you} />
          {visibleReview && (
            <div className="solution-space">
              <AnswerReview
                result={visibleReview}
                topic={topic}
                name={answerer(visibleReview)}
                mine={visibleReview.playerId === you}
                color={myColor}
                dismiss={() => {
                  setReadAnswer(visibleReview.id);
                  setReview(undefined);
                }}
              />
            </div>
          )}
        </div>
      )}
      {sheet === 'roster' && presenter && (
        <HostRoster state={state} ready={ready} send={send} close={close} />
      )}
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
          {result && (
            <details className="log-answer">
              <summary>{s.reviewAnswer}</summary>
              <AnswerReview
                result={result}
                topic={topic}
                mine={result.playerId === you}
                color={myColor}
                name={answerer(result)}
              />
            </details>
          )}
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

function answerOutcome(s: Strings, result: AnswerResult, name: string) {
  if (result.outcome === 'timeout') return s.resultTimeout(name);
  return result.outcome === 'correct' ? s.resultCorrect(name) : s.resultIncorrect(name);
}

function SolutionDetails({
  solution,
  topic,
  attempt,
  attemptLabel,
}: {
  solution: QuestionSolution;
  topic: Topic;
  attempt?: AnswerResult;
  attemptLabel?: string;
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const copy = language === 'en' ? solution.english : solution;
  const line = solution.chessLine;
  const wrongAnswer = attempt && attempt.chosen !== solution.correct ? attempt.chosen : -1;
  const displayedOptions =
    solution.chess || !attempt
      ? [solution.correct, ...(wrongAnswer >= 0 ? [wrongAnswer] : [])]
      : copy.options.map((_, index) => index);
  const move = (value: string) => chessMoveLabel(s, value);
  const attemptedMoves =
    line && attempt && attempt.outcome !== 'correct' && attempt.chosen >= 0
      ? attempt.chosen === solution.correct
        ? [line[0], line[1], ...(attempt.chessFollowup ? [attempt.chessFollowup] : [])]
        : [copy.options[attempt.chosen]]
      : [];

  return (
    <>
      <ul className="answer-grid result-options">
        {line ? (
          <>
            <li className="correct">
              <span className="answer-result-label">
                <Check className="inline-icon" aria-hidden="true" /> {s.matchReview.line}
              </span>
              <strong>{line.map(move).join(' · ')}</strong>
            </li>
            {attemptedMoves.length > 0 && (
              <li className="wrong">
                <span className="answer-result-label">
                  <X className="inline-icon" aria-hidden="true" /> {attemptLabel}
                </span>
                <strong>{attemptedMoves.map(move).join(' · ')}</strong>
              </li>
            )}
          </>
        ) : (
          displayedOptions.map((index) => {
            const correct = index === solution.correct;
            const wrong = index === wrongAnswer;
            const Icon = correct ? Check : X;
            return (
              <li key={index} className={correct ? 'correct' : wrong ? 'wrong' : undefined}>
                {(correct || wrong) && (
                  <span className="answer-result-label">
                    <Icon className="inline-icon" aria-hidden="true" />{' '}
                    {correct ? s.correctAnswer : attemptLabel}
                  </span>
                )}
                <strong>{solution.chess ? move(copy.options[index]) : copy.options[index]}</strong>
              </li>
            );
          })
        )}
      </ul>
      <div className="worked-solution">
        <h3>{topic === 'polygons' ? s.workedSolution : s.explanation}</h3>
        <p className="explanation">{copy.explanation}</p>
      </div>
    </>
  );
}

function AnswerReview({
  result,
  topic,
  name,
  mine,
  color,
  dismiss,
  placement = 'popover',
}: {
  result: AnswerResult;
  topic: Topic;
  name: string;
  mine: boolean;
  color?: string;
  dismiss?: () => void;
  placement?: 'popover' | 'panel';
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const copy = language === 'en' ? result.english : result;
  const titleId = useId();
  const chess = result.chess;
  const attemptLabel = result.chessLine
    ? mine
      ? s.matchReview.yourMoves
      : s.matchReview.playerMoves(name)
    : mine
      ? s.yourAnswer
      : s.playerAnswer(name);
  return (
    <section
      className={`question-card answer-review${mine ? '' : ' watch-question'}${dismiss && placement === 'popover' ? ' answer-popover' : ''}`}
      aria-labelledby={titleId}
      aria-live={dismiss ? 'polite' : undefined}
      style={mine && color ? ({ '--turn-color': color } as CSSProperties) : undefined}
    >
      <header className="question-ribbon review-ribbon">
        <div>
          <strong id={titleId}>{answerOutcome(s, result, name)}</strong>
          {chess && <h2>{copy.text}</h2>}
        </div>
        {dismiss && (
          <button className="action secondary close" aria-label={s.close} onClick={dismiss}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="question-body">
        {chess ? (
          <ChessBoard
            puzzle={chess}
            solution={result.chessLine ? undefined : copy.options[result.correct]}
          />
        ) : (
          <div className="question-prompt with-diagram">
            <div className={topic === 'polygons' ? 'question-diagram' : 'question-emblem'}>
              <TopicArt topic={topic} sides={result.n} mark={result.mark} />
            </div>
            <h2>{copy.text}</h2>
          </div>
        )}
        <SolutionDetails
          solution={result}
          topic={topic}
          attempt={result}
          attemptLabel={attemptLabel}
        />
      </div>
    </section>
  );
}

function MatchReviewDialog({
  panel,
  review,
  close,
}: {
  panel: ReviewPanel;
  review: NonNullable<PublicState['matchReview']>;
  close: () => void;
}) {
  const s = useStrings();
  const { language } = useLanguage();
  const [index, setIndex] = useState(0);
  const personal = panel === 'answers';
  const answers = useMemo(
    () =>
      review.answers
        .slice()
        .reverse()
        .sort((a, b) => Number(a.outcome === 'correct') - Number(b.outcome === 'correct')),
    [review.answers],
  );
  const items = personal ? answers : review.recap;
  const answer = personal ? answers[index] : undefined;
  const solution = items[index];
  const copy = language === 'en' ? solution?.english : solution;

  return (
    <InfoDialog title={s.matchReview[panel]} close={close}>
      {solution ? (
        <div className="match-review-content" data-topic={topicTheme(review.topic)}>
          <div className="match-review-controls">
            <button
              className="action secondary"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              {s.howToBack}
            </button>
            <span aria-live="polite">{s.matchReview.position(index + 1, items.length)}</span>
            <button
              className="action secondary"
              disabled={index + 1 >= items.length}
              onClick={() => setIndex(index + 1)}
            >
              {s.howToNext}
            </button>
          </div>
          {answer ? (
            <AnswerReview
              result={answer}
              topic={review.topic}
              name={s.you}
              mine
              placement="panel"
            />
          ) : (
            <article className="recap-question" key={solution.id}>
              <div className="question-prompt with-diagram">
                {!solution.chess && (
                  <div
                    className={review.topic === 'polygons' ? 'question-diagram' : 'question-emblem'}
                  >
                    <TopicArt topic={review.topic} sides={solution.n} mark={solution.mark} />
                  </div>
                )}
                <h3>{copy?.text}</h3>
              </div>
              {solution.chess && <ChessBoard puzzle={solution.chess} />}
              <details className="recap-reveal">
                <summary>{s.matchReview.reveal}</summary>
                <SolutionDetails solution={solution} topic={review.topic} />
              </details>
            </article>
          )}
        </div>
      ) : (
        <p>{personal ? s.matchReview.noAnswers : s.matchReview.noRecap}</p>
      )}
    </InfoDialog>
  );
}

const languageKey = 'pologony-language';

function detectLanguage(): Language {
  for (const locale of [...(navigator.languages ?? []), navigator.language]) {
    const primary = locale.toLowerCase().split(/[-_]/, 1)[0];
    if (primary === 'en' || primary === 'es') return primary;
  }
  return 'en';
}

export default function App() {
  const [preferredLanguage, setPreferredLanguage] = useState<Language | undefined>(() => {
    try {
      const saved = localStorage.getItem(languageKey);
      if (saved === 'en' || saved === 'es') return saved;
    } catch {}
  });
  const [browserLanguage, setBrowserLanguage] = useState(detectLanguage);
  const language = preferredLanguage ?? browserLanguage;

  function changeLanguage(next: Language) {
    setPreferredLanguage(next);
    try {
      localStorage.setItem(languageKey, next);
    } catch {}
  }

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (preferredLanguage) return;
    const detect = () => setBrowserLanguage(detectLanguage());
    window.addEventListener('languagechange', detect);
    return () => window.removeEventListener('languagechange', detect);
  }, [preferredLanguage]);

  return (
    <LanguageContext.Provider value={{ language, changeLanguage }}>
      <Pologony />
    </LanguageContext.Provider>
  );
}

function Pologony() {
  const s = useStrings();
  const { snapshot, you, send, ready, retrying, error, leaving, backHome, toasts } =
    useConnection();
  const state = snapshot?.state;
  const [tutorial, setTutorial] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [reviewPanel, setReviewPanel] = useState<ReviewPanel>();
  const tutorialSeen = useRef(false);
  const presenter = state?.mode === 'projector' && state?.hostId === you;
  const playing = Boolean(state && state.phase !== 'lobby' && state.phase !== 'over');
  const myTurn = playing && state?.players[state.turn].id === you;
  const showExit = Boolean(exitOpen && state && state.phase !== 'over');
  const openExit = () => setExitOpen(true);
  const leave = () => send({ t: 'leave' });
  const canReview = Boolean(state?.matchReview);

  useEffect(() => {
    if (!canReview) setReviewPanel(undefined);
  }, [canReview]);
  const errorKey = (Object.keys(wireStrings.error) as (keyof Strings['error'])[]).find(
    (key) => wireStrings.error[key] === error,
  );
  const localizedError =
    error === wireStrings.sessionEnded ? s.sessionEnded : errorKey ? s.error[errorKey] : error;
  const status = localizedError || (retrying ? s.reconnecting : !ready ? s.connecting : '');

  useEffect(() => {
    if (!state || state.phase === 'over') {
      setTutorial(false);
      setExitOpen(false);
    }
  }, [state?.phase]);

  useEffect(() => {
    if (state?.phase !== 'lobby' || tutorialSeen.current) return;
    tutorialSeen.current = true;
    try {
      if (localStorage.getItem('seenHowTo')) return;
      localStorage.setItem('seenHowTo', '1');
    } catch {}
    setTutorial(true);
  }, [state?.phase]);

  useEffect(() => {
    document.title = myTurn ? s.turnTitle : s.title;
  }, [myTurn, s.title, s.turnTitle]);

  useEffect(() => {
    if (myTurn) navigator.vibrate?.(200);
  }, [myTurn]);

  let screen: ReactNode;
  if (!snapshot) {
    screen = (
      <div className="home-shell">
        <Home ready={ready} send={send} invite={invitedRoomCode()} backHome={backHome} />
        <HomeFooter />
      </div>
    );
  } else if (snapshot.state.phase === 'lobby') {
    screen = (
      <Lobby
        state={snapshot.state}
        you={you}
        ready={ready}
        send={send}
        openExit={openExit}
        openHowTo={() => setTutorial(true)}
        openReview={setReviewPanel}
      />
    );
  } else if (snapshot.state.phase === 'over') {
    screen = (
      <Results
        state={snapshot.state}
        home={leave}
        ready={ready}
        leaving={leaving}
        presenter={presenter}
        personal={snapshot.state.players.some((player) => player.id === you)}
        openReview={setReviewPanel}
        rematch={
          snapshot.state.hostId === you && !snapshot.state.endedByHost
            ? () => send({ t: 'rematch', version: snapshot.state.version })
            : undefined
        }
      />
    );
  } else {
    screen = (
      <Game
        snapshot={snapshot}
        you={you}
        ready={ready}
        error={localizedError}
        send={send}
        openExit={openExit}
        toasts={toasts}
        openHowTo={() => setTutorial(true)}
      />
    );
  }

  return (
    <div
      className={`app${presenter ? ' presenter' : ''}`}
      data-topic={topicTheme(state?.settings.topic ?? 'polygons')}
    >
      <div className={`screen${playing ? ' playing' : ''}`}>
        {screen}
        {reviewPanel && state?.matchReview && (
          <MatchReviewDialog
            panel={reviewPanel}
            review={state.matchReview}
            close={() => setReviewPanel(undefined)}
          />
        )}
        {!playing && state && toasts.length > 0 && (
          <div className="lobby-feedback">
            <ToastStack toasts={toasts} state={state} you={you} />
          </div>
        )}
        {tutorial && state && (
          <HowTo close={() => setTutorial(false)} topic={state.settings.topic} />
        )}
        {showExit && state && (
          <ExitConfirmation
            state={state}
            you={you}
            ready={ready}
            leaving={leaving}
            status={status}
            close={() => setExitOpen(false)}
            confirm={leave}
          />
        )}
        {status && !showExit && (
          <div className="status" role="status">
            {status}
          </div>
        )}
      </div>
      <p className="rotate-message">{s.rotate}</p>
    </div>
  );
}
