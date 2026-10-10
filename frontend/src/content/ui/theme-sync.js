// ============================================================
// CC98 主题同步
//   CC98 通过替换 #mainStylesheet 的 href 切换皮肤。这里直接读取页面
//   当前生效的颜色生成插件调色板，因此不需要维护主题编号或颜色清单。
// ============================================================

const THEME_STYLE_ID = 'cc98-ai-theme-vars';
const THEME_STORAGE_KEY = 'cc98ThemePalette';
const DEFAULT_ACCENT = { r: 47, g: 139, b: 171, a: 1 };
const DEFAULT_LIGHT = { r: 255, g: 255, b: 255, a: 1 };
const DEFAULT_DARK = { r: 16, g: 26, b: 31, a: 1 };

let started = false;
let scheduled = 0;
let lastSignature = '';
let watchedStylesheet = null;
let stylesheetObserver = null;

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

export function parseCssColor(value) {
  const input = String(value || '').trim().toLowerCase();
  if (!input || input === 'transparent') return null;

  const rgb = input.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  if (rgb) {
    return {
      r: clamp(Number(rgb[1])),
      g: clamp(Number(rgb[2])),
      b: clamp(Number(rgb[3])),
      a: rgb[4] == null ? 1 : clamp(Number(rgb[4]), 0, 1),
    };
  }

  const hex = input.match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!hex) return null;
  let raw = hex[1];
  if (raw.length === 3) raw = raw.split('').map((char) => char + char).join('');
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
    a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
  };
}

function toCss(color, alpha = color.a ?? 1) {
  const r = Math.round(clamp(color.r));
  const g = Math.round(clamp(color.g));
  const b = Math.round(clamp(color.b));
  if (alpha < 1) return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  return `rgb(${r}, ${g}, ${b})`;
}

function mix(first, second, secondWeight) {
  const weight = Math.max(0, Math.min(1, secondWeight));
  return {
    r: first.r * (1 - weight) + second.r * weight,
    g: first.g * (1 - weight) + second.g * weight,
    b: first.b * (1 - weight) + second.b * weight,
    a: 1,
  };
}

function luminance(color) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function chroma(color) {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function readableAccent(accent, background, dark) {
  if (contrast(accent, background) >= 4.2) return accent;
  const target = dark ? DEFAULT_LIGHT : { r: 0, g: 0, b: 0, a: 1 };
  let candidate = accent;
  for (let weight = 0.12; weight <= 0.72; weight += 0.1) {
    candidate = mix(accent, target, weight);
    if (contrast(candidate, background) >= 4.2) return candidate;
  }
  return candidate;
}

export function buildThemePalette({ surface, text, accent }) {
  const baseSurface = surface || DEFAULT_LIGHT;
  const dark = luminance(baseSurface) < 0.32;
  const edge = dark ? DEFAULT_DARK : DEFAULT_LIGHT;
  const background = mix(baseSurface, edge, dark ? 0.12 : 0.08);
  const fallbackText = dark ? { r: 238, g: 245, b: 248, a: 1 } : { r: 24, g: 38, b: 45, a: 1 };
  const primaryText = text && contrast(text, background) >= 4.5 ? text : fallbackText;
  const siteAccent = accent || DEFAULT_ACCENT;
  const linkAccent = readableAccent(siteAccent, background, dark);
  const onAccent = contrast(DEFAULT_LIGHT, siteAccent) >= contrast(DEFAULT_DARK, siteAccent)
    ? DEFAULT_LIGHT
    : DEFAULT_DARK;

  return {
    mode: dark ? 'dark' : 'light',
    values: {
      '--cc98-pri': toCss(linkAccent),
      '--cc98-pri-h': toCss(mix(linkAccent, primaryText, 0.18)),
      '--cc98-pri-fill': toCss(siteAccent),
      '--cc98-pri-fill-h': toCss(mix(siteAccent, onAccent, 0.14)),
      '--cc98-pri-soft': toCss(mix(background, siteAccent, dark ? 0.15 : 0.09)),
      '--cc98-pri-bd': toCss(mix(background, siteAccent, dark ? 0.34 : 0.27)),
      '--cc98-on-pri': toCss(onAccent),
      '--cc98-toast-bg': toCss(mix(background, primaryText, dark ? 0.18 : 0.88)),
      '--cc98-toast-tx': toCss(dark ? primaryText : background),
      '--cc98-bg': toCss(background),
      '--cc98-bg-sub': toCss(mix(background, siteAccent, dark ? 0.08 : 0.045)),
      '--cc98-txt': toCss(primaryText),
      '--cc98-txt2': toCss(mix(primaryText, background, 0.34)),
      '--cc98-txt3': toCss(mix(primaryText, background, 0.48)),
      '--cc98-bd': toCss(mix(background, primaryText, dark ? 0.18 : 0.13)),
      '--cc98-bd-soft': toCss(mix(background, primaryText, dark ? 0.11 : 0.075)),
      '--cc98-sh': dark
        ? '0 12px 42px rgba(0, 0, 0, .48), 0 2px 9px rgba(0, 0, 0, .28)'
        : `0 12px 38px ${toCss(siteAccent, 0.16)}, 0 2px 9px rgba(20, 38, 46, .07)`,
      '--cc98-sh-btn': `0 5px 16px ${toCss(siteAccent, dark ? 0.34 : 0.3)}`,
    },
  };
}

function isPluginElement(element) {
  return !!element?.closest?.('#cc98-ai-panel, #cc98-ai-float-btn, .cc98-toast');
}

function elementBackground(element) {
  let current = element;
  while (current && current !== document) {
    if (!isPluginElement(current)) {
      const color = parseCssColor(getComputedStyle(current).backgroundColor);
      if (color && color.a >= 0.82) return color;
    }
    current = current.parentElement;
  }
  return null;
}

function sampleSurface() {
  const points = [[0.5, 0.58], [0.28, 0.58], [0.72, 0.58]];
  const colors = points
    .map(([x, y]) => elementBackground(document.elementFromPoint(innerWidth * x, innerHeight * y)))
    .filter(Boolean);
  if (colors.length) {
    colors.sort((a, b) => chroma(a) - chroma(b));
    return colors[0];
  }
  return elementBackground(document.body) || elementBackground(document.documentElement) || DEFAULT_LIGHT;
}

function accentCandidates() {
  const elements = [];
  const add = (element) => {
    if (element && !isPluginElement(element) && !elements.includes(element)) elements.push(element);
  };
  for (const selector of ['#header', '.header', '.site-header', '.header-wrapper', '.top-nav', 'header', 'nav']) {
    document.querySelectorAll(selector).forEach(add);
  }
  for (const y of [18, 48, 78, 112, 150]) {
    let current = document.elementFromPoint(innerWidth / 2, y);
    while (current && current !== document.body) {
      add(current);
      current = current.parentElement;
    }
  }
  let fallbackCount = 0;
  for (const element of document.querySelectorAll('a, button')) {
    add(element);
    fallbackCount += 1;
    if (fallbackCount >= 40) break;
  }
  return elements;
}

function sampleAccent() {
  let best = null;
  let bestScore = 0;
  for (const element of accentCandidates()) {
    const style = getComputedStyle(element);
    const colors = [
      [style.backgroundColor, 100],
      [style.borderTopColor, 35],
      [style.color, 0],
    ];
    for (const [value, propertyBonus] of colors) {
      const color = parseCssColor(value);
      if (!color || color.a < 0.75) continue;
      const spread = chroma(color);
      const brightness = luminance(color);
      if (spread < 24 || brightness < 0.025 || brightness > 0.94) continue;
      const rect = element.getBoundingClientRect();
      const nearTop = rect.top < Math.min(innerHeight * 0.35, 260) ? 35 : 0;
      const broad = rect.width > innerWidth * 0.45 ? 25 : 0;
      const score = spread + nearTop + broad + propertyBonus;
      if (score > bestScore) {
        best = color;
        bestScore = score;
      }
    }
  }
  return best || DEFAULT_ACCENT;
}

function sampleText(surface) {
  const bodyColor = parseCssColor(getComputedStyle(document.body).color);
  if (bodyColor && contrast(bodyColor, surface) >= 4.5) return bodyColor;
  return luminance(surface) < 0.32 ? DEFAULT_LIGHT : DEFAULT_DARK;
}

function themeSignature(surface, accent) {
  const stylesheet = document.getElementById('mainStylesheet');
  return [
    stylesheet?.getAttribute('href') || '',
    Math.round(surface.r), Math.round(surface.g), Math.round(surface.b),
    Math.round(accent.r), Math.round(accent.g), Math.round(accent.b),
  ].join('|');
}

function applyPalette(palette) {
  let style = document.getElementById(THEME_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = THEME_STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  const declarations = Object.entries(palette.values)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  style.textContent = `:root{${declarations}}#cc98-ai-panel{color-scheme:${palette.mode}}`;
  document.documentElement.dataset.cc98AiTheme = palette.mode;
  try {
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: palette }).catch(() => {});
  } catch (_) { /* extension context may be shutting down */ }
}

export function refreshCC98Theme(force = false) {
  if (!document.body) return;
  const surface = sampleSurface();
  const accent = sampleAccent();
  const signature = themeSignature(surface, accent);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  applyPalette(buildThemePalette({ surface, text: sampleText(surface), accent }));
}

function scheduleRefresh() {
  window.clearTimeout(scheduled);
  scheduled = window.setTimeout(() => refreshCC98Theme(true), 80);
  window.setTimeout(() => refreshCC98Theme(true), 320);
}

function watchMainStylesheet() {
  const link = document.getElementById('mainStylesheet');
  if (link === watchedStylesheet) return;
  stylesheetObserver?.disconnect();
  watchedStylesheet = link;
  if (!link) return;
  link.addEventListener('load', scheduleRefresh);
  stylesheetObserver = new MutationObserver(scheduleRefresh);
  stylesheetObserver.observe(link, { attributes: true, attributeFilter: ['href'] });
}

export function startCC98ThemeSync() {
  if (started) return;
  started = true;
  watchMainStylesheet();
  refreshCC98Theme(true);

  const headObserver = new MutationObserver(() => {
    watchMainStylesheet();
    scheduleRefresh();
  });
  headObserver.observe(document.head || document.documentElement, { childList: true });

  const bodyObserver = new MutationObserver(scheduleRefresh);
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener?.('change', scheduleRefresh);

  window.setInterval(() => {
    watchMainStylesheet();
    refreshCC98Theme();
  }, 1500);
}
