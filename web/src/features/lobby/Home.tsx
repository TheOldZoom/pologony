import { useState } from 'react';
import { ChessKnight, Monitor, Users } from 'lucide-react';
import {
  ROOM_ALPHABET,
  MAX_NAME_LENGTH,
  ROOM_MODES,
  type ClientMsg,
  type RoomMode,
} from '../../../../shared/game';
import { useStrings } from '../../i18n/strings';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import { lastHostSettings } from './hostSettings';
import { TopicArt } from '../game/board/TopicArt';

const roomIcons = { friends: Users, projector: Monitor, practice: ChessKnight };

export function Home({
  ready,
  send,
  invite,
  backHome,
}: {
  ready: boolean;
  send: (message: ClientMsg) => boolean;
  invite: string;
  backHome: () => void;
}) {
  const s = useStrings();
  const [screen, setScreen] = useState<'welcome' | 'create' | 'join' | RoomMode>(
    invite ? 'join' : 'welcome',
  );
  const [name, setName] = useState('');
  const [code, setCode] = useState(invite);
  const roomModes = ROOM_MODES.map((id) => ({
    id,
    ...s.roomModes[id],
    Icon: roomIcons[id],
  }));
  const mode = roomModes.find(({ id }) => id === screen);
  const joining = screen === 'join';
  const canSubmit =
    ready && (screen === 'projector' || Boolean(name.trim())) && (!joining || code.length === 4);

  return (
    <main className="home entrance">
      <LanguagePicker />
      <div className="welcome-copy">
        <h1>{s.title}</h1>
        <p>{s.setup.welcome}</p>
        <div className="home-step" key={screen}>
          {screen === 'welcome' ? (
            <div className="home-modes">
              <button type="button" className="action primary" onClick={() => setScreen('create')}>
                {s.setup.createRoom}
              </button>
              <button type="button" className="action secondary" onClick={() => setScreen('join')}>
                {s.setup.joinRoom}
              </button>
            </div>
          ) : (
            <>
              <div className="setup-nav">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    backHome();
                    setScreen('welcome');
                    setName('');
                    setCode('');
                  }}
                >
                  {s.backHome}
                </button>
                {mode && (
                  <button type="button" className="text-button" onClick={() => setScreen('create')}>
                    {s.setup.roomTypes}
                  </button>
                )}
              </div>
              <h2>{mode?.title ?? (joining ? s.setup.joinRoom : s.setup.createRoom)}</h2>
              {screen === 'create' ? (
                <div className="room-modes">
                  {roomModes.map(({ id, title, description, Icon }) => (
                    <button
                      className="room-mode"
                      type="button"
                      key={id}
                      onClick={() => setScreen(id)}
                    >
                      <Icon className="room-mode-icon" size={25} aria-hidden="true" />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  className="home-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!canSubmit) return;
                    if (mode)
                      send({
                        t: 'create',
                        name: name.trim(),
                        mode: mode.id,
                        settings: lastHostSettings(),
                      });
                    else send({ t: 'join', name: name.trim(), code });
                  }}
                >
                  {screen !== 'projector' && (
                    <label>
                      {s.nickname}
                      <input
                        placeholder={s.nicknameHint}
                        name="nickname"
                        maxLength={MAX_NAME_LENGTH}
                        autoComplete="nickname"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                      />
                    </label>
                  )}
                  {joining && (
                    <label>
                      {s.code}
                      <input
                        className="code-entry"
                        placeholder={s.codeHint}
                        name="room-code"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        value={code}
                        onChange={(event) =>
                          setCode(
                            Array.from(event.target.value.toUpperCase())
                              .filter((letter) => ROOM_ALPHABET.includes(letter))
                              .slice(0, 4)
                              .join(''),
                          )
                        }
                        required
                      />
                    </label>
                  )}
                  {screen === 'projector' && <p>{mode?.description}</p>}
                  <button className="action primary" type="submit" disabled={!canSubmit}>
                    {joining ? s.setup.join : s.setup.create}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
      <div className="welcome-board" aria-hidden="true">
        <div className="welcome-board-track">
          <div className="welcome-board-center">
            <span className="welcome-topic" data-topic="polygons">
              <TopicArt topic="polygons" />
            </span>
            <span className="welcome-topic" data-topic="chess">
              <TopicArt topic="chess" index={1} />
            </span>
            <span className="welcome-topic" data-topic="history">
              <TopicArt topic="history" />
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
