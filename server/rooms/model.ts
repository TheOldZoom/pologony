import {
  AVATAR_IDS,
  DEFAULT_SETTINGS,
  type AvatarId,
  type GameEvent,
  type AnswerResult,
  type Player,
  type PublicQuestion,
  type PublicState,
  type QuestionSolution,
  type RoomMode,
  type Topic,
} from '../../shared/game';
import type { Question } from '../questions/types';
import type { CustomQuestion } from '../questions/custom';
import type { DailyPuzzles } from '../chess/cache';

type PrivateQuestion = Question &
  Pick<PublicQuestion, 'kind' | 'tile'> & {
    chessStepAt?: number;
    stepIndex?: number;
    hintBought?: true;
    botMisses?: boolean;
  };
export type Room = Omit<
  PublicState,
  'now' | 'question' | 'matchReview' | 'pause' | 'watching' | 'customQuestions'
> & {
  question?: PrivateQuestion;
  warnedOneMinute?: boolean;
  questionDeck: number[];
  upgradeDeck?: number[];
  customDeck?: CustomQuestion[];
  usedCustom?: number[];
  chessDaily?: DailyPuzzles;
  chessDraws?: number;
  chessTrivia?: number[];
  spectators?: string[];
  pauseVote?: { by: string[]; expiresAt: number };
  pausedAt?: number;
  answers: AnswerResult[];
  recap?: { topic: Topic; questions: QuestionSolution[] };
};

const COLORS = ['#b3243c', '#076a50', '#5534bb', '#8a5100', '#155e9e', '#a12878'];

export function newRoom(code: string, hostId: string, mode: RoomMode): Room {
  return {
    code,
    phase: 'lobby',
    version: 0,
    hostId,
    mode,
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    turn: 0,
    owners: {},
    events: [],
    questionDeck: [],
    answers: [],
  };
}

export function addPlayer(room: Room, id: string, name: string, bot = false): Room {
  const unused = (avatar: AvatarId) => !room.players.some((player) => player.avatar === avatar);
  const avatar = bot && unused('bot') ? 'bot' : AVATAR_IDS.find(unused)!;
  const player: Player = {
    id,
    name,
    avatar,
    color: COLORS.find((color) => !room.players.some((seat) => seat.color === color))!,
    pos: 0,
    cash: 1500,
    connected: true,
    ...(bot && { bot: true }),
  };
  return addEvent({ ...room, players: [...room.players, player] }, { kind: 'joined', player: id });
}

export function setAvatar(room: Room, id: string, avatar: AvatarId): Room {
  return {
    ...room,
    players: room.players.map((player) => (player.id === id ? { ...player, avatar } : player)),
  };
}

export function setConnected(room: Room, id: string, connected: boolean): Room {
  const player = room.players.find((candidate) => candidate.id === id);
  if (!player || player.connected === connected) return room;
  const players = room.players.map((candidate) =>
    candidate.id === id ? { ...candidate, connected } : candidate,
  );
  return addEvent({ ...room, players }, { kind: connected ? 'back' : 'left', player: id });
}

export function currentChoices(question: PrivateQuestion) {
  return (
    question.chessStages?.[question.stepIndex ?? 0] ??
    (question.chessStepAt === undefined ? question : question.chessLine!)
  );
}

export function correctOption(question: PrivateQuestion, index?: number) {
  if (index === undefined) return false;
  const stage = question.chessStages?.[question.stepIndex ?? 0];
  return stage?.accepted?.includes(index) ?? index === currentChoices(question).correct;
}

type WithoutEventId<Event> = Event extends { id: number } ? Omit<Event, 'id'> : never;

export function addEvent(room: Room, event: WithoutEventId<GameEvent>): Room {
  const id = (room.events.at(-1)?.id ?? 0) + 1;
  return { ...room, events: [...room.events, { ...event, id }].slice(-30) };
}
