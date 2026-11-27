import {
  QUESTION_CSV_FIELDS,
  QUESTION_LIMITS,
  QUESTION_TIERS,
  questionCsvHeader,
  type CustomQuestionEntry,
  type Language,
  type QuestionTier,
} from '../../shared/game';
import type { Question } from './types';

export type CustomQuestion = Question & { difficulty: QuestionTier; languages: Language[] };

export function customQuestionEntry(question: CustomQuestion): CustomQuestionEntry {
  const entry: CustomQuestionEntry = { difficulty: question.difficulty };
  for (const language of question.languages) {
    const { text, options, hint, explanation } = language === 'en' ? question.english : question;
    entry[language] = { prompt: text, options, correct: question.correct + 1, hint, explanation };
  }
  return entry;
}
export class QuestionImportError extends Error {
  constructor(
    readonly row: number,
    readonly issue: 'format' | 'fields' | 'length' | 'size',
  ) {
    super(issue);
  }
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let state: 'plain' | 'quoted' | 'closed' = 'plain';
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === undefined) throw new QuestionImportError(rows.length + 1, 'format');
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else state = 'closed';
      } else cell += char;
      continue;
    }
    if (char === ',' || char === '\r' || char === '\n' || char === undefined) {
      row.push(cell);
      cell = '';
      state = 'plain';
      if (char === ',') continue;
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && !cell && state === 'plain') state = 'quoted';
    else {
      if (char === '"' || state === 'closed')
        throw new QuestionImportError(rows.length + 1, 'format');
      cell += char;
    }
  }
  return rows;
}

function csvImport(text: string) {
  const [header, ...rows] = csvRows(text);
  if (!header?.length) throw new QuestionImportError(1, 'format');
  const fields = header.map((field) => field.trim().toLowerCase());
  const validFields = questionCsvHeader(['en', 'es']).split(',');
  if (
    new Set(fields).size !== fields.length ||
    fields.some((field) => !validFields.includes(field))
  )
    throw new QuestionImportError(1, 'fields');
  return rows.map((row, index) => {
    if (row.length !== fields.length) throw new QuestionImportError(index + 2, 'fields');
    const values = Object.fromEntries(fields.map((field, column) => [field, row[column].trim()]));
    function copy(lang: 'en' | 'es') {
      const columns = QUESTION_CSV_FIELDS.map((field) => values[`${lang}_${field}`]);
      if (!columns.some(Boolean)) return undefined;
      const [prompt, a, b, c, d, correct, hint, explanation] = columns;
      return { prompt, options: [a, b, c, d], correct: Number(correct), hint, explanation };
    }
    return { difficulty: values.difficulty || 'easy', en: copy('en'), es: copy('es') };
  });
}

function copyQuestion(value: unknown, row: number) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object') throw new QuestionImportError(row, 'fields');
  const { prompt, options, correct, hint, explanation } = value as Record<string, unknown>;
  const clean = (field: unknown, max: number, required = true) => {
    if (typeof field !== 'string') throw new QuestionImportError(row, 'fields');
    const text = field.trim();
    if (text.length > max) throw new QuestionImportError(row, 'length');
    if (required && !text) throw new QuestionImportError(row, 'fields');
    return text;
  };
  if (
    !Array.isArray(options) ||
    options.length !== 4 ||
    typeof correct !== 'number' ||
    !Number.isInteger(correct) ||
    correct < 1 ||
    correct > 4
  )
    throw new QuestionImportError(row, 'fields');
  const choices = options.map((choice) => clean(choice, QUESTION_LIMITS.option));
  if (new Set(choices).size !== 4) throw new QuestionImportError(row, 'fields');
  return {
    text: clean(prompt, QUESTION_LIMITS.prompt),
    options: choices,
    correct: correct - 1,
    hint: clean(hint ?? '', QUESTION_LIMITS.hint, false),
    explanation: clean(explanation, QUESTION_LIMITS.explanation),
  };
}

export function parseQuestionImport(text: string, csv: boolean): CustomQuestion[] {
  let rows: unknown;
  try {
    const content = text.replace(/^\uFEFF/, '');
    rows = csv ? csvImport(content) : JSON.parse(content);
  } catch (error) {
    if (error instanceof QuestionImportError) throw error;
    throw new QuestionImportError(0, 'format');
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new QuestionImportError(0, 'format');
  if (rows.length > QUESTION_LIMITS.count) throw new QuestionImportError(0, 'size');
  return rows.map((entry, index) => {
    const row = index + (csv ? 2 : 1);
    if (!entry || typeof entry !== 'object') throw new QuestionImportError(row, 'fields');
    const { difficulty = 'easy', en, es } = entry as Record<string, unknown>;
    if (!QUESTION_TIERS.some((tier) => tier === difficulty))
      throw new QuestionImportError(row, 'fields');
    const english = copyQuestion(en, row);
    const spanish = copyQuestion(es, row);
    const primary = spanish ?? english;
    if (!primary) throw new QuestionImportError(row, 'fields');
    const translation = english ?? primary;
    const translatedOptions = translation.options.slice();
    if (translation.correct !== primary.correct) {
      [translatedOptions[translation.correct], translatedOptions[primary.correct]] = [
        translatedOptions[primary.correct],
        translatedOptions[translation.correct],
      ];
    }
    return {
      ...primary,
      english: {
        text: translation.text,
        hint: translation.hint,
        explanation: translation.explanation,
        options: translatedOptions,
      },
      mark: 'none',
      difficulty: difficulty as QuestionTier,
      languages: [...(english ? (['en'] as const) : []), ...(spanish ? (['es'] as const) : [])],
    };
  });
}
