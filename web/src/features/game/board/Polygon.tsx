import { type Mark } from '../../../../../shared/game';

const tints = [
  '#fff2ef',
  '#fff5dd',
  '#eaf9f3',
  '#f1eeff',
  '#eaf5ff',
  '#fceef6',
  '#f7effb',
  '#f0f8e3',
  '#fff2e4',
  '#ebf7fa',
];
const outlines = [
  '#c36c60',
  '#b1832d',
  '#478c74',
  '#8574c9',
  '#648bb4',
  '#b8709a',
  '#9d77ab',
  '#739745',
  '#bd8156',
  '#548b99',
];

export default function Polygon({
  n,
  fill,
  ownerColor,
  mark = 'none',
  label = false,
}: {
  n: number;
  fill?: string;
  ownerColor?: string;
  mark?: Mark | 'both';
  label?: boolean;
}) {
  const rotation = -Math.PI / 2 + (n % 2 === 0 ? Math.PI / n : 0);
  const points = Array.from({ length: n }, (_, i) => {
    const angle = rotation + (2 * i * Math.PI) / n;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const scale = 88 / Math.max(right - left, bottom - top);
  const centerX = 50 - ((left + right) * scale) / 2;
  const centerY = 50 - ((top + bottom) * scale) / 2;
  const vertices = points.map(({ x, y }) => ({
    x: centerX + x * scale,
    y: centerY + y * scale,
  }));
  const first = vertices[0];
  const second = vertices[1];
  const diagonals =
    mark === 'diagonals'
      ? vertices.flatMap((a, i) =>
          vertices
            .slice(i + 2, i === 0 ? n - 1 : n)
            .map((b, j) => <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />),
        )
      : [];
  const showRadius = mark === 'radius' || mark === 'both';
  const showApothem = mark === 'apothem' || mark === 'both';

  return (
    <svg className="polygon" viewBox="0 0 100 100" aria-hidden="true">
      <polygon
        className="polygon-outline"
        points={vertices.map(({ x, y }) => `${x},${y}`).join(' ')}
        fill={ownerColor ?? fill ?? tints[n - 3]}
        stroke={ownerColor ?? (fill ? '#182340' : outlines[n - 3])}
      />
      {mark === 'diagonals' && <g className="diagonals">{diagonals}</g>}
      {mark === 'side' && (
        <line className="polygon-mark" x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
      )}
      {showApothem && (
        <line
          className="polygon-mark"
          x1={centerX}
          y1={centerY}
          x2={(first.x + second.x) / 2}
          y2={(first.y + second.y) / 2}
        />
      )}
      {showRadius && (
        <line
          className={mark === 'both' ? 'polygon-mark radius-mark' : 'polygon-mark'}
          x1={centerX}
          y1={centerY}
          x2={first.x}
          y2={first.y}
        />
      )}
      {(showApothem || showRadius) && (
        <circle className="polygon-mark" cx={centerX} cy={centerY} r="2" />
      )}
      {label && (
        <text
          className={ownerColor ? 'owned-number' : undefined}
          x="50"
          y="53"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {n}
        </text>
      )}
    </svg>
  );
}
