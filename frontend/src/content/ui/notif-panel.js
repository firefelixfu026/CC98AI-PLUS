// ============================================================
// 通知 Tab：通知历史列表（含匹配原因、投递状态）
// ============================================================
import { listNotifications } from '../lib/backend-api.js';
import { getEmail, isLoggedIn } from '../lib/auth.js';
import { STORAGE_KEYS } from '../../shared/constants.js';
import { updateBadge } from './floating-btn.js';
import { esc, toast, fmtTime, deliveryStatusText, deliveryStatusColor } from '../lib/html-utils.js';

const CACHE_TTL_MS = 60_000;

export async function renderNotifications(body) {
  if (!(await isLoggedIn())) {
    body.innerHTML = `
      <div class="cc98-empty">
        <div class="cc98-empty-icon">🔔</div>
        <div class="cc98-empty-title">请先登录</div>
        <div class="cc98-empty-sub">到「⚙️ 设置」用浙大邮箱登录后查看通知</div>
      </div>`;
    return;
  }

  body.innerHTML = `<div class="cc98-loading"><span class="cc98-spin"></span>加载中…</div>`;
  try {
    await refresh(body, false);
  } catch (e) {
    body.innerHTML = `<div class="cc98-error"><div class="cc98-error-head">${esc(e.message || '加载失败')}</div></div>`;
  }
}

async function readCache() {
  const email = await getEmail();
  const stored = await chrome.storage.local.get(STORAGE_KEYS.NOTIFICATION_CACHE);
  const cache = stored && stored[STORAGE_KEYS.NOTIFICATION_CACHE];
  if (!cache || cache.email !== email || !Array.isArray(cache.items)) return null;
  return cache;
}

async function writeCache(items) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.NOTIFICATION_CACHE]: {
      email: await getEmail(),
      fetchedAt: Date.now(),
      items,
    },
  });
}

async function loadNotifications(force) {
  const cache = await readCache();
  const fresh = cache && Date.now() - Number(cache.fetchedAt || 0) < CACHE_TTL_MS;
  if (!force && fresh) return { list: cache.items, cached: true };

  try {
    const list = await listNotifications();
    await writeCache(list);
    return { list, cached: false };
  } catch (error) {
    // 服务端限流时继续展示上次成功结果，不把整页替换成红色错误框。
    if (error && error.status === 429 && cache) return { list: cache.items, cached: true, limited: true };
    throw error;
  }
}

async function refresh(body, force) {
  const result = await loadNotifications(force);
  const list = result.list;
  updateBadge(list.filter((n) => !n.is_read).length);

  body.innerHTML = `
    <div class="cc98-panel-actions">
      <button id="cc98-refresh-notif" class="cc98-secondary" type="button">刷新通知列表</button>
    </div>
    <div class="cc98-setting-help" style="margin-bottom:12px">服务器每 10 分钟自动检查新帖，无需手动扫描。</div>
    <div id="cc98-notif-list"></div>`;

  const listEl = body.querySelector('#cc98-notif-list');
  if (!list.length) {
    listEl.innerHTML = `<div class="cc98-empty"><div class="cc98-empty-icon">📭</div><div class="cc98-empty-sub">暂无通知，后端会定时检查新帖</div></div>`;
  } else {
    listEl.innerHTML = list
      .map((n) => `
        <div class="cc98-notif">
          <div class="nt">
            <a href="${esc(n.topic_url || '#')}" target="_blank" rel="noopener">${esc(n.topic_title || '(无标题)')}</a>
          </div>
          ${n.matched_reason ? `<div class="nm">🎯 ${esc(n.matched_reason)}</div>` : ''}
          <div class="nm" style="display:flex;align-items:center;gap:6px">
            <span style="color:${deliveryStatusColor(n.delivery_status)}">● ${esc(deliveryStatusText(n.delivery_status))}</span>
            <span>·</span><span>${esc(fmtTime(n.created_at))}</span>
          </div>
        </div>`)
      .join('');
  }

  const refreshBtn = body.querySelector('#cc98-refresh-notif');
  refreshBtn.addEventListener('click', async () => {
    const cache = await readCache();
    const remaining = cache ? CACHE_TTL_MS - (Date.now() - Number(cache.fetchedAt || 0)) : 0;
    if (remaining > 0) {
      toast(`刚刚刷新过，请 ${Math.ceil(remaining / 1000)} 秒后再试`);
      return;
    }
    refreshBtn.disabled = true;
    refreshBtn.textContent = '刷新中…';
    try {
      await refresh(body, true);
      toast('通知列表已刷新');
    } catch (e) {
      toast(e.message || '刷新失败');
      refreshBtn.disabled = false;
      refreshBtn.textContent = '刷新通知列表';
    }
  });

  if (result.limited) toast('已显示上次获取的通知，稍后会自动恢复刷新');
}
