import { useState } from 'react';
import {
  ChessBishop,
  ChessKing,
  ChessKnight,
  ChessPawn,
  ChessQueen,
  ChessRook,
} from 'lucide-react';
import { type ChessPuzzle } from '../../../../../shared/game';
import { useStrings, type Strings } from '../../../i18n/strings';

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

export function chessMoveLabel(s: Strings, move: string) {
  const label = s.chessPuzzle.move(move.slice(0, 2), move.slice(2, 4));
  const promotion = s.classroom.promotion[move[4] as keyof Strings['classroom']['promotion']];
  return promotion ? `${label} · ${promotion}` : label;
}

export function ChessBoard({
  puzzle,
  moves = [],
  selected,
  select,
  choosePromotion,
  solution,
}: {
  puzzle: ChessPuzzle;
  moves?: string[];
  selected?: number;
  select?: (index: number | undefined) => void;
  choosePromotion?: (indices: number[]) => void;
  solution?: string;
}) {
  const s = useStrings();
  const [origin, setOrigin] = useState<string>();
  const from = solution?.slice(0, 2) ?? origin;
  const to = (solution ?? (selected === undefined ? undefined : moves[selected]))?.slice(2, 4);
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
        const destinations = origin
          ? moves.flatMap((move, index) => (move.startsWith(origin + square) ? [index] : []))
          : [];
        const moveIndex = destinations[0] ?? -1;
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
                if (destinations.length > 1 && choosePromotion) choosePromotion(destinations);
                else select(moveIndex);
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
