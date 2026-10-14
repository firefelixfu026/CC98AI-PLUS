// ============================================================
// 后台 Service Worker：通用 fetch 代理 + 扩展页面跳转
//   所有跨域请求（CC98 API / LLM / 订阅服务）经这里转发，绕过 CORS
// ============================================================
import { MSG } from '../shared/constants.js';

const LEGACY_BADGE_ALARM = 'badge-poll';

// chrome.storage.session 默认只对「可信上下文」开放（不含内容脚本），
// 必须显式放开，否则内容脚本读写 CC98 凭证会被拒绝。
function allowSessionStorageInContentScripts() {
  try {
    chrome.storage.session
      .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
      .catch(() => {});
  } catch (e) { /* 老版本 Chrome 没有该 API，忽略 */ }
}

allowSessionStorageInContentScripts();

function clearLegacyBadgePolling() {
  chrome.alarms.clear(LEGACY_BADGE_ALARM).catch(() => {});
  chrome.action.setBadgeText({ text: '' });
}

// 旧版会每 5 分钟查询一次通知，并把缺少 is_read 的记录全部算作未读。
// 后端现已移除 is_read，加载新版时立即清理旧 alarm 和错误徽章。
clearLegacyBadgePolling();

// ---------- 安装 / 启动 ----------
chrome.runtime.onInstalled.addListener(() => {
  allowSessionStorageInContentScripts();
  clearLegacyBadgePolling();
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
});

chrome.runtime.onStartup.addListener(() => {
  allowSessionStorageInContentScripts();
  clearLegacyBadgePolling();
});

// ---------- 消息：通用 fetch 代理 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === MSG.FETCH) {
    handleFetch(msg.url, msg.options)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, status: 0, data: { detail: e && e.message ? e.message : String(e) } }));
    return true; // 保持异步 sendResponse 有效
  }
  if (msg && msg.type === MSG.OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
    return true;
  }
  if (msg && msg.type === MSG.OPEN_SEARCH) {
    chrome.tabs.create(
      { url: chrome.runtime.getURL('src/pages/search/search.html') },
      (tab) => {
        const error = chrome.runtime.lastError;
        if (error) {
          sendResponse({ ok: false, error: error.message || String(error) });
          return;
        }
        sendResponse({ ok: true, tabId: tab && tab.id });
      }
    );
    return true;
  }
  if (msg && msg.type === MSG.CLEAR_NOTIFICATION_BADGE) {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

async function handleFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || undefined,
      credentials: options.credentials || 'omit',
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text; // 非 JSON 响应，原样返回字符串
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { detail: e && e.message ? e.message : String(e) } };
  }
}
