import { useRef, useState } from 'react';
import { ClipboardCopy, Download, Upload } from 'lucide-react';
import {
  MAX_QUESTION_IMPORT_BYTES,
  QUESTION_LIMITS,
  QUESTION_TIERS,
  questionCsvHeader,
} from '../../../../shared/game';
import { useLanguage, useStrings } from '../../i18n/strings';

export type QuestionFileFormat = 'json' | 'csv';

export function CustomQuestionImport({
  text,
  format,
  disabled,
  changeText,
  changeFormat,
  report,
}: {
  text: string;
  format: QuestionFileFormat;
  disabled: boolean;
  changeText: (text: string) => void;
  changeFormat: (format: QuestionFileFormat) => void;
  report: (notice?: string) => void;
}) {
  const { classroom: s } = useStrings();
  const { language } = useLanguage();
  const labels = s.editor;
  const [copied, setCopied] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  const example = { ...s.sample, correct: 3 };
  const json = JSON.stringify([{ difficulty: 'easy', [language]: example }], null, 2);
  const csv = [
    questionCsvHeader([language]),
    ['easy', example.prompt, ...example.options, example.correct, example.hint, example.explanation]
      .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
      .join(','),
  ].join('\n');
  const limits = QUESTION_LIMITS;
  const prompt = [
    labels.aiIntro(`pologony-questions.${format}`),
    labels.aiRules(
      QUESTION_TIERS.join(' / '),
      labels.aiLimits(
        limits.count,
        limits.prompt,
        limits.option,
        limits.hint,
        limits.explanation,
        MAX_QUESTION_IMPORT_BYTES / 1024,
      ),
    ),
    format === 'json'
      ? labels.aiJson + '\n' + json
      : labels.aiCsv + '\n' + questionCsvHeader(['en', 'es']),
    labels.aiTeacher,
  ].join('\n\n');

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(labels.aiCopied);
    } catch {
      if (disclosure.current) disclosure.current.open = true;
      promptField.current?.focus();
      promptField.current?.select();
      let success = false;
      try {
        success = document.execCommand('copy');
      } catch {}
      setCopied(success ? labels.aiCopied : labels.aiManualCopy);
    }
  }

  return (
    <>
      <div className="question-input-field">
        <label htmlFor="custom-question-format">{s.importFormat}</label>
        <select
          id="custom-question-format"
          value={format}
          disabled={disabled}
          onChange={(event) => {
            changeFormat(event.currentTarget.value === 'csv' ? 'csv' : 'json');
            setCopied(undefined);
          }}
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
      </div>
      <section className="question-editor-card">
        <h2>{labels.aiTitle}</h2>
        <p>{labels.aiHelp}</p>
        <button type="button" className="action secondary" onClick={() => void copyPrompt()}>
          <ClipboardCopy size={17} aria-hidden="true" />
          {labels.aiCopy}
        </button>
        <details ref={disclosure}>
          <summary>{labels.aiPreview}</summary>
          <textarea
            aria-label={labels.aiPreview}
            ref={promptField}
            rows={7}
            readOnly
            value={prompt}
          />
        </details>
        {copied && <p role="status">{copied}</p>}
      </section>
      <section className="question-editor-card">
        <label className="question-upload">
          <input
            className="sr-only"
            type="file"
            aria-label={s.importFile}
            accept=".json,.csv,application/json,text/csv"
            disabled={disabled}
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              input.value = '';
              if (file.size > MAX_QUESTION_IMPORT_BYTES) {
                report(s.importSize);
                return;
              }
              try {
                changeText(await file.text());
                changeFormat(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
                setFileName(file.name);
                setCopied(undefined);
                report(undefined);
              } catch {
                report(s.importFailed);
              }
            }}
          />
          <Upload size={20} aria-hidden="true" />
          <strong>{s.importFile}</strong>
        </label>
        {fileName && <p className="question-source-name">{fileName}</p>}
        <details>
          <summary>{labels.pasteSource}</summary>
          <label>
            {s.importText}
            <textarea
              rows={6}
              value={text}
              disabled={disabled}
              onChange={(event) => {
                changeText(event.currentTarget.value);
                setFileName(undefined);
                report(undefined);
              }}
            />
          </label>
        </details>
        <div className="sample-downloads">
          {(
            [
              ['JSON', json],
              ['CSV', csv],
            ] as const
          ).map(([type, sample]) => (
            <a
              key={type}
              href={'data:text/plain;charset=utf-8,' + encodeURIComponent(sample)}
              download={`pologony-questions.${type.toLowerCase()}`}
            >
              <Download size={16} aria-hidden="true" />
              {s.sampleLabel(type)}
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
