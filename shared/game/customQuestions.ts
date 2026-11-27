import { DIFFICULTIES, type Language, type QuestionTier } from './settings';

export const QUESTION_TIERS = [...DIFFICULTIES, 'challenge'] as const;
export const QUESTION_LIMITS = {
  count: 500,
  prompt: 320,
  option: 150,
  hint: 320,
  explanation: 900,
};
export const QUESTION_CSV_FIELDS = [
  'prompt',
  'option1',
  'option2',
  'option3',
  'option4',
  'correct',
  'hint',
  'explanation',
] as const;

export type CustomQuestionCopy = {
  prompt: string;
  options: string[];
  correct: number;
  hint: string;
  explanation: string;
};
export type CustomQuestionEntry = { difficulty: QuestionTier } & Partial<
  Record<Language, CustomQuestionCopy>
>;

export function questionCsvHeader(languages: readonly Language[]): string {
  return [
    'difficulty',
    ...languages.flatMap((lang) => QUESTION_CSV_FIELDS.map((field) => `${lang}_${field}`)),
  ].join(',');
}
