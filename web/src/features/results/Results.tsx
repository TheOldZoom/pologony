import { type PublicState } from '../../../../shared/game';
import { useStrings } from '../../i18n/strings';
import { FullscreenButton } from '../../components/RoomControls';
import { PlayerToken } from '../../components/PlayerToken';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import { TopicArt } from '../game/board/TopicArt';

export type ReviewPanel = 'answers' | 'recap';

export function Results({
  state,
  home,
  ready,
  leaving,
  presenter,
  rematch,
  personal,
  openReview,
}: {
  state: PublicState;
  home: () => void;
  ready: boolean;
  leaving: boolean;
  presenter: boolean;
  rematch?: () => void;
  personal: boolean;
  openReview: (panel: ReviewPanel) => void;
}) {
  const s = useStrings();
  const ranked = state.standings ?? [];
  const winners = ranked
    .filter(({ worth }) => worth === ranked[0]?.worth)
    .map(({ player }) => player.name);

  return (
    <main className="results entrance">
      <LanguagePicker />
      <section className="room-ticket">
        <p className="topic-caption">
          <TopicArt topic={state.settings.topic} />
          {s.gameOver} · {s.topics[state.settings.topic]}
        </p>
        <h1>
          {winners.length === 0
            ? s.gameOver
            : winners.length === 1
              ? s.winner(winners[0])
              : s.tied(winners)}
        </h1>
        {state.endedByHost && <p>{s.sessionEnded}</p>}
      </section>
      <h2 className="section-label">{s.netWorth}</h2>
      <ol className="player-list ranking">
        {ranked.map(({ player, worth }) => (
          <li key={player.id}>
            <span className="rank">{ranked.findIndex((entry) => entry.worth === worth) + 1}</span>
            <PlayerToken player={player} />
            <span className="player-name">{player.name}</span>
            <strong>{s.money(worth)}</strong>
          </li>
        ))}
        {state.players
          .filter(({ eliminated }) => eliminated)
          .map((player) => (
            <li key={player.id} className="eliminated-row">
              <PlayerToken player={player} />
              <span className="player-name">{player.name}</span>
              <span>{s.classroom.eliminated}</span>
            </li>
          ))}
      </ol>
      {presenter && <FullscreenButton />}
      <div className="results-actions">
        {state.matchReview && <ReviewButtons personal={personal} open={openReview} />}
        <div className="results-action-row">
          {rematch && (
            <button className="action primary" onClick={rematch} disabled={!ready || leaving}>
              {s.rematch}
            </button>
          )}
          <button
            className={rematch ? 'action secondary' : 'action primary'}
            onClick={home}
            disabled={!ready || leaving}
          >
            {leaving ? s.leaving : s.backHome}
          </button>
        </div>
      </div>
    </main>
  );
}

export function ReviewButtons({
  personal,
  open,
}: {
  personal: boolean;
  open: (panel: ReviewPanel) => void;
}) {
  const s = useStrings();
  return (
    <div className="results-action-row">
      {personal && (
        <button className="action secondary" onClick={() => open('answers')}>
          {s.matchReview.answers}
        </button>
      )}
      <button className="action secondary" onClick={() => open('recap')}>
        {s.matchReview.recap}
      </button>
    </div>
  );
}
