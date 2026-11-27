import {
  DEFAULT_SETTINGS,
  ROOM_MODES,
  isGameSettings,
  type ClientMsg,
  type GameSettings,
} from '../../shared/game';

type IncomingMessage = Exclude<ClientMsg, { t: 'avatar' }> | { t: 'avatar'; id: unknown };

function roomSettings(value: GameSettings): GameSettings {
  const {
    topic,
    matchMinutes,
    rollSeconds,
    questionSeconds,
    buySeconds,
    difficulty,
    botDifficulty,
    upgrades,
    restChallenges,
    bankruptcy,
  } = value;
  return {
    ...DEFAULT_SETTINGS,
    topic,
    matchMinutes,
    rollSeconds,
    questionSeconds,
    buySeconds,
    difficulty: difficulty ?? DEFAULT_SETTINGS.difficulty,
    botDifficulty: botDifficulty ?? DEFAULT_SETTINGS.botDifficulty,
    upgrades: upgrades ?? false,
    restChallenges: restChallenges ?? false,
    bankruptcy: bankruptcy ?? false,
  };
}

export function parseMessage(raw: unknown): IncomingMessage | undefined {
  if (typeof raw !== 'string' || raw.length > 1024) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || !('t' in parsed)) return;
  const version =
    'version' in parsed &&
    typeof parsed.version === 'number' &&
    Number.isSafeInteger(parsed.version)
      ? parsed.version
      : undefined;

  switch (parsed.t) {
    case 'create':
    case 'join': {
      const name = 'name' in parsed && typeof parsed.name === 'string' ? parsed.name.trim() : '';
      if (parsed.t === 'create') {
        const mode = 'mode' in parsed && ROOM_MODES.find((candidate) => candidate === parsed.mode);
        const settings = 'settings' in parsed ? parsed.settings : undefined;
        if (mode && (settings === undefined || isGameSettings(settings)))
          return { t: 'create', name, mode, settings: settings && roomSettings(settings) };
        return;
      }
      if ('code' in parsed && typeof parsed.code === 'string') {
        return { t: 'join', code: parsed.code.trim().toUpperCase(), name };
      }
      return;
    }
    case 'watch':
      if ('code' in parsed && typeof parsed.code === 'string')
        return { t: 'watch', code: parsed.code.trim().toUpperCase() };
      return;
    case 'claimSeat':
      if ('name' in parsed && typeof parsed.name === 'string')
        return { t: 'claimSeat', name: parsed.name.trim() };
      return;
    case 'rejoin':
      if (
        'code' in parsed &&
        typeof parsed.code === 'string' &&
        'token' in parsed &&
        typeof parsed.token === 'string'
      ) {
        return { t: 'rejoin', code: parsed.code, token: parsed.token };
      }
      return;
    case 'avatar':
      return { t: 'avatar', id: 'id' in parsed ? parsed.id : undefined };
    case 'settings':
      if ('settings' in parsed && isGameSettings(parsed.settings))
        return { t: 'settings', settings: roomSettings(parsed.settings) };
      return;
    case 'remove':
      if ('player' in parsed && typeof parsed.player === 'string')
        return { t: 'remove', player: parsed.player };
      return;
    case 'answer':
      if (
        version !== undefined &&
        'index' in parsed &&
        typeof parsed.index === 'number' &&
        Number.isSafeInteger(parsed.index) &&
        parsed.index >= 0
      ) {
        return { t: 'answer', index: parsed.index, version };
      }
      return;
    case 'start':
    case 'leave':
    case 'pauseVote':
    case 'resume':
      return { t: parsed.t };
    case 'roll':
    case 'buy':
    case 'skip':
    case 'skipTurn':
    case 'applyTimeout':
    case 'rematch':
    case 'hint':
      if (version !== undefined) return { t: parsed.t, version };
  }
}
