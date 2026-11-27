import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CircleQuestionMark, Minus, Pause, Play, X } from 'lucide-react';
import { TILES, netWorth, type AnswerResult, type ClientMsg } from '../../../../shared/game';
import { useLanguage, useStrings } from '../../i18n/strings';
import Board from './board/Board';
import { type Snapshot, type Toast } from '../../network/useConnection';
import { FullscreenButton, RoomCode } from '../../components/RoomControls';
import { PlayerToken } from '../../components/PlayerToken';
import { HostRoster } from '../lobby/HostRoster';
import { InfoDialog } from '../../components/InfoDialog';
import { TileInfo, TilesSheet, CurrentTile } from './TileDetails';
import { useGameMotion } from './useGameMotion';
import { EventMessage, ToastStack } from '../../components/EventMessages';
import { questionStakes, QuestionSheet } from './QuestionSheet';
import { correctAnswerText, answerOutcome, AnswerReview } from '../results/AnswerReview';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import { propertyName } from './board/TopicArt';

export function Game({
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
  const { language } = useLanguage();
  const { state, offset } = snapshot;
  const [clock, setClock] = useState(Date.now);
  const [sheet, setSheet] = useState<
    'tiles' | 'formulas' | 'log' | 'roster' | 'solution' | number
  >();
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

  const paused = state.pause?.pausedAt !== undefined;
  const now = state.pause?.pausedAt ?? clock + offset;
  const gameSeconds = Math.max(0, Math.ceil((state.endsAt! - now) / 1000));
  const phaseSeconds = Math.max(0, Math.ceil((state.deadline! - now) / 1000));
  const player = state.players[state.turn];
  const myTurn = player.id === you;
  const presenter = state.mode === 'projector' && state.hostId === you;
  const topic = state.settings.topic;
  const propertyLabel = propertyName(s, topic, TILES[player.pos].n ?? 0, player.pos);
  const actionable = !paused && myTurn && ready && phaseSeconds > 0 && gameSeconds > 0;
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
  const headline = paused
    ? s.classroom.paused
    : question
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
  const hint = paused
    ? s.classroom.waitResume
    : state.watching
      ? s.classroom.watching
      : state.players.find((seat) => seat.id === you)?.eliminated
        ? s.classroom.eliminated
        : state.pause?.expiresAt && state.pause.expiresAt > now
          ? s.classroom.pauseCount(state.pause.votes, state.pause.needed)
          : playingRoll
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
            {state.watching ? s.classroom.leaveSpectating : presenter ? s.endSession : s.leaveGame}
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
                buyHint={() => send({ t: 'hint', version: state.version })}
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
                disabled={paused || !ready || phaseSeconds <= 0 || gameSeconds <= 0}
                onClick={() => send({ t: 'skipTurn', version: state.version })}
              >
                {s.skipTurn}
              </button>
              <button
                className="action secondary"
                disabled={paused || !ready || phaseSeconds <= 0 || gameSeconds <= 0}
                title={rollPhase ? s.timeout.roll : question ? s.timeout.question : s.timeout.buy}
                onClick={() => send({ t: 'applyTimeout', version: state.version })}
              >
                {s.applyTimeout}
              </button>
            </div>
          )}
          <section className="dock">
            <div className="scoreboard-slot">
              <ul className="player-chips" aria-label={s.scoreboard}>
                {state.players.map((candidate) => {
                  const change = cashChanges[candidate.id];
                  const worth = netWorth(candidate, state.owners);
                  return (
                    <li
                      className={`player-chip${candidate.id === player.id ? ' current-chip' : ''}${candidate.connected && !candidate.eliminated ? '' : ' offline-chip'}`}
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
                        {candidate.eliminated && (
                          <span className="sr-only"> {s.classroom.eliminated}</span>
                        )}
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
              {visibleReview && (
                <div
                  className="dock-result"
                  aria-live="polite"
                  data-outcome={visibleReview.outcome}
                >
                  <button
                    className="dock-result-open"
                    type="button"
                    aria-label={s.classroom.viewSolution}
                    onClick={() => {
                      setReadAnswer(visibleReview.id);
                      setReview(undefined);
                      setSheet('solution');
                    }}
                  >
                    <strong>{answerOutcome(s, visibleReview, answerer(visibleReview))}</strong>
                    <span>{correctAnswerText(s, language, visibleReview)}</span>
                  </button>
                  <button
                    className="action secondary"
                    type="button"
                    aria-label={s.close}
                    onClick={() => {
                      setReadAnswer(visibleReview.id);
                      setReview(undefined);
                    }}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
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
        {state.pause &&
          (paused && presenter ? (
            <button
              className="action primary pause-tool"
              aria-label={s.classroom.resume}
              disabled={!ready}
              onClick={() => send({ t: 'resume' })}
            >
              <Play size={18} aria-hidden="true" />
            </button>
          ) : (
            !paused &&
            state.players.some((seat) => seat.id === you && !seat.eliminated && !seat.bot) && (
              <button
                className="action secondary pause-tool"
                aria-label={s.classroom.vote(state.pause.votes, state.pause.needed)}
                disabled={!ready || state.pause.voted}
                onClick={() => send({ t: 'pauseVote' })}
              >
                <Pause size={18} aria-hidden="true" />
              </button>
            )
          ))}
        <button className="action secondary" aria-label={s.howTo} onClick={openHowTo}>
          <CircleQuestionMark size={18} aria-hidden="true" />
        </button>
      </nav>
      {toasts.length > 0 && (
        <div className="game-feedback">
          <ToastStack toasts={toasts} state={state} you={you} />
        </div>
      )}
      {sheet === 'solution' && result && (
        <InfoDialog title={s.classroom.viewSolution} close={close}>
          <AnswerReview
            result={result}
            topic={topic}
            name={answerer(result)}
            mine={result.playerId === you}
            color={myColor}
            placement="panel"
          />
        </InfoDialog>
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
