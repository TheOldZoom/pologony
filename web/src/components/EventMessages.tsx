import { TILES, type GameEvent, type PublicState } from '../../../shared/game';
import { useStrings, type Strings } from '../i18n/strings';
import { type Toast } from '../network/useConnection';
import { PlayerToken } from './PlayerToken';
import { propertyName } from '../features/game/board/TopicArt';

export function describeEvent(s: Strings, event: GameEvent, state: PublicState, you?: string) {
  const player =
    'player' in event ? state.players.find(({ id }) => id === event.player) : undefined;
  const mine = player?.id === you && Boolean(player);
  const playerName = (id: string) =>
    state.players.find((candidate) => candidate.id === id)?.name ??
    state.events.find(
      (item): item is Extract<GameEvent, { kind: 'removed' }> =>
        item.kind === 'removed' && item.player === id,
    )?.name ??
    s.player;
  const p = mine ? s.you : 'player' in event ? playerName(event.player) : '';
  const property =
    'tile' in event
      ? propertyName(s, state.settings.topic, TILES[event.tile].n ?? 0, event.tile)
      : '';
  const amount = 'amount' in event ? s.money(Math.abs(event.amount)) : '';
  const eventText = s.events;
  let text: string;
  let tone = 'info';
  switch (event.kind) {
    case 'joined':
      text = eventText.joined(p);
      break;
    case 'left':
      text = eventText.left(p);
      break;
    case 'back':
      text = eventText.back(p, mine);
      break;
    case 'removed':
      text = eventText.removed(event.name, event.reason === 'voluntary');
      break;
    case 'turnSkipped':
      text = eventText.turnSkipped(p, mine);
      break;
    case 'started':
      text = eventText.started;
      tone = 'good';
      break;
    case 'rematch':
      text = eventText.rematch;
      break;
    case 'over':
      text = eventText.over;
      break;
    case 'oneMinute':
      text = eventText.oneMinute;
      break;
    case 'roll':
      text = eventText.roll(p, ...event.dice);
      break;
    case 'lap':
      text = eventText.lap(p, amount);
      tone = 'good';
      break;
    case 'question':
      text = eventText.question(
        p,
        mine,
        event.q === 'chance'
          ? s.tileNames.chance
          : state.settings.topic === 'polygons'
            ? event.mystery
              ? s.polygonTopic
              : property
            : s.topics[state.settings.topic],
      );
      break;
    case 'answer':
      text = event.timeout
        ? eventText.timeout(p)
        : event.correct
          ? eventText.correct(p)
          : eventText.wrong(p);
      tone = event.correct ? 'good' : 'bad';
      break;
    case 'buy':
      text = eventText.buy(p, property, amount);
      tone = 'good';
      break;
    case 'skip':
      text = eventText.skip(p, property);
      break;
    case 'cantAfford':
      text = eventText.cantAfford(p, property);
      tone = 'bad';
      break;
    case 'rent': {
      const payee = event.to === you ? s.you : playerName(event.to);
      text = eventText.rent(p, amount, payee, event.half);
      tone = event.to === you ? 'good' : 'bad';
      break;
    }
    case 'tax':
      text = eventText.tax(p, amount);
      tone = 'bad';
      break;
    case 'chance':
      text = eventText.chance(p, amount, event.amount > 0);
      tone = event.amount > 0 ? 'good' : 'bad';
      break;
    case 'rest':
      text = eventText.rest(p, mine);
      break;
    case 'upgraded':
      text = s.classroom.upgradedEvent(p, property);
      tone = 'good';
      break;
    case 'streak':
      text = s.classroom.streakEvent(p, amount);
      tone = 'good';
      break;
    case 'bankrupt':
      text = s.classroom.bankruptEvent(p, event.to ? playerName(event.to) : undefined);
      tone = 'bad';
      break;
    case 'paused':
      text = s.classroom.paused;
      break;
    case 'resumed':
      text = s.classroom.resumed;
      break;
  }
  return { text, tone, player };
}

export function EventMessage({
  event,
  state,
  you,
}: {
  event: GameEvent;
  state: PublicState;
  you?: string;
}) {
  const s = useStrings();
  const { text, tone, player } = describeEvent(s, event, state, you);
  return (
    <li className={`event-message event-${tone}`}>
      {player && <PlayerToken player={player} size={16} />}
      <span>{text}</span>
    </li>
  );
}

export function ToastStack({
  toasts,
  state,
  you,
}: {
  toasts: Toast[];
  state: PublicState;
  you?: string;
}) {
  return (
    <ul className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map(({ event }) => (
        <EventMessage key={event.id} event={event} state={state} you={you} />
      ))}
    </ul>
  );
}
