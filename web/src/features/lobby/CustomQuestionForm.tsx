import { Check } from 'lucide-react';
import {
  QUESTION_LIMITS,
  QUESTION_TIERS,
  type CustomQuestionCopy,
  type CustomQuestionEntry,
  type Language,
} from '../../../../shared/game';
import { useStrings } from '../../i18n/strings';

const EMPTY_COPY: CustomQuestionCopy = {
  prompt: '',
  options: ['', '', '', ''],
  correct: 0,
  hint: '',
  explanation: '',
};

export function CustomQuestionForm({
  question,
  language,
  editing,
  disabled,
  update,
  changeLanguage,
  submit,
  cancel,
}: {
  question: CustomQuestionEntry;
  language: Language;
  editing: boolean;
  disabled: boolean;
  update: (question: CustomQuestionEntry) => void;
  changeLanguage: (language: Language) => void;
  submit: () => void;
  cancel: () => void;
}) {
  const s = useStrings();
  const labels = s.classroom.editor;
  const copy = question[language] ?? EMPTY_COPY;
  function updateCopy(change: Partial<CustomQuestionCopy>) {
    update({ ...question, [language]: { ...copy, ...change } });
  }
  return (
    <form
      className="question-import"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2>{editing ? labels.editQuestion : labels.newQuestion}</h2>
      <div className="question-input-field">
        <label htmlFor="custom-question-difficulty">{s.classroom.difficulty}</label>
        <select
          id="custom-question-difficulty"
          value={question.difficulty}
          disabled={disabled}
          onChange={(event) => {
            const difficulty = QUESTION_TIERS.find((tier) => tier === event.currentTarget.value);
            if (difficulty) update({ ...question, difficulty });
          }}
        >
          {QUESTION_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier === 'challenge' ? labels.challenge : s.classroom[tier]}
            </option>
          ))}
        </select>
      </div>
      <div className="question-editor-actions" role="group" aria-label={labels.language}>
        {(['en', 'es'] as const).map((locale) => (
          <button
            key={locale}
            type="button"
            className="action secondary"
            disabled={disabled}
            aria-pressed={language === locale}
            onClick={() => changeLanguage(locale)}
          >
            {s.languageOptions[locale]}
          </button>
        ))}
      </div>
      <label>
        {labels.prompt}
        <textarea
          rows={2}
          value={copy.prompt}
          maxLength={QUESTION_LIMITS.prompt}
          disabled={disabled}
          onChange={(event) => updateCopy({ prompt: event.currentTarget.value })}
        />
      </label>
      <fieldset className="question-answer-fields">
        <legend>{labels.correctHint}</legend>
        {copy.options.map((option, index) => (
          <div
            className="question-answer-field"
            data-correct={copy.correct === index + 1}
            key={index}
          >
            <span aria-hidden="true">{String.fromCharCode(65 + index)}</span>
            <input
              aria-label={labels.option(index + 1)}
              value={option}
              maxLength={QUESTION_LIMITS.option}
              disabled={disabled}
              onChange={(event) => {
                const options = copy.options.slice();
                options[index] = event.currentTarget.value;
                updateCopy({ options });
              }}
            />
            <label className="question-check" title={labels.correct}>
              <input
                className="sr-only"
                type="radio"
                name="custom-question-correct"
                aria-label={labels.markCorrect(index + 1)}
                checked={copy.correct === index + 1}
                disabled={disabled}
                onChange={() => updateCopy({ correct: index + 1 })}
              />
              <span aria-hidden="true">
                <Check size={16} />
              </span>
            </label>
          </div>
        ))}
      </fieldset>
      <label>
        {labels.hint}
        <input
          value={copy.hint}
          maxLength={QUESTION_LIMITS.hint}
          disabled={disabled}
          onChange={(event) => updateCopy({ hint: event.currentTarget.value })}
        />
      </label>
      <label>
        {labels.explanation}
        <textarea
          rows={2}
          value={copy.explanation}
          maxLength={QUESTION_LIMITS.explanation}
          disabled={disabled}
          onChange={(event) => updateCopy({ explanation: event.currentTarget.value })}
        />
      </label>
      <div className="question-editor-actions">
        <button className="action primary" disabled={disabled}>
          {editing ? labels.saveEdit : labels.add}
        </button>
        <button type="button" className="action secondary" disabled={disabled} onClick={cancel}>
          {s.cancel}
        </button>
      </div>
    </form>
  );
}
