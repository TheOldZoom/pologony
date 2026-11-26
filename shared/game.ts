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
export type GameSettings = { topic: Topic } & Record<Timer, number>;
export const DEFAULT_SETTINGS: GameSettings = {
  topic: 'polygons',
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
  return TIMER_KEYS.every((key) => {
    const time = settings[key];
    const { min, max } = GAME_TIMERS[key];
    return typeof time === 'number' && Number.isInteger(time) && time >= min && time <= max;
  });
}
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const MAX_PLAYERS = 6;
export const MAX_NAME_LENGTH = 12;
export const AVATAR_IDS = [
  'hat',
  'house',
  'hotel',
  'dice',
  'coin',
  'key',
  'crown',
  'car',
  'boat',
  'rocket',
  'cat',
  'star',
  'bot',
  'protractor',
  'chance',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export type TileKind = 'start' | 'rest' | 'tax' | 'chance' | 'property';
export type Tile = {
  kind: TileKind;
  n?: number;
  price?: number;
  rent?: number;
};

const CHANCE = [2, 7, 17, 22, 33, 36],
  TAX = [4, 38],
  CORNERS = [0, 10, 20, 30];
let k = 0;
export const TILES: Tile[] = Array.from({ length: 40 }, (_, i): Tile => {
  if (i === 0) return { kind: 'start' };
  if (CORNERS.includes(i)) return { kind: 'rest' };
  if (CHANCE.includes(i)) return { kind: 'chance' };
  if (TAX.includes(i)) return { kind: 'tax' };
  const n = 3 + Math.floor((k++ * 10) / 28);
  return { kind: 'property', n, price: n * 20, rent: n * 5 };
});

export function netWorth(
  player: Pick<Player, 'id' | 'cash'>,
  owners: PublicState['owners'],
): number {
  return TILES.reduce(
    (total, tile, index) => total + (owners[index] === player.id ? (tile.price ?? 0) : 0),
    player.cash,
  );
}

export type ClientMsg =
  | { t: 'create'; name: string; mode: RoomMode }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'avatar'; id: AvatarId }
  | { t: 'settings'; settings: GameSettings }
  | { t: 'remove'; player: string }
  | { t: 'leave' }
  | { t: 'start' }
  | ({ version: number } & (
      | { t: 'roll' | 'buy' | 'skip' | 'skipTurn' | 'applyTimeout' | 'rematch' }
      | { t: 'answer'; index: number }
    ));

export type Mark = 'side' | 'apothem' | 'radius' | 'diagonals' | 'none';
export type ChessPuzzle = {
  position: string;
  turn: 'white' | 'black';
  step?: 1 | 2;
  lastReply?: string;
};
export type QuestionCopy = { text: string; hint: string; options: string[] };
export type Phase = 'lobby' | 'roll' | 'question' | 'buy' | 'over';
export type Player = {
  id: string;
  name: string;
  color: string;
  avatar: AvatarId;
  pos: number;
  cash: number;
  connected: boolean;
  bot?: true;
};
export type PublicQuestion = QuestionCopy & {
  kind: 'buy' | 'rent' | 'chance';
  tile: number;
  english: QuestionCopy;
  n?: number;
  mark: Mark;
  chess?: ChessPuzzle;
};
export type QuestionSolution = {
  id: number;
  text: string;
  options: string[];
  correct: number;
  explanation: string;
  english: Omit<QuestionCopy, 'hint'> & { explanation: string };
  n?: number;
  mark: Mark;
  chess?: ChessPuzzle;
  chessLine?: [first: string, reply: string, last: string];
};
export type AnswerResult = QuestionSolution & {
  playerId: string;
  chosen: number;
  outcome: 'correct' | 'incorrect' | 'timeout';
  chessFollowup?: string;
};
export type GameEvent = { id: number } & (
  | { kind: 'joined' | 'left' | 'back'; player: string }
  | { kind: 'removed'; player: string; name: string; reason?: 'voluntary' }
  | { kind: 'turnSkipped'; player: string }
  | { kind: 'started' }
  | { kind: 'rematch' }
  | { kind: 'roll'; player: string; dice: [number, number] }
  | { kind: 'lap'; player: string; amount: number }
  | {
      kind: 'question';
      player: string;
      tile: number;
      q: 'buy' | 'rent' | 'chance';
      mystery?: true;
    }
  | { kind: 'answer'; player: string; correct: boolean; timeout: boolean }
  | { kind: 'buy'; player: string; tile: number; amount: number }
  | { kind: 'skip'; player: string; tile: number }
  | { kind: 'cantAfford'; player: string; tile: number }
  | {
      kind: 'rent';
      player: string;
      to: string;
      tile: number;
      amount: number;
      half: boolean;
    }
  | { kind: 'tax'; player: string; amount: number }
  | { kind: 'chance'; player: string; amount: number }
  | { kind: 'rest'; player: string }
  | { kind: 'oneMinute' }
  | { kind: 'over' }
);

export type PublicState = {
  code: string;
  phase: Phase;
  version: number;
  hostId: string;
  mode: RoomMode;
  settings: GameSettings;
  now: number;
  players: Player[];
  turn: number;
  owners: Record<number, string>;
  dice?: [number, number];
  question?: PublicQuestion;
  result?: AnswerResult;
  matchReview?: {
    topic: Topic;
    answers: AnswerResult[];
    recap: QuestionSolution[];
  };
  deadline?: number;
  endsAt?: number;
  standings?: { player: Player; worth: number }[];
  endedByHost?: true;
  events: GameEvent[];
};

export type ServerMsg =
  | { t: 'welcome'; token: string; you: string }
  | { t: 'state'; state: PublicState }
  | { t: 'left'; reason?: 'projector-ended' }
  | { t: 'error'; msg: string };
