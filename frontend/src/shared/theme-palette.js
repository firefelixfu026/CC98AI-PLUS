import { STORAGE_KEYS } from './constants.js';

const VARIABLE_MAP = {
  '--cc98-pri': ['--cc98-pri', '--pri'],
  '--cc98-pri-h': ['--cc98-pri-h', '--pri-h'],
  '--cc98-pri-fill': ['--cc98-pri-fill', '--pri-fill'],
  '--cc98-pri-fill-h': ['--cc98-pri-fill-h', '--pri-fill-h'],
  '--cc98-pri-soft': ['--cc98-pri-soft', '--pri-soft'],
  '--cc98-pri-bd': ['--cc98-pri-bd', '--pri-bd'],
  '--cc98-on-pri': ['--cc98-on-pri', '--on-pri'],
  '--cc98-bg': ['--cc98-bg', '--bg', '--card'],
  '--cc98-bg-sub': ['--cc98-bg-sub', '--bg-sub', '--page-bg'],
  '--cc98-txt': ['--cc98-txt', '--txt'],
  '--cc98-txt2': ['--cc98-txt2', '--txt2'],
  '--cc98-txt3': ['--cc98-txt3', '--txt3'],
  '--cc98-bd': ['--cc98-bd', '--bd'],
  '--cc98-bd-soft': ['--cc98-bd-soft', '--bd-soft'],
  '--cc98-sh': ['--cc98-sh', '--sh'],
};

export function applyStoredThemePalette(palette) {
  if (!palette || !palette.values) return;
  const root = document.documentElement;
  for (const [source, targets] of Object.entries(VARIABLE_MAP)) {
    const value = palette.values[source];
    if (!value) continue;
    targets.forEach((target) => root.style.setProperty(target, value));
  }
  if (palette.mode === 'light' || palette.mode === 'dark') {
    root.style.colorScheme = palette.mode;
  }
}

export async function startStoredThemePaletteSync() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.THEME_PALETTE);
    applyStoredThemePalette(stored[STORAGE_KEYS.THEME_PALETTE]);
  } catch (_) { /* keep CSS fallbacks */ }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEYS.THEME_PALETTE]) return;
    applyStoredThemePalette(changes[STORAGE_KEYS.THEME_PALETTE].newValue);
  });
}
