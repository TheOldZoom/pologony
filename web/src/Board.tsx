import type { ReactNode } from 'react';
import { TILES, type PublicState, type TileKind } from '../../shared/game';
import Polygon from './Polygon';
import { Avatar } from './avatars';
import { strings as s } from './strings';

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
  return (
    <span className={`tile-icon icon-${kind}`} aria-hidden="true">
      <span>{s.tileSymbols[kind]}</span>
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
            className={`tile tile-${tile.kind}${(positions[current.id] ?? current.pos) === index ? ' tile-current' : ''}`}
            style={cell(index)}
          >
            {tile.kind === 'property' ? (
              <span
                key={stamp}
                className={stamp === undefined ? 'tile-polygon' : 'tile-polygon tile-stamp'}
              >
                <Polygon n={tile.n!} ownerColor={owner?.color} label />
              </span>
            ) : (
              <TileIcon kind={tile.kind} label={tile.kind === 'start' || tile.kind === 'rest'} />
            )}
            {owner && (
              <span
                className="owner-initial"
                style={{ backgroundColor: owner.color }}
                aria-hidden="true"
              >
                {Array.from(owner.name)[0].toUpperCase()}
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
                  style={{ backgroundColor: player.color, opacity: player.connected ? 1 : 0.55 }}
                >
                  <span className={player.id === current.id ? 'active-token' : undefined}>
                    <Avatar id={player.avatar} size={14} />
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
