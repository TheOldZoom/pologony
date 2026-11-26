import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChessKnight, Globe, Monitor, Users } from 'lucide-react';
import {
  GAME_TIMERS,
  MAX_NAME_LENGTH,
  ROOM_ALPHABET,
  ROOM_MODES,
  TIMER_KEYS,
  isGameSettings,
  topicTheme,
  type ClientMsg,
  type GameSettings,
  type RoomMode,
  type Topic,
} from '../../shared/game';
import { useLanguage, useStrings } from './strings';
import { TopicArt } from './TopicArt';

const roomIcons = { friends: Users, projector: Monitor, practice: ChessKnight };

export function LanguagePicker() {
  const { language, changeLanguage } = useLanguage();
  const s = useStrings();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const positionMenu = useCallback(() => {
    if (!trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    menu.current.style.top = `${anchor.bottom + 6}px`;
    menu.current.style.right = `${document.documentElement.clientWidth - anchor.right}px`;
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, positionMenu]);

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="language-picker"
        aria-label={s.language}
        aria-expanded={open}
        aria-controls={menuId}
        popoverTarget={menuId}
      >
        <Globe size={20} aria-hidden="true" />
      </button>
      <div
        id={menuId}
        ref={menu}
        className="language-menu"
        popover="auto"
        role="group"
        aria-label={s.language}
        onBeforeToggle={(event) => {
          if (event.newState === 'open') positionMenu();
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open';
          setOpen(opening);
          if (opening)
            menu.current
              ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
              ?.focus({ preventScroll: true });
        }}
      >
        {(['en', 'es'] as const).map((locale) => (
          <button
            type="button"
            className="action secondary language-option"
            key={locale}
            lang={locale}
            aria-pressed={locale === language}
            onClick={() => {
              changeLanguage(locale);
              menu.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            {s.languageOptions[locale]}
            {locale === language && <Check size={17} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </>
  );
}

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
  const canSubmit =
    ready &&
    (screen === 'projector' || Boolean(name.trim())) &&
    (screen !== 'join' || code.length === 4);

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
              <h2>{mode?.title ?? (screen === 'join' ? s.setup.joinRoom : s.setup.createRoom)}</h2>
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
                    if (mode) send({ t: 'create', name: name.trim(), mode: mode.id });
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
                  {screen === 'join' && (
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
                    {mode ? s.setup.create : s.setup.join}
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

export function SettingsSummary({ settings }: { settings: GameSettings }) {
  const s = useStrings();
  return (
    <dl className="settings-summary">
      <div>
        <dt>{s.setup.topic}</dt>
        <dd className="topic-caption">
          <TopicArt topic={settings.topic} />
          {s.topics[settings.topic]}
        </dd>
      </div>
      {TIMER_KEYS.map((key) => (
        <div key={key}>
          <dt>{s.setup.timerName[key]}</dt>
          <dd>
            {key === 'matchMinutes'
              ? s.setup.minutes(settings[key])
              : s.setup.seconds(settings[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const categories = [
  { id: 'math', theme: 'polygons', subjects: ['polygons'] },
  { id: 'chess', theme: 'chess', subjects: [] },
  {
    id: 'history-category',
    theme: 'history',
    subjects: ['history', 'world-heritage', 'us-founding', 'space-race'],
  },
] as const satisfies readonly {
  id: string;
  theme: Topic;
  subjects: readonly Topic[];
}[];
type Category = Exclude<(typeof categories)[number]['id'], 'chess'>;

export function GameSettingsScreen({
  settings,
  ready,
  close,
  openExit,
  save,
}: {
  settings: GameSettings;
  ready: boolean;
  close: () => void;
  openExit: () => void;
  save: (settings: GameSettings) => boolean;
}) {
  const s = useStrings();
  const [draft, setDraft] = useState(settings);
  const [category, setCategory] = useState<Category>();
  const names = {
    math: s.setup.math,
    chess: s.topics.chess,
    'history-category': s.setup.history,
  };
  const browsing = categories.find(({ id }) => id === category);

  return (
    <main className="settings-page entrance" data-topic={topicTheme(draft.topic)}>
      <nav className="setup-nav">
        <button className="text-button" type="button" onClick={close}>
          {s.setup.backToLobby}
        </button>
        <button className="text-button" type="button" onClick={openExit}>
          {s.backHome}
        </button>
        <LanguagePicker />
      </nav>
      <h1>{s.setup.settings}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isGameSettings(draft) && save(draft)) close();
        }}
      >
        <fieldset>
          <legend>{s.setup.topic}</legend>
          <div className="topic-picker">
            {categories.map(({ id, theme }) => (
              <button
                type="button"
                className="topic-option"
                key={id}
                data-topic={theme}
                aria-expanded={id === 'chess' ? undefined : category === id}
                aria-pressed={id === 'chess' ? draft.topic === 'chess' : undefined}
                onClick={() => {
                  if (id === 'chess') {
                    setDraft((current) => ({ ...current, topic: 'chess' }));
                    setCategory(undefined);
                  } else {
                    setCategory(category === id ? undefined : id);
                  }
                }}
              >
                <TopicArt topic={theme} />
                <strong>{names[id]}</strong>
              </button>
            ))}
          </div>
          {browsing && (
            <div
              className="subject-picker"
              role="group"
              aria-label={s.setup.subjects(names[browsing.id])}
            >
              {browsing.subjects.map((topic) => (
                <button
                  type="button"
                  key={topic}
                  className="action secondary"
                  aria-pressed={draft.topic === topic}
                  onClick={() => setDraft((current) => ({ ...current, topic }))}
                >
                  {s.topics[topic]}
                </button>
              ))}
            </div>
          )}
          <p className="selected-topic" aria-live="polite">
            {s.setup.selectedTopic} ·{' '}
            <strong className="topic-caption">
              <TopicArt topic={draft.topic} />
              {s.topics[draft.topic]}
            </strong>
          </p>
        </fieldset>
        <fieldset>
          <legend>{s.setup.timers}</legend>
          <div className="timer-fields">
            {TIMER_KEYS.map((key) => {
              const { min, max } = GAME_TIMERS[key];
              return (
                <div className="timer-field" key={key}>
                  <label htmlFor={key}>{s.setup.timerLabel[key]}</label>
                  <input
                    id={key}
                    type="number"
                    required
                    min={min}
                    max={max}
                    step={1}
                    aria-describedby={`${key}-range`}
                    value={Number.isNaN(draft[key]) ? '' : draft[key]}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [key]: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                  <small id={`${key}-range`}>
                    {min}–{max}
                  </small>
                </div>
              );
            })}
          </div>
        </fieldset>
        <button
          type="submit"
          className="action primary"
          disabled={!ready || !isGameSettings(draft)}
        >
          {s.setup.save}
        </button>
      </form>
    </main>
  );
}
