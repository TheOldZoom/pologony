import { type CSSProperties } from 'react';
import {
  ChessBishop,
  ChessKing,
  ChessKnight,
  ChessQueen,
  ChessRook,
  Landmark,
  Amphora,
  Archive,
  Castle,
  Feather,
  Gem,
  Hexagon,
  MapPin,
  Orbit,
} from 'lucide-react';
import { type Mark, type Topic } from '../../../../../shared/game';
import { type Strings } from '../../../i18n/strings';
import Polygon from './Polygon';

const chessPieces = [
  ChessRook,
  ChessKnight,
  ChessBishop,
  ChessQueen,
  ChessKing,
  ChessBishop,
  ChessKnight,
  ChessRook,
];
const historySymbols = [Landmark, Gem, Archive, MapPin, Amphora];
const historyStamps = {
  history: Landmark,
  'world-heritage': Castle,
  'us-founding': Feather,
  'space-race': Orbit,
};

export function propertyName(s: Strings, topic: Topic, sides: number, index: number) {
  if (topic === 'polygons') return s.property(sides);
  if (topic === 'chess')
    return s.square(`${String.fromCharCode(97 + (index % 8))}${Math.floor(index / 8) + 1}`);
  return s.numberedProperty(s.historyProperties[index % s.historyProperties.length], index + 1);
}

export function TopicArt({
  topic,
  sides,
  index,
  ownerColor,
  label,
  mark,
}: {
  topic: Topic;
  sides?: number;
  index?: number;
  ownerColor?: string;
  label?: boolean;
  mark?: Mark | 'both';
}) {
  if (topic === 'polygons' && (sides !== undefined || mark !== undefined)) {
    return <Polygon n={sides ?? 6} mark={mark} ownerColor={ownerColor} label={label} />;
  }
  const Icon =
    topic === 'polygons'
      ? Hexagon
      : topic === 'chess'
        ? chessPieces[(index ?? 1) % chessPieces.length]
        : index === undefined
          ? historyStamps[topic]
          : historySymbols[index % historySymbols.length];
  return (
    <span
      className="topic-emblem"
      aria-hidden="true"
      data-owned={ownerColor ? '' : undefined}
      style={ownerColor ? ({ '--owner-fill': ownerColor } as CSSProperties) : undefined}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}
