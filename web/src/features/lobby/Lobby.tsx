import { HostRoster } from './HostRoster';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  AVATAR_IDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  type ClientMsg,
  type PublicState,
} from '../../../../shared/game';
import { useStrings } from '../../i18n/strings';
import { loadSeat } from '../../network/useConnection';
import { LobbyInvite, FullscreenButton } from '../../components/RoomControls';
import { PlayerAvatar, PlayerToken } from '../../components/PlayerToken';
import { type ReviewPanel, ReviewButtons } from '../results/Results';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import { SettingsSummary, GameSettingsScreen } from './GameSettings';

export function Lobby({
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
  const [claimName, setClaimName] = useState('');
  const token = host ? loadSeat()?.token : undefined;
  const canStart = state.players.filter(({ connected }) => connected).length >= 2;
  if (setupOpen && host) {
    return (
      <GameSettingsScreen
        settings={state.settings}
        mode={state.mode}
        ready={ready}
        customQuestions={
          token ? { code: state.code, token, count: state.customQuestions ?? 0 } : undefined
        }
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
        <p className="rules-summary">
          {s.classroom.difficulty} · {s.classroom[state.settings.difficulty ?? 'easy']}
          {bot && (
            <>
              {' '}
              · {s.classroom.botDifficulty} · {s.classroom[state.settings.botDifficulty ?? 'easy']}
            </>
          )}
        </p>
        {state.customQuestions !== undefined && (
          <p className="rules-summary">{s.classroom.importCount(state.customQuestions)}</p>
        )}
        {state.watching && <p className="rules-summary">{s.classroom.watching}</p>}
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
        {state.watching && state.players.length < MAX_PLAYERS && (
          <form
            className="spectator-claim home-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (claimName.trim()) send({ t: 'claimSeat', name: claimName.trim() });
            }}
          >
            <label>
              {s.nickname}
              <input
                autoComplete="nickname"
                maxLength={MAX_NAME_LENGTH}
                value={claimName}
                onChange={(event) => setClaimName(event.currentTarget.value)}
                required
              />
            </label>
            <button className="action primary" disabled={!ready || !claimName.trim()}>
              {s.classroom.claimSeat}
            </button>
          </form>
        )}
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
          {state.watching ? s.classroom.leaveSpectating : presenter ? s.endSession : s.leaveRoom}
        </button>
      </div>
      {rosterOpen && presenter && (
        <HostRoster state={state} ready={ready} send={send} close={() => setRosterOpen(false)} />
      )}
    </main>
  );
}
