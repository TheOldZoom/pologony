import { useState, type ReactNode } from 'react';
import {
  Angle,
  ArrowUpRight,
  Bot,
  CarFront,
  Cat,
  ChessBishop,
  ChessKing,
  ChessKnight,
  ChessPawn,
  ChessQueen,
  ChessRook,
  CircleDollarSign,
  CircleQuestionMark,
  Crown,
  Dice5,
  DollarSign,
  HatGlasses,
  Hotel,
  House,
  KeyRound,
  Pause,
  Rocket,
  Sailboat,
  Star,
} from 'lucide-react';
import {
  TILES,
  type AvatarId,
  type ChessPuzzle,
  type PublicState,
  type TileKind,
} from '../../shared/game';
import { TopicArt } from './TopicArt';
import { useStrings, type Strings } from './strings';

const files = 'abcdefgh';
const pieces = {
  K: ChessKing,
  Q: ChessQueen,
  R: ChessRook,
  B: ChessBishop,
  N: ChessKnight,
  P: ChessPawn,
};
type PieceKind = keyof typeof pieces;
type Piece = PieceKind | Lowercase<PieceKind>;
const tileIcons = {
  start: ArrowUpRight,
  rest: Pause,
  chance: CircleQuestionMark,
  tax: DollarSign,
};
const avatarIcons = {
  hat: HatGlasses,
  house: House,
  hotel: Hotel,
  dice: Dice5,
  coin: CircleDollarSign,
  key: KeyRound,
  crown: Crown,
  car: CarFront,
  boat: Sailboat,
  rocket: Rocket,
  cat: Cat,
  star: Star,
  bot: Bot,
  protractor: Angle,
  chance: CircleQuestionMark,
};

export function PlayerAvatar({ id }: { id: AvatarId }) {
  const Icon = avatarIcons[id];
  return <Icon className="avatar-glyph" color="#f5f0fa" aria-hidden="true" />;
}

export function chessMoveLabel(s: Strings, move: string) {
  return s.chessPuzzle.move(move.slice(0, 2), move.slice(2));
}

export function ChessBoard({
  puzzle,
  moves = [],
  selected,
  select,
  solution,
}: {
  puzzle: ChessPuzzle;
  moves?: string[];
  selected?: number;
  select?: (index: number | undefined) => void;
  solution?: string;
}) {
  const s = useStrings();
  const [origin, setOrigin] = useState<string>();
  const from = solution?.slice(0, 2) ?? origin;
  const to = (solution ?? (selected === undefined ? undefined : moves[selected]))?.slice(2);
  const flipped = puzzle.turn === 'black';
  const position = Array.from(puzzle.position.replaceAll('/', '')).flatMap((symbol) =>
    /[1-8]/.test(symbol) ? Array<undefined>(Number(symbol)).fill(undefined) : [symbol as Piece],
  );
  const at = (square: string) => position[(8 - Number(square[1])) * 8 + files.indexOf(square[0])];

  return (
    <div
      className="chess-board"
      role="group"
      aria-label={solution ? s.chessPuzzle.solution : s.chessPuzzle.board}
    >
      {position.map((_, index) => {
        const col = index % 8;
        const row = Math.floor(index / 8);
        const file = files[flipped ? 7 - col : col];
        const rank = flipped ? row + 1 : 8 - row;
        const square = `${file}${rank}`;
        const piece =
          solution && from === square ? undefined : at(solution && to === square ? from! : square);
        const PieceIcon = piece ? pieces[piece.toUpperCase() as PieceKind] : undefined;
        const moveIndex = origin ? moves.indexOf(origin + square) : -1;
        const source = moves.some((move) => move.startsWith(square));
        const marked = square === from || square === to;
        const reply =
          !from &&
          (puzzle.lastReply?.slice(0, 2) === square || puzzle.lastReply?.slice(2) === square);
        const className = `chess-square${(row + col) % 2 ? ' chess-dark' : ''}${marked ? ' chess-picked' : ''}${reply ? ' chess-reply' : ''}`;
        const label = s.chessPuzzle.square(square, piece && s.chessPuzzle.pieces[piece]);
        const content = (
          <>
            {col === 0 && (
              <span className="chess-rank" aria-hidden="true">
                {rank}
              </span>
            )}
            {row === 7 && (
              <span className="chess-file" aria-hidden="true">
                {file}
              </span>
            )}
            {PieceIcon && (
              <PieceIcon
                className={
                  piece === piece?.toUpperCase() ? 'chess-white-piece' : 'chess-black-piece'
                }
                aria-hidden="true"
              />
            )}
            {select && moveIndex >= 0 && !marked && (
              <span className="chess-target" aria-hidden="true" />
            )}
          </>
        );
        return select ? (
          <button
            type="button"
            key={square}
            className={className}
            aria-label={label}
            aria-pressed={marked}
            disabled={!source && moveIndex < 0}
            onClick={() => {
              if (moveIndex >= 0) {
                select(moveIndex);
              } else {
                setOrigin(square === origin ? undefined : square);
                select(undefined);
              }
            }}
          >
            {content}
          </button>
        ) : (
          <span key={square} className={className} role="img" aria-label={label}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

function cell(index: number) {
  if (index <= 10) return { gridRow: 11, gridColumn: 11 - index };
  if (index <= 20) return { gridRow: 21 - index, gridColumn: 1 };
  if (index <= 30) return { gridRow: 1, gridColumn: index - 19 };
  return { gridRow: index - 29, gridColumn: 11 };
}

export function TileIcon({
  kind,
  label = false,
}: {
  kind: Exclude<TileKind, 'property'>;
  label?: boolean;
}) {
  const s = useStrings();
  const Icon = tileIcons[kind];
  return (
    <span className={`tile-icon icon-${kind}`} aria-hidden="true">
      <Icon aria-hidden="true" />
      {label && <span className="corner-label">{s.tileNames[kind]}</span>}
    </span>
  );
}

export default function Board({
  state,
  positions,
  landings,
  stamps,
  children,
}: {
  state: PublicState;
  positions: Record<string, number>;
  landings: Record<number, number>;
  stamps: Record<number, number>;
  children: ReactNode;
}) {
  const current = state.players[state.turn];
  return (
    <div className="board">
      {TILES.map((tile, index) => {
        const owner = state.players.find((player) => player.id === state.owners[index]);
        const land = landings[index];
        const stamp = stamps[index];
        return (
          <div
            key={index}
            aria-hidden="true"
            className={`tile tile-${tile.kind}${index % 2 === 0 ? ' tile-alt' : ''}${(positions[current.id] ?? current.pos) === index ? ' tile-current' : ''}`}
            style={cell(index)}
          >
            {tile.kind === 'property' ? (
              <span
                key={stamp}
                className={stamp === undefined ? 'tile-polygon' : 'tile-polygon tile-stamp'}
              >
                <TopicArt
                  topic={state.settings.topic}
                  sides={tile.n}
                  index={index}
                  ownerColor={owner?.color}
                  label
                />
              </span>
            ) : (
              <TileIcon kind={tile.kind} label={tile.kind === 'start' || tile.kind === 'rest'} />
            )}
            {owner && (
              <span
                className="owner-badge"
                style={{ backgroundColor: owner.color }}
                aria-hidden="true"
              >
                <PlayerAvatar id={owner.avatar} />
              </span>
            )}
            {land !== undefined && <span className="landing-flash" key={land} />}
          </div>
        );
      })}
      <div className="board-center">{children}</div>
      {TILES.map((_, index) => {
        const players = state.players.filter(
          (player) => (positions[player.id] ?? player.pos) === index,
        );
        const grid = cell(index);
        const justifySelf =
          grid.gridColumn === 1 ? 'start' : grid.gridColumn === 11 ? 'end' : 'center';
        return (
          players.length > 0 && (
            <span
              key={index}
              className="tokens"
              style={{ ...grid, justifySelf }}
              aria-hidden="true"
            >
              {players.map((player) => (
                <span
                  key={player.id}
                  className="token"
                  style={{
                    backgroundColor: player.color,
                    opacity: player.connected ? 1 : 0.55,
                  }}
                >
                  <span className={player.id === current.id ? 'active-token' : undefined}>
                    <PlayerAvatar id={player.avatar} />
                  </span>
                </span>
              ))}
            </span>
          )
        );
      })}
    </div>
  );
}
