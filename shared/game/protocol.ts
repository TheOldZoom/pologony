import type { AvatarId } from './board';
import type { GameSettings, RoomMode, Topic } from './settings';

export type ClientMsg =
  | { t: 'create'; name: string; mode: RoomMode; settings?: GameSettings }
  | { t: 'join'; code: string; name: string }
  | { t: 'watch'; code: string }
  | { t: 'claimSeat'; name: string }
  | { t: 'pauseVote' | 'resume' }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'avatar'; id: AvatarId }
  | { t: 'settings'; settings: GameSettings }
  | { t: 'remove'; player: string }
  | { t: 'leave' }
  | { t: 'start' }
  | ({ version: number } & (
      | { t: 'roll' | 'buy' | 'skip' | 'skipTurn' | 'applyTimeout' | 'rematch' | 'hint' }
      | { t: 'answer'; index: number }
    ));

export type Mark = 'side' | 'apothem' | 'radius' | 'diagonals' | 'none';
export type ChessPuzzle = {
  position: string;
  turn: 'white' | 'black';
  step?: number;
  totalSteps?: number;
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
  eliminated?: true;
  resting?: true;
  streak?: number;
};
export type PublicQuestion = QuestionCopy & {
  kind: 'buy' | 'rent' | 'chance' | 'upgrade' | 'rest';
  tile: number;
  english: QuestionCopy;
  n?: number;
  mark: Mark;
  chess?: ChessPuzzle;
  hintAvailable?: boolean;
  hintRevealed?: boolean;
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
  chessLine?: string[];
  lichessId?: string;
};
export type AnswerResult = QuestionSolution & {
  playerId: string;
  chosen: number;
  outcome: 'correct' | 'incorrect' | 'timeout';
  chessFollowup?: string;
  chessAttempt?: string[];
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
      q: PublicQuestion['kind'];
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
  | { kind: 'upgraded'; player: string; tile: number }
  | { kind: 'streak'; player: string; amount: number }
  | { kind: 'bankrupt'; player: string; to?: string }
  | { kind: 'paused' | 'resumed' }
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
  upgrades?: Record<number, true>;
  customQuestions?: number;
  watching?: true;
  pause?: { votes: number; needed: number; expiresAt?: number; pausedAt?: number; voted?: true };
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
