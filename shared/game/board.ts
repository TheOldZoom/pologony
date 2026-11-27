import type { Player, PublicState } from './protocol';

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

export function tileRent(index: number, upgrades: PublicState['upgrades']): number {
  return Math.round((TILES[index].rent ?? 0) * (upgrades?.[index] ? 1.5 : 1) * 100) / 100;
}

export function netWorth(
  player: Pick<Player, 'id' | 'cash'>,
  owners: PublicState['owners'],
): number {
  return TILES.reduce(
    (total, tile, index) => total + (owners[index] === player.id ? (tile.price ?? 0) : 0),
    player.cash,
  );
}
