const TOPIC_IDS = [
  'polygons',
  'chess',
  'history',
  'world-heritage',
  'us-founding',
  'space-race',
] as const;
export type Topic = (typeof TOPIC_IDS)[number];
export type Language = 'en' | 'es';

export function topicTheme(topic: Topic): 'polygons' | 'chess' | 'history' {
  return topic === 'polygons' || topic === 'chess' ? topic : 'history';
}

export const ROOM_MODES = ['friends', 'projector', 'practice'] as const;
export type RoomMode = (typeof ROOM_MODES)[number];
export const GAME_TIMERS = {
  matchMinutes: { min: 5, max: 90, initial: 20 },
  rollSeconds: { min: 5, max: 120, initial: 30 },
  questionSeconds: { min: 10, max: 180, initial: 60 },
  buySeconds: { min: 5, max: 120, initial: 20 },
} as const;
export type Timer = keyof typeof GAME_TIMERS;
export const TIMER_KEYS = Object.keys(GAME_TIMERS) as Timer[];
export const DIFFICULTIES = ['easy', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type QuestionTier = Difficulty | 'challenge';
export const OPTIONAL_RULES = ['upgrades', 'restChallenges', 'bankruptcy'] as const;
export type OptionalRule = (typeof OPTIONAL_RULES)[number];
export const HINT_PRICE = 25;
export const STREAK_BONUS = 50;
export const MAX_SPECTATORS = 20;
export const MAX_QUESTION_IMPORT_BYTES = 512 * 1024;
export type GameSettings = {
  topic: Topic;
  difficulty?: Difficulty;
  botDifficulty?: Difficulty;
} & Partial<Record<OptionalRule, boolean>> &
  Record<Timer, number>;
export const DEFAULT_SETTINGS: GameSettings = {
  topic: 'polygons',
  difficulty: 'easy',
  botDifficulty: 'easy',
  upgrades: false,
  restChallenges: false,
  bankruptcy: false,
  matchMinutes: GAME_TIMERS.matchMinutes.initial,
  rollSeconds: GAME_TIMERS.rollSeconds.initial,
  questionSeconds: GAME_TIMERS.questionSeconds.initial,
  buySeconds: GAME_TIMERS.buySeconds.initial,
};

export function isGameSettings(value: unknown): value is GameSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<GameSettings>;
  if (typeof settings.topic !== 'string' || !TOPIC_IDS.some((id) => id === settings.topic))
    return false;
  for (const key of ['difficulty', 'botDifficulty'] as const)
    if (settings[key] !== undefined && !DIFFICULTIES.includes(settings[key])) return false;
  if (
    !OPTIONAL_RULES.every(
      (key) => settings[key] === undefined || typeof settings[key] === 'boolean',
    )
  )
    return false;
  return TIMER_KEYS.every((key) => {
    const time = settings[key];
    const { min, max } = GAME_TIMERS[key];
    return typeof time === 'number' && Number.isInteger(time) && time >= min && time <= max;
  });
}
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const MAX_PLAYERS = 6;
export const MAX_NAME_LENGTH = 12;
