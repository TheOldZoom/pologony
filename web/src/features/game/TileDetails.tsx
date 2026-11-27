import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TILES, tileRent, type Player, type PublicState } from '../../../../shared/game';
import { useStrings } from '../../i18n/strings';
import { PlayerToken } from '../../components/PlayerToken';
import { InfoDialog } from '../../components/InfoDialog';
import { describeEvent } from '../../components/EventMessages';
import { TileIcon } from './board/Board';
import { propertyName, TopicArt } from './board/TopicArt';

function Owner({ player }: { player?: Player }) {
  const s = useStrings();
  return (
    <span className="owner">
      {player && <PlayerToken player={player} size={16} />}
      {player?.name ?? s.unowned}
    </span>
  );
}

export function TileInfo({
  index,
  setIndex,
  close,
  browse,
  state,
}: {
  index: number;
  setIndex: (index: number) => void;
  close: () => void;
  browse: () => void;
  state: PublicState;
}) {
  const s = useStrings();
  const tile = TILES[index];
  const owner = state.players.find((player) => player.id === state.owners[index]);
  const occupants = state.players
    .filter((player) => player.pos === index)
    .map((player) => player.name);
  const n = tile.n ?? 0;
  const topic = state.settings.topic;
  const title =
    tile.kind === 'property' ? propertyName(s, topic, n, index) : s.tileNames[tile.kind];
  const degrees = (angle: number) => `${Math.round(angle * 100) / 100}°`;

  return (
    <InfoDialog title={title} close={close}>
      {tile.kind === 'property' ? (
        <>
          <div className="tile-diagram">
            <TopicArt topic={topic} sides={n} index={index} mark="both" />
          </div>
          {topic === 'polygons' && (
            <div className="diagram-key">
              <span>
                <i />
                {s.apothem}
              </span>
              <span>
                <i />
                {s.radius}
              </span>
            </div>
          )}
          <dl className="facts">
            {topic === 'polygons' && (
              <>
                <div>
                  <dt>{s.interiorAngle}</dt>
                  <dd>{degrees(((n - 2) * 180) / n)}</dd>
                </div>
                <div>
                  <dt>{s.centralAngle}</dt>
                  <dd>{degrees(360 / n)}</dd>
                </div>
                <div>
                  <dt>{s.diagonals}</dt>
                  <dd>{(n * (n - 3)) / 2}</dd>
                </div>
              </>
            )}
            <div>
              <dt>{s.price}</dt>
              <dd className="money">{s.money(tile.price!)}</dd>
            </div>
            <div>
              <dt>{s.rent}</dt>
              <dd className="money">
                {s.money(tileRent(index, state.upgrades))}
                {state.upgrades?.[index] && <> · {s.classroom.upgraded}</>}
              </dd>
            </div>
            <div>
              <dt>{s.owner}</dt>
              <dd>
                <Owner player={owner} />
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <div className="special-detail">
          <TileIcon kind={tile.kind} />
          <p>
            {tile.kind === 'rest' && state.settings.restChallenges
              ? s.classroom.restTile
              : s.tileDescriptions[tile.kind]}
          </p>
        </div>
      )}
      {occupants.length > 0 && <p className="occupants">{s.occupants(occupants)}</p>}
      <div className="tile-nav">
        <button
          className="action secondary"
          aria-label={s.previousTile}
          onClick={() => setIndex((index - 1 + TILES.length) % TILES.length)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span>{s.tileNumber(index, TILES.length)}</span>
        <button className="action secondary" onClick={browse}>
          {s.tileList}
        </button>
        <button
          className="action secondary"
          aria-label={s.nextTile}
          onClick={() => setIndex((index + 1) % TILES.length)}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </InfoDialog>
  );
}

const propertyGroups = Array.from({ length: 10 }, (_, index) => {
  const n = index + 3;
  return {
    n,
    indices: TILES.flatMap((tile, tileIndex) => (tile.n === n ? [tileIndex] : [])),
  };
});

export function TilesSheet({
  state,
  select,
  close,
}: {
  state: PublicState;
  select: (index: number) => void;
  close: () => void;
}) {
  const s = useStrings();
  return (
    <InfoDialog title={s.tileList} close={close}>
      {(state.settings.topic === 'polygons'
        ? propertyGroups
        : [{ n: 0, indices: propertyGroups.flatMap(({ indices }) => indices) }]
      ).map(({ n, indices }) => (
        <section className="tile-group" key={n}>
          {n > 0 && <h3>{propertyName(s, 'polygons', n, indices[0])}</h3>}
          {indices.map((index) => {
            const tile = TILES[index];
            const owner = state.players.find((player) => player.id === state.owners[index]);
            return (
              <button
                type="button"
                className="property-row"
                key={index}
                onClick={() => select(index)}
              >
                <TopicArt
                  topic={state.settings.topic}
                  sides={tile.n}
                  index={index}
                  ownerColor={owner?.color}
                  label
                />
                <span className="property-row-title">
                  {propertyName(s, state.settings.topic, tile.n!, index)}{' '}
                  <small>#{index + 1}</small>
                </span>
                <span className="row-prices money">
                  {s.price} {s.money(tile.price!)} · {s.rent}{' '}
                  {s.money(tileRent(index, state.upgrades))}
                </span>
                <Owner player={owner} />
              </button>
            );
          })}
        </section>
      ))}
    </InfoDialog>
  );
}

export function CurrentTile({
  state,
  dice,
  you,
}: {
  state: PublicState;
  dice?: [number, number];
  you?: string;
}) {
  const s = useStrings();
  const index = state.players[state.turn].pos;
  const tile = TILES[index];
  const owner = state.players.find((player) => player.id === state.owners[index]);
  const latest = state.events.at(-1);

  return (
    <div className="table-center">
      <div className="landing-card" key={index}>
        {tile.kind === 'property' ? (
          <>
            <TopicArt
              topic={state.settings.topic}
              sides={tile.n}
              index={index}
              ownerColor={owner?.color}
            />
            <div>
              <h2>{propertyName(s, state.settings.topic, tile.n!, index)}</h2>
              <p className="money">
                {s.price} {s.money(tile.price!)} · {s.rent}{' '}
                {s.money(tileRent(index, state.upgrades))}
              </p>
              <p className="landing-owner">
                <Owner player={owner} />
              </p>
            </div>
          </>
        ) : (
          <>
            <TileIcon kind={tile.kind} />
            <div>
              <h2>{s.tileNames[tile.kind]}</h2>
              <p>
                {tile.kind === 'rest' && state.settings.restChallenges
                  ? s.classroom.restTile
                  : s.tileDescriptions[tile.kind]}
              </p>
            </div>
          </>
        )}
      </div>
      {dice && <p className="roll-total">{s.diceSum(dice[0] + dice[1])}</p>}
      {latest && <p className="latest-log">{describeEvent(s, latest, state, you).text}</p>}
    </div>
  );
}
