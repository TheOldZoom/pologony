import { useState } from 'react';
import { type PublicState, type ClientMsg } from '../../../../shared/game';
import { InfoDialog } from '../../components/InfoDialog';
import { PlayerToken } from '../../components/PlayerToken';
import { useStrings } from '../../i18n/strings';

export function HostRoster({
  state,
  send,
  ready,
  close,
}: {
  state: PublicState;
  send: (message: ClientMsg) => boolean;
  ready: boolean;
  close: () => void;
}) {
  const s = useStrings();
  const [selected, select] = useState<string>();
  const player = state.players.find(({ id }) => id === selected);
  return (
    <InfoDialog title={s.managePlayers} close={close}>
      {player ? (
        <div className="remove-confirmation">
          <p>{s.confirmRemove(player.name)}</p>
          <button className="action secondary" onClick={() => select(undefined)}>
            {s.cancel}
          </button>
          <button
            className="action danger"
            disabled={!ready}
            onClick={() => {
              if (send({ t: 'remove', player: player.id })) select(undefined);
            }}
          >
            {s.removePlayer}
          </button>
        </div>
      ) : state.players.length ? (
        <ul className="player-list">
          {state.players.map((candidate) => (
            <li key={candidate.id}>
              <PlayerToken player={candidate} />
              <span className="player-name">{candidate.name}</span>
              {!candidate.connected && <span className="player-status">{s.offline}</span>}
              <button
                className="action secondary"
                disabled={!ready}
                onClick={() => select(candidate.id)}
                aria-label={s.removePlayerLabel(candidate.name)}
              >
                {s.remove}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{s.noPlayers}</p>
      )}
    </InfoDialog>
  );
}
