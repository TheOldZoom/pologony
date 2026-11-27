import { isGameSettings, type GameSettings } from '../../../../shared/game';

const hostSettingsKey = 'pologony-host-settings';

export function rememberHostSettings(settings: GameSettings) {
  try {
    localStorage.setItem(hostSettingsKey, JSON.stringify(settings));
  } catch {}
}

export function lastHostSettings(): GameSettings | undefined {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(hostSettingsKey) ?? 'null');
    if (isGameSettings(saved)) return saved;
  } catch {}
}
