import { useEffect, useRef, useState } from 'react';
import { TILES } from '../../../../shared/game';
import { type Snapshot } from '../../network/useConnection';

export function useGameMotion({ state, connection }: Snapshot) {
  const previous = useRef({ state, connection });
  const [positions, setPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.players.map(({ id, pos }) => [id, pos])),
  );
  const queues = useRef<Record<string, { pos: number; landing?: number }[]>>({});
  const [dice, setDice] = useState(state.dice);
  const [tumbling, setTumbling] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cashChanges, setCashChanges] = useState<Record<string, { delta: number; id: number }>>({});
  const animationId = useRef(0);
  const [landings, setLandings] = useState<Record<number, number>>({});
  const [stamps, setStamps] = useState<Record<number, number>>({});
  const diceTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const diceEnd = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const movementTimer = setInterval(() => {
      const steps: Record<string, number> = {};
      const landed: Record<number, number> = {};
      for (const [id, queue] of Object.entries(queues.current)) {
        const step = queue.shift();
        if (step) {
          steps[id] = step.pos;
          if (step.landing !== undefined) landed[step.pos] = step.landing;
        }
        if (!queue.length) delete queues.current[id];
      }
      if (Object.keys(landed).length) setLandings((shown) => ({ ...shown, ...landed }));
      if (Object.keys(steps).length) setPositions((shown) => ({ ...shown, ...steps }));
      else setMoving(false);
    }, 150);
    return () => {
      clearInterval(movementTimer);
      clearInterval(diceTimer.current);
      clearTimeout(diceEnd.current);
    };
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = { state, connection };
    if (before.connection !== connection) {
      queues.current = {};
      setMoving(false);
      clearInterval(diceTimer.current);
      clearTimeout(diceEnd.current);
      setPositions(Object.fromEntries(state.players.map(({ id, pos }) => [id, pos])));
      setTumbling(false);
      setDice(state.dice);
      setLandings({});
      setStamps({});
      setCashChanges({});
      return;
    }
    const newEvents = state.events.filter(({ id }) => id > (before.state.events.at(-1)?.id ?? 0));
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cursors = Object.fromEntries(before.state.players.map(({ id, pos }) => [id, pos]));
    const purchased: Record<number, number> = {};
    const changes: typeof cashChanges = {};
    let rolled = false;

    for (const event of newEvents) {
      if (event.kind === 'buy' || event.kind === 'upgraded') purchased[event.tile] = event.id;
      if (event.kind !== 'roll') continue;
      const from = cursors[event.player];
      if (from === undefined) continue;
      const distance = event.dice[0] + event.dice[1];
      const landing = (from + distance) % TILES.length;
      cursors[event.player] = landing;
      rolled = true;
      if (!reduceMotion) {
        const queue = (queues.current[event.player] ??= []);
        for (let step = 1; step <= distance; step += 1) {
          queue.push({
            pos: (from + step) % TILES.length,
            landing: step === distance ? event.id : undefined,
          });
        }
      }
    }
    const snapped: Record<string, number> = {};
    for (const player of state.players) {
      const old = before.state.players.find(({ id }) => id === player.id);
      if (reduceMotion || !old || cursors[player.id] !== player.pos) {
        delete queues.current[player.id];
        snapped[player.id] = player.pos;
      }
      if (old && player.cash !== old.cash) {
        changes[player.id] = {
          delta: player.cash - old.cash,
          id: ++animationId.current,
        };
      }
    }
    if (Object.keys(snapped).length) setPositions((shown) => ({ ...shown, ...snapped }));
    if (Object.keys(purchased).length) setStamps((shown) => ({ ...shown, ...purchased }));
    if (Object.keys(changes).length) setCashChanges((shown) => ({ ...shown, ...changes }));

    if (rolled && state.dice) {
      if (Object.keys(queues.current).length) setMoving(true);
      clearInterval(diceTimer.current);
      clearTimeout(diceEnd.current);
      if (reduceMotion) {
        setDice(state.dice);
        setTumbling(false);
      } else {
        const randomFaces = () =>
          setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
        setTumbling(true);
        randomFaces();
        diceTimer.current = setInterval(randomFaces, 75);
        diceEnd.current = setTimeout(() => {
          clearInterval(diceTimer.current);
          setDice(state.dice);
          setTumbling(false);
        }, 600);
      }
    }
  }, [state, connection]);

  return { positions, dice, tumbling, moving, cashChanges, landings, stamps };
}
