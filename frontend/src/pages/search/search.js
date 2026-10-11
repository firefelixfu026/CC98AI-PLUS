import { injectStyles } from '../../content/ui/styles.js';
import { renderSearchPanel } from '../../content/ui/search-panel.js';
import { startStoredThemePaletteSync } from '../../shared/theme-palette.js';

injectStyles();
if (globalThis.chrome && chrome.storage) startStoredThemePaletteSync();

renderSearchPanel(document.getElementById('searchBody'), { fullPage: true });

document.getElementById('openCC98').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.cc98.org' });
});

document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
