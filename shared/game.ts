export const GAME_MINUTES = 20;
export const ROLL_SECONDS = 30;
export const QUESTION_SECONDS = 60;
export const BUY_SECONDS = 20;
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
export type Tile = { kind: TileKind; n?: number; price?: number; rent?: number };

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
  | { t: 'create'; name: string; withBot?: boolean }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'avatar'; id: AvatarId }
  | { t: 'start' }
  | { t: 'roll' }
  | { t: 'answer'; index: number }
  | { t: 'buy' }
  | { t: 'skip' };

export type Mark = 'side' | 'apothem' | 'radius' | 'diagonals' | 'none';
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
export type PublicQuestion = {
  kind: 'buy' | 'rent' | 'chance';
  tile: number;
  text: string;
  hint: string;
  options: string[];
  n?: number;
  mark: Mark;
};
export type GameEvent = { id: number } & (
  | { kind: 'joined' | 'left' | 'back'; player: string }
  | { kind: 'started' }
  | { kind: 'roll'; player: string; dice: [number, number] }
  | { kind: 'lap'; player: string; amount: number }
  | { kind: 'question'; player: string; tile: number; q: 'buy' | 'rent' | 'chance'; mystery?: true }
  | { kind: 'answer'; player: string; correct: boolean; timeout: boolean }
  | { kind: 'buy'; player: string; tile: number; amount: number }
  | { kind: 'skip'; player: string; tile: number }
  | { kind: 'cantAfford'; player: string; tile: number }
  | { kind: 'rent'; player: string; to: string; tile: number; amount: number; half: boolean }
  | { kind: 'tax'; player: string; amount: number }
  | { kind: 'chance'; player: string; amount: number }
  | { kind: 'rest'; player: string }
  | { kind: 'oneMinute' }
  | { kind: 'over' }
);

export type PublicState = {
  code: string;
  phase: Phase;
  hostId: string;
  now: number;
  players: Player[];
  turn: number;
  owners: Record<number, string>;
  dice?: [number, number];
  question?: PublicQuestion;
  result?: {
    id: number;
    playerId: string;
    text: string;
    options: string[];
    chosen: number;
    correct: number;
    explanation: string;
    n: number;
    mark: Mark;
  };
  deadline?: number;
  endsAt?: number;
  events: GameEvent[];
};

export type ServerMsg =
  | { t: 'welcome'; token: string; you: string }
  | { t: 'state'; state: PublicState }
  | { t: 'error'; msg: string };
