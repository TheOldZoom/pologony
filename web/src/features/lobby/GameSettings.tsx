import { useState } from 'react';
import { Check, FilePenLine } from 'lucide-react';
import {
  topicTheme,
  GAME_TIMERS,
  DIFFICULTIES,
  OPTIONAL_RULES,
  TIMER_KEYS,
  isGameSettings,
  type GameSettings,
  type Topic,
  type RoomMode,
} from '../../../../shared/game';
import { useStrings } from '../../i18n/strings';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import { TopicArt } from '../game/board/TopicArt';
import { CustomQuestionEditor } from './CustomQuestionEditor';

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
  mode,
  ready,
  customQuestions,
  close,
  openExit,
  save,
}: {
  settings: GameSettings;
  mode: RoomMode;
  ready: boolean;
  customQuestions?: { code: string; token: string; count: number };
  close: () => void;
  openExit: () => void;
  save: (settings: GameSettings) => boolean;
}) {
  const s = useStrings();
  const [draft, setDraft] = useState(settings);
  const [category, setCategory] = useState<Category>();
  const [editingQuestions, setEditingQuestions] = useState(false);
  const names = {
    math: s.setup.math,
    chess: s.topics.chess,
    'history-category': s.setup.history,
  };
  const browsing = categories.find(({ id }) => id === category);

  if (editingQuestions && customQuestions) {
    return (
      <CustomQuestionEditor
        {...customQuestions}
        topic={draft.topic}
        ready={ready}
        close={() => setEditingQuestions(false)}
      />
    );
  }

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
            {customQuestions && (
              <button
                type="button"
                className="topic-option topic-option-custom"
                onClick={() => setEditingQuestions(true)}
              >
                <FilePenLine size={24} aria-hidden="true" />
                <strong>{s.classroom.importTitle}</strong>
              </button>
            )}
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
        {(
          ['difficulty', ...(mode === 'practice' ? (['botDifficulty'] as const) : [])] as const
        ).map((key) => (
          <fieldset key={key}>
            <legend>{s.classroom[key]}</legend>
            <div className="subject-picker">
              {DIFFICULTIES.map((difficulty) => (
                <button
                  type="button"
                  key={difficulty}
                  className="action secondary"
                  aria-pressed={(draft[key] ?? 'easy') === difficulty}
                  onClick={() => setDraft({ ...draft, [key]: difficulty })}
                >
                  {s.classroom[difficulty]}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset className="optional-rules">
          <legend>{s.classroom.rules}</legend>
          {OPTIONAL_RULES.map((rule) => (
            <label className="settings-check" key={rule}>
              <input
                className="sr-only"
                type="checkbox"
                checked={Boolean(draft[rule])}
                onChange={(event) => setDraft({ ...draft, [rule]: event.currentTarget.checked })}
              />
              <span className="settings-checkmark" aria-hidden="true">
                <Check size={16} />
              </span>
              {s.classroom[rule]}
            </label>
          ))}
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
