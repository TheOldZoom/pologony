import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { type PublicState } from '../../../shared/game';
import { useStrings } from '../i18n/strings';
import { inviteParam } from '../network/useConnection';
import { InfoDialog } from './InfoDialog';

export function ExitConfirmation({
  state,
  you,
  ready,
  leaving,
  status,
  close,
  confirm,
}: {
  state: PublicState;
  you?: string;
  ready: boolean;
  leaving: boolean;
  status: string;
  close: () => void;
  confirm: () => void;
}) {
  const s = useStrings();
  const lobby = state.phase === 'lobby';
  const host = you === state.hostId;
  const presenter = host && state.mode === 'projector';
  const remaining = state.players.filter(({ id }) => id !== you).length;
  const action = state.watching
    ? s.classroom.leaveSpectating
    : presenter
      ? s.endSession
      : lobby
        ? s.leaveRoom
        : s.leaveGame;
  const seat = lobby ? s.exit.freeSeat : s.exit.forfeit;
  let consequence = '';
  if (state.watching) {
    consequence = '';
  } else if (presenter) {
    consequence = lobby ? s.exit.closeProjector : s.exit.finishProjector;
  } else if (state.mode === 'practice') {
    consequence = s.exit.practice;
  } else if (state.mode === 'friends' && remaining === 0) {
    consequence = s.exit.lastPlayer;
  } else {
    if (state.mode === 'friends' && host) consequence = s.exit.handoff;
    if (!lobby && remaining === 1) consequence += `${consequence ? ' ' : ''}${s.exit.lastOpponent}`;
  }

  return (
    <InfoDialog title={s.exit.question(action)} close={close} dismissible={!leaving}>
      <div className="exit-confirmation">
        {!state.watching && !presenter && state.mode !== 'practice' && <p>{seat}</p>}
        {consequence && <p>{consequence}</p>}
        <div className="exit-actions">
          <button className="action secondary" onClick={close} disabled={leaving}>
            {s.cancel}
          </button>
          <button className="action danger" disabled={!ready || leaving} onClick={confirm}>
            {leaving ? s.leaving : action}
          </button>
        </div>
        {status && <p role="status">{status}</p>}
      </div>
    </InfoDialog>
  );
}

export function LobbyInvite({ code }: { code: string }) {
  const s = useStrings();
  const [expanded, setExpanded] = useState(false);
  const image = useMemo(() => {
    const url = new URL('/', location.origin);
    url.searchParams.set(inviteParam, code);
    const qr = qrcode(0, 'M');
    qr.addData(url.href);
    qr.make();
    return `data:image/svg+xml,${encodeURIComponent(qr.createSvgTag({ scalable: true }))}`;
  }, [code]);
  const alt = s.inviteQrAlt(code);

  return (
    <section className="room-ticket">
      <div>
        <h1>{s.code}</h1>
        <strong>{code}</strong>
        <p>{s.shareCode}</p>
      </div>
      <button
        type="button"
        className="lobby-qr"
        aria-label={s.expandInviteQr}
        onClick={() => setExpanded(true)}
      >
        <img src={image} alt={alt} width="104" height="104" />
      </button>
      {expanded && (
        <InfoDialog title={s.invitePlayers} close={() => setExpanded(false)}>
          <img className="invite-qr-large" src={image} alt={alt} width="256" height="256" />
          <p className="invite-qr-caption">{s.shareCode}</p>
        </InfoDialog>
      )}
    </section>
  );
}

export function FullscreenButton() {
  const s = useStrings();
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const label = active ? s.exitFullscreen : s.fullscreen;
  const Icon = active ? Minimize : Maximize;
  return (
    <div className="fullscreen-control">
      <button
        className="action secondary"
        aria-label={label}
        onClick={async () => {
          setFailed(false);
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
          } catch {
            setFailed(true);
          }
        }}
      >
        <span className="fullscreen-label">{label}</span>
        <Icon className="fullscreen-icon" size={20} aria-hidden="true" />
      </button>
      {failed && <span role="status">{s.noFullscreen}</span>}
    </div>
  );
}

export function RoomCode({ code }: { code: string }) {
  const s = useStrings();
  const [feedback, setFeedback] = useState('');
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);

  async function copy() {
    let copied = false;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(code);
        copied = true;
      } catch {}
    }
    if (!copied) {
      const input = document.createElement('textarea');
      const focus = document.activeElement;
      input.value = code;
      input.readOnly = true;
      input.className = 'clipboard-input';
      document.body.append(input);
      input.select();
      try {
        copied = document.execCommand('copy');
      } catch {}
      input.remove();
      if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
    }
    setFeedback(copied ? s.copied : s.copyFailed);
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setFeedback(''), 2000);
  }

  return (
    <span className="room-chip-wrap">
      <button className="action room-chip" aria-label={s.copyCode(code)} onClick={copy}>
        {code}
      </button>
      {feedback && (
        <span className="copy-feedback" role="status">
          {feedback}
        </span>
      )}
    </span>
  );
}
