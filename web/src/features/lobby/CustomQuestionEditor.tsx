import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookmarkPlus, FileUp, PencilLine, Plus } from 'lucide-react';
import {
  MAX_QUESTION_IMPORT_BYTES,
  QUESTION_LIMITS,
  topicTheme,
  type CustomQuestionEntry,
  type CustomQuestionCopy,
  type Topic,
} from '../../../../shared/game';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import { useLanguage, useStrings } from '../../i18n/strings';
import { CustomQuestionForm } from './CustomQuestionForm';
import { CustomQuestionImport, type QuestionFileFormat } from './CustomQuestionImport';
import {
  readSavedQuestionSets,
  SavedQuestionSets,
  SaveQuestionSetDialog,
  storeQuestionSets,
  type SavedQuestionSet,
} from './SavedQuestionSets';

const blankQuestion: CustomQuestionEntry = { difficulty: 'easy' };

function cleanCopy(copy: CustomQuestionCopy | undefined): CustomQuestionCopy | undefined {
  if (!copy) return;
  const prompt = copy.prompt.trim();
  const options = copy.options.map((option) => option.trim());
  const hint = copy.hint.trim();
  const explanation = copy.explanation.trim();
  if (prompt || options.some(Boolean) || hint || explanation)
    return { prompt, options, correct: copy.correct, hint, explanation };
}

async function loadQuestions(endpoint: string, authorization: string, signal?: AbortSignal) {
  const response = await fetch(endpoint, { headers: { Authorization: authorization }, signal });
  if (!response.ok) throw new Error('Could not load the room’s questions');
  const { questions } = (await response.json()) as { questions: CustomQuestionEntry[] };
  return questions;
}

export function CustomQuestionEditor({
  code,
  token,
  count,
  topic,
  ready,
  close,
}: {
  code: string;
  token: string;
  count: number;
  topic: Topic;
  ready: boolean;
  close: () => void;
}) {
  const strings = useStrings();
  const s = strings.classroom;
  const labels = s.editor;
  const { language } = useLanguage();
  const [mode, setMode] = useState<'write' | 'import'>('write');
  const [questions, setQuestions] = useState<CustomQuestionEntry[]>();
  const [formOpen, setFormOpen] = useState(false);
  const [savedSets, setSavedSets] = useState(readSavedQuestionSets);
  const [saving, setSaving] = useState<CustomQuestionEntry[]>();
  const [setName, setSetName] = useState('');
  const [draft, setDraft] = useState(blankQuestion);
  const [draftLanguage, setDraftLanguage] = useState(language);
  const [editing, setEditing] = useState<number>();
  const [text, setText] = useState('');
  const [format, setFormat] = useState<QuestionFileFormat>('json');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string>();
  const [loadFailed, setLoadFailed] = useState(false);
  const questionForm = useRef<HTMLElement>(null);
  const endpoint = `/rooms/${code}/questions`;
  const authorization = `Bearer ${token}`;
  const disabled = busy || loading || !ready;
  const pendingEdit = Boolean(draft.en || draft.es || editing !== undefined);
  const canUseSet =
    !disabled &&
    (mode === 'write' ? Boolean(questions?.length) && !pendingEdit : Boolean(text.trim()));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    void loadQuestions(endpoint, authorization, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setQuestions(loaded);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, authorization]);

  useEffect(() => {
    if (formOpen) questionForm.current?.querySelector('textarea')?.focus();
  }, [editing, formOpen, mode]);

  function cancelEdit() {
    setDraft(blankQuestion);
    setEditing(undefined);
    setFormOpen(false);
  }

  function keepQuestion() {
    if (!questions) return;
    const entry = { difficulty: draft.difficulty };
    const en = cleanCopy(draft.en);
    const es = cleanCopy(draft.es);
    if (!en && !es) {
      setNotice(labels.missingCopy);
      return;
    }
    for (const [locale, copy] of [
      ['en', en],
      ['es', es],
    ] as const) {
      if (
        copy &&
        (!copy.prompt ||
          !copy.explanation ||
          !copy.correct ||
          copy.options.some((option) => !option) ||
          new Set(copy.options).size !== 4)
      ) {
        setNotice(labels.invalidCopy(strings.languageOptions[locale]));
        return;
      }
    }
    const question = { ...entry, en, es };
    if (editing === undefined) setQuestions([...questions, question]);
    else setQuestions(questions.map((item, index) => (index === editing ? question : item)));
    cancelEdit();
    setNotice(undefined);
  }

  function saveSet(set: SavedQuestionSet) {
    const next = [...savedSets.filter(({ name }) => name !== set.name), set];
    if (!storeQuestionSets(next)) return false;
    setSavedSets(next);
    setSetName(set.name);
    setSaving(undefined);
    setNotice(labels.savedSet(set.name));
    return true;
  }

  async function update(modeToSave: 'preview' | 'apply' | 'remove' | 'save') {
    const remove = modeToSave === 'remove';
    const preview = modeToSave === 'preview' || modeToSave === 'save';
    const fileFormat = mode === 'write' ? 'json' : format;
    const body = mode === 'write' ? JSON.stringify(questions ?? []) : text;
    if (!remove && new TextEncoder().encode(body).byteLength > MAX_QUESTION_IMPORT_BYTES) {
      setNotice(s.importSize);
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(endpoint + (preview ? '?preview=1' : ''), {
        method: remove ? 'DELETE' : 'PUT',
        headers: {
          Authorization: authorization,
          'Content-Type': fileFormat === 'csv' ? 'text/csv' : 'application/json',
        },
        body: remove ? undefined : body,
      });
      const data = (await response.json()) as {
        count?: number;
        row?: number;
        issue?: string;
        questions?: CustomQuestionEntry[];
      };
      if (!response.ok || typeof data.count !== 'number') {
        const label =
          data.issue === 'size'
            ? s.importSize
            : data.issue === 'format'
              ? s.importFormatError
              : data.issue === 'fields'
                ? s.importFields
                : data.issue === 'length'
                  ? s.importLength
                  : s.importFailed;
        setNotice(data.row ? s.importRow(data.row, label) : label);
        return;
      }
      if (modeToSave === 'save') {
        if (data.questions?.length) setSaving(data.questions);
        else setNotice(s.importFailed);
        return;
      }
      if (remove) {
        cancelEdit();
        setQuestions([]);
      } else if (modeToSave === 'apply' && mode === 'import') {
        cancelEdit();
        setQuestions(undefined);
        setLoadFailed(false);
        try {
          setQuestions(await loadQuestions(endpoint, authorization));
        } catch {
          setLoadFailed(true);
        }
      }
      setNotice(modeToSave === 'preview' ? s.importPreview(data.count) : s.importCount(data.count));
    } catch {
      setNotice(s.importFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-page question-editor-page entrance" data-topic={topicTheme(topic)}>
      <div className="question-editor-content">
        <nav className="setup-nav">
          <button type="button" className="text-button" onClick={close}>
            <ArrowLeft size={17} aria-hidden="true" /> {strings.setup.backToSettings}
          </button>
          <LanguagePicker />
        </nav>
        <header className="question-editor-heading">
          <h1>{s.importTitle}</h1>
          <p>{s.importCount(count)}</p>
          {count > 0 && (
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => void update('remove')}
            >
              {s.importRemove}
            </button>
          )}
        </header>
        <div className="question-editor-switch" role="group" aria-label={s.importTitle}>
          {(['write', 'import'] as const).map((option) => (
            <button
              type="button"
              key={option}
              className="text-button"
              disabled={busy}
              aria-pressed={mode === option}
              onClick={() => {
                setMode(option);
                setNotice(undefined);
              }}
            >
              {option === 'write' ? (
                <PencilLine size={17} aria-hidden="true" />
              ) : (
                <FileUp size={17} aria-hidden="true" />
              )}
              {labels[option]}
            </button>
          ))}
        </div>

        <SavedQuestionSets
          sets={savedSets}
          disabled={disabled || pendingEdit}
          load={(set) => {
            cancelEdit();
            setQuestions(set.questions);
            setMode('write');
            setSetName(set.name);
            setNotice(labels.loadedSet(set.name));
          }}
          remove={(set) => {
            const next = savedSets.filter(({ name }) => name !== set.name);
            if (storeQuestionSets(next)) setSavedSets(next);
            else setNotice(labels.storageFailed);
          }}
        />
        {mode === 'write' ? (
          <>
            {loading && <p role="status">{labels.loading}</p>}
            {loadFailed && <p role="status">{s.importFailed}</p>}
            {questions && (
              <>
                <section className="question-editor-card">
                  <div className="question-draft-title">
                    <h2>{labels.draftCount(questions.length)}</h2>
                    {!formOpen && questions.length < QUESTION_LIMITS.count && (
                      <button
                        type="button"
                        className="action secondary"
                        disabled={disabled}
                        onClick={() => {
                          setNotice(undefined);
                          setFormOpen(true);
                        }}
                      >
                        <Plus size={17} aria-hidden="true" />
                        {labels.newQuestion}
                      </button>
                    )}
                  </div>
                  {questions.length === 0 ? (
                    <p>{labels.empty}</p>
                  ) : (
                    <ol className="question-draft-list">
                      {questions.map((question, index) => (
                        <li key={index}>
                          <span>{(question[language] ?? question.en ?? question.es)?.prompt}</span>
                          <button
                            type="button"
                            className="text-button"
                            disabled={disabled}
                            onClick={() => {
                              setDraft(question);
                              setDraftLanguage(
                                question[language] ? language : question.en ? 'en' : 'es',
                              );
                              setEditing(index);
                              setFormOpen(true);
                              setNotice(undefined);
                            }}
                          >
                            {labels.edit}
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            disabled={disabled}
                            onClick={() => {
                              setQuestions(questions.filter((_, i) => i !== index));
                              if (editing === index) cancelEdit();
                              else if (editing !== undefined && index < editing)
                                setEditing(editing - 1);
                            }}
                          >
                            {labels.remove}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                {formOpen && (
                  <section className="question-editor-card question-form-card" ref={questionForm}>
                    <CustomQuestionForm
                      question={draft}
                      language={draftLanguage}
                      editing={editing !== undefined}
                      disabled={disabled}
                      update={setDraft}
                      changeLanguage={setDraftLanguage}
                      submit={keepQuestion}
                      cancel={() => {
                        cancelEdit();
                        setNotice(undefined);
                      }}
                    />
                  </section>
                )}
              </>
            )}
          </>
        ) : (
          <section className="question-import">
            <p>{s.importDescription}</p>
            <CustomQuestionImport
              text={text}
              format={format}
              disabled={disabled}
              changeText={setText}
              changeFormat={setFormat}
              report={setNotice}
            />
          </section>
        )}
      </div>
      <footer className="question-editor-footer">
        {notice ? (
          <p role="status" className="question-editor-notice">
            {notice}
          </p>
        ) : (
          mode === 'write' &&
          pendingEdit && <p className="question-editor-notice">{labels.unfinished}</p>
        )}
        <div className="question-editor-actions">
          {mode === 'import' && (
            <button
              type="button"
              className="action secondary"
              disabled={!canUseSet}
              onClick={() => void update('preview')}
            >
              {s.importPreviewButton}
            </button>
          )}
          <button
            type="button"
            className="action secondary"
            disabled={!canUseSet}
            onClick={() => void update('save')}
          >
            <BookmarkPlus size={17} aria-hidden="true" />
            {labels.saveSet}
          </button>
          <button
            type="button"
            className="action primary"
            disabled={!canUseSet}
            onClick={() => void update('apply')}
          >
            {busy ? s.importBusy : s.importApply}
          </button>
        </div>
      </footer>
      {saving && (
        <SaveQuestionSetDialog
          sets={savedSets}
          questions={saving}
          initialName={setName}
          save={saveSet}
          close={() => setSaving(undefined)}
        />
      )}
    </main>
  );
}
