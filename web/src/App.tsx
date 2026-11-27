import { useEffect, useRef, useState, type ReactNode } from 'react';
import { topicTheme, type Language } from '../../shared/game';
import { LanguageContext, useStrings, strings as wireStrings, type Strings } from './i18n/strings';
import { invitedRoomCode, useConnection } from './network/useConnection';
import { ExitConfirmation } from './components/RoomControls';
import { Lobby } from './features/lobby/Lobby';
import { type ReviewPanel, Results } from './features/results/Results';
import { HomeFooter } from './features/lobby/HomeFooter';
import { ToastStack } from './components/EventMessages';
import { HowTo } from './components/HowTo';
import { Game } from './features/game/Game';
import { MatchReviewDialog } from './features/results/MatchReviewDialog';
import { rememberHostSettings } from './features/lobby/hostSettings';
import { Home } from './features/lobby/Home';

const languageKey = 'pologony-language';

function detectLanguage(): Language {
  for (const locale of [...(navigator.languages ?? []), navigator.language]) {
    const primary = locale.toLowerCase().split(/[-_]/, 1)[0];
    if (primary === 'en' || primary === 'es') return primary;
  }
  return 'en';
}

export default function App() {
  const [preferredLanguage, setPreferredLanguage] = useState<Language | undefined>(() => {
    try {
      const saved = localStorage.getItem(languageKey);
      if (saved === 'en' || saved === 'es') return saved;
    } catch {}
  });
  const [browserLanguage, setBrowserLanguage] = useState(detectLanguage);
  const language = preferredLanguage ?? browserLanguage;

  function changeLanguage(next: Language) {
    setPreferredLanguage(next);
    try {
      localStorage.setItem(languageKey, next);
    } catch {}
  }

  useEffect(() => {
    document.documentElement.lang = language === 'es' ? 'es-CR' : 'en';
  }, [language]);

  useEffect(() => {
    if (preferredLanguage) return;
    const detect = () => setBrowserLanguage(detectLanguage());
    window.addEventListener('languagechange', detect);
    return () => window.removeEventListener('languagechange', detect);
  }, [preferredLanguage]);

  return (
    <LanguageContext.Provider value={{ language, changeLanguage }}>
      <Pologony />
    </LanguageContext.Provider>
  );
}

function Pologony() {
  const s = useStrings();
  const { snapshot, you, send, ready, retrying, error, leaving, backHome, toasts } =
    useConnection();
  const state = snapshot?.state;
  const [tutorial, setTutorial] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [reviewPanel, setReviewPanel] = useState<ReviewPanel>();
  const tutorialSeen = useRef(false);
  const presenter = state?.mode === 'projector' && state?.hostId === you;
  const playing = Boolean(state && state.phase !== 'lobby' && state.phase !== 'over');
  const myTurn = playing && state?.players[state.turn].id === you;
  const showExit = Boolean(exitOpen && state && state.phase !== 'over');
  const openExit = () => setExitOpen(true);
  const leave = () => send({ t: 'leave' });
  const canReview = Boolean(state?.matchReview);

  useEffect(() => {
    if (state?.phase === 'lobby' && state.hostId === you) rememberHostSettings(state.settings);
  }, [state?.phase, state?.hostId, state?.settings, you]);

  useEffect(() => {
    if (!canReview) setReviewPanel(undefined);
  }, [canReview]);
  const errorKey = (Object.keys(wireStrings.error) as (keyof Strings['error'])[]).find(
    (key) => wireStrings.error[key] === error,
  );
  const localizedError =
    error === wireStrings.sessionEnded ? s.sessionEnded : errorKey ? s.error[errorKey] : error;
  const status = localizedError || (retrying ? s.reconnecting : !ready ? s.connecting : '');

  useEffect(() => {
    if (!state || state.phase === 'over') {
      setTutorial(false);
      setExitOpen(false);
    }
  }, [state?.phase]);

  useEffect(() => {
    if (state?.phase !== 'lobby' || state.watching || tutorialSeen.current) return;
    tutorialSeen.current = true;
    try {
      if (localStorage.getItem('seenHowTo')) return;
      localStorage.setItem('seenHowTo', '1');
    } catch {}
    setTutorial(true);
  }, [state?.phase]);

  useEffect(() => {
    document.title = myTurn ? s.turnTitle : s.title;
  }, [myTurn, s.title, s.turnTitle]);

  useEffect(() => {
    if (myTurn) navigator.vibrate?.(200);
  }, [myTurn]);

  let screen: ReactNode;
  if (!snapshot) {
    screen = (
      <div className="home-shell">
        <Home ready={ready} send={send} invite={invitedRoomCode()} backHome={backHome} />
        <HomeFooter />
      </div>
    );
  } else if (snapshot.state.phase === 'lobby') {
    screen = (
      <Lobby
        state={snapshot.state}
        you={you}
        ready={ready}
        send={send}
        openExit={openExit}
        openHowTo={() => setTutorial(true)}
        openReview={setReviewPanel}
      />
    );
  } else if (snapshot.state.phase === 'over') {
    screen = (
      <Results
        state={snapshot.state}
        home={leave}
        ready={ready}
        leaving={leaving}
        presenter={presenter}
        personal={snapshot.state.players.some((player) => player.id === you)}
        openReview={setReviewPanel}
        rematch={
          snapshot.state.hostId === you && !snapshot.state.endedByHost
            ? () => send({ t: 'rematch', version: snapshot.state.version })
            : undefined
        }
      />
    );
  } else {
    screen = (
      <Game
        snapshot={snapshot}
        you={you}
        ready={ready}
        error={localizedError}
        send={send}
        openExit={openExit}
        toasts={toasts}
        openHowTo={() => setTutorial(true)}
      />
    );
  }

  return (
    <div
      className={`app${presenter ? ' presenter' : ''}`}
      data-topic={topicTheme(state?.settings.topic ?? 'polygons')}
    >
      <div className={`screen${playing ? ' playing' : ''}`}>
        {screen}
        {reviewPanel && state?.matchReview && (
          <MatchReviewDialog
            panel={reviewPanel}
            review={state.matchReview}
            close={() => setReviewPanel(undefined)}
          />
        )}
        {!playing && state && toasts.length > 0 && (
          <div className="lobby-feedback">
            <ToastStack toasts={toasts} state={state} you={you} />
          </div>
        )}
        {tutorial && state && (
          <HowTo close={() => setTutorial(false)} topic={state.settings.topic} />
        )}
        {showExit && state && (
          <ExitConfirmation
            state={state}
            you={you}
            ready={ready}
            leaving={leaving}
            status={status}
            close={() => setExitOpen(false)}
            confirm={leave}
          />
        )}
        {status && !showExit && (
          <div className="status" role="status">
            {status}
          </div>
        )}
      </div>
      <p className="rotate-message">{s.rotate}</p>
    </div>
  );
}
