// ============================================================
// 设置页：LLM 配置 + 搜索预算 + 订阅通知渠道
// 扩展页拥有 host_permissions，可直接 fetch 跨域做连接测试
// ============================================================
import {
  LLM_DEFAULTS, STORAGE_KEYS, NOTIFY_INTERVAL_PRESETS, SEARCH_BUDGET_SCHEMA_VERSION,
} from '../../shared/constants.js';
import { startStoredThemePaletteSync } from '../../shared/theme-palette.js';
import { listChannels, saveChannel, testChannel } from '../../content/lib/backend-api.js';
import { getSearchBudget } from '../../content/lib/storage.js';

startStoredThemePaletteSync();

const $ = (id) => document.getElementById(id);
let dingChannel = null;
let mailChannel = null;

function setStatus(msg, isErr) {
  $('status').textContent = msg;
  // 用 CSS 变量而不是写死颜色，深色模式下才有足够对比度
  $('status').style.color = isErr ? 'var(--err)' : 'var(--ok)';
}

// 申请访问某个地址的权限：用户换了 LLM / 后端地址时动态授权。
// host_permissions 只默认放行了固定域名，其余按需弹出授权框。
async function ensureOriginPermission(baseUrl) {
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch (e) {
    return true; // 空 / 非法地址不申请，交给后续逻辑报错
  }
  const pattern = origin + '/*';
  try {
    const granted = await chrome.permissions.contains({ origins: [pattern] });
    if (granted) return true;
    return await chrome.permissions.request({ origins: [pattern] });
  } catch (e) {
    return false;
  }
}

// 滑块实时显示数值
function bindRange(id) {
  const el = $(id);
  const valEl = $(id + 'Val');
  el.addEventListener('input', () => { valEl.textContent = el.value; });
}

async function load() {
  const llm = (await chrome.storage.local.get(STORAGE_KEYS.LLM))[STORAGE_KEYS.LLM] || {};

  const L = { ...LLM_DEFAULTS, ...llm };
  const B = await getSearchBudget();
  $('provider').value = L.provider;
  $('baseUrl').value = L.baseUrl;
  $('model').value = L.model;
  $('apiKey').value = L.apiKey;
  $('temperature').value = L.temperature;
  $('maxTokens').value = L.maxTokens;
  $('temperatureVal').textContent = L.temperature;

  $('keywordCount').value = B.keywordCount;
  $('searchLimitPerKeyword').value = B.searchLimitPerKeyword;
  $('topicLimit').value = B.topicLimit;
  $('maxRepliesPerTopic').value = B.maxRepliesPerTopic;
  $('maxCharsPerReply').value = B.maxCharsPerReply;
  ['keywordCount', 'searchLimitPerKeyword', 'topicLimit', 'maxRepliesPerTopic', 'maxCharsPerReply'].forEach((id) => {
    $(id + 'Val').textContent = $(id).value;
  });

  await loadNotificationSettings();
}

async function save() {
  const baseUrl = $('baseUrl').value.trim();

  // 换新的 LLM 地址时，先申请访问权限（弹一次浏览器授权框）
  if (!(await ensureOriginPermission(baseUrl))) {
    setStatus('未获得访问 LLM 地址的权限，未保存', true);
    return;
  }

  const llm = {
    provider: $('provider').value,
    baseUrl,
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    temperature: Number($('temperature').value),
    maxTokens: Number($('maxTokens').value) || 0, // 空 / 非法 → 0 = 不限制
  };
  const budget = {
    budgetVersion: SEARCH_BUDGET_SCHEMA_VERSION,
    keywordCount: Number($('keywordCount').value),
    searchLimitPerKeyword: Number($('searchLimitPerKeyword').value),
    topicLimit: Number($('topicLimit').value),
    maxRepliesPerTopic: Number($('maxRepliesPerTopic').value),
    maxCharsPerReply: Number($('maxCharsPerReply').value),
  };
  await chrome.storage.local.set({
    [STORAGE_KEYS.LLM]: llm,
    [STORAGE_KEYS.BUDGET]: budget,
  });
  setStatus('已保存 ✓');
}

async function testLLM() {
  const provider = $('provider').value;
  const baseUrl = $('baseUrl').value.trim().replace(/\/+$/, '');
  const apiKey = $('apiKey').value.trim();
  const model = $('model').value.trim();
  if (!apiKey) { setStatus('请先填写 API Key', true); return; }
  if (!baseUrl) { setStatus('请先填写 Base URL', true); return; }
  if (!(await ensureOriginPermission(baseUrl))) {
    setStatus('未获得访问该地址的权限，无法测试', true);
    return;
  }

  setStatus('测试中…', false);
  try {
    const headers = { 'Content-Type': 'application/json' };
    let url, body;
    // 不要给很小的 max_tokens：推理模型的思维链会把额度吃光，正文为空会被误判成失败
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      url = baseUrl + '/messages';
      body = { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1024 };
    } else {
      headers.Authorization = 'Bearer ' + apiKey;
      url = baseUrl + '/chat/completions';
      body = { model, messages: [{ role: 'user', content: 'ping' }] };
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text();
      setStatus('连接失败：HTTP ' + res.status + ' ' + txt.slice(0, 200), true);
      return;
    }
    setStatus('连接成功 ✓');
  } catch (e) {
    setStatus('连接失败：' + (e.message || e), true);
  }
}

async function reset() {
  await chrome.storage.local.remove([STORAGE_KEYS.LLM, STORAGE_KEYS.BUDGET]);
  await load();
  setStatus('已恢复默认设置');
}

function intervalText(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function setChannelStatus(message, isError = false) {
  $('channelStatus').textContent = message;
  $('channelStatus').style.color = isError ? 'var(--err)' : 'var(--ok)';
}

function updateMailStateHint(enabled) {
  const hint = $('mailStateHint');
  hint.classList.toggle('enabled', enabled);
  hint.textContent = enabled
    ? '邮箱通知已启用；今后新命中的帖子会按通知间隔合并发送。'
    : '邮箱地址可以保存，但当前通知未启用。勾选“启用”并保存后，今后新命中的帖子才会发送；此前通知不会补发。';
}

function setChannelControlsDisabled(disabled) {
  document.querySelectorAll('#notifyInterval, .channel input, [data-channel-save], [data-channel-test]')
    .forEach((element) => { element.disabled = disabled; });
}

async function loadNotificationSettings() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.USER_EMAIL,
    STORAGE_KEYS.AUTH_TOKEN,
    STORAGE_KEYS.NOTIFY_INTERVAL,
  ]);
  const email = stored[STORAGE_KEYS.USER_EMAIL] || '';
  const token = stored[STORAGE_KEYS.AUTH_TOKEN] || '';
  $('loginEmail').textContent = email || '未登录';

  $('notifyInterval').innerHTML = NOTIFY_INTERVAL_PRESETS
    .map((minutes) => `<option value="${minutes}">${intervalText(minutes)}</option>`)
    .join('');

  if (!email || !token) {
    setChannelControlsDisabled(true);
    setChannelStatus('请先回到 CC98 页面，在插件设置中使用浙大邮箱登录。', true);
    return;
  }

  setChannelControlsDisabled(false);
  try {
    const channels = await listChannels();
    dingChannel = channels.find((channel) => channel.provider === 'dingtalk') || null;
    mailChannel = channels.find((channel) => channel.provider === 'email') || null;
    const interval = (dingChannel && dingChannel.notify_interval_minutes)
      || (mailChannel && mailChannel.notify_interval_minutes)
      || stored[STORAGE_KEYS.NOTIFY_INTERVAL]
      || 60;

    $('notifyInterval').value = String(interval);
    $('dingEnabled').checked = !!(dingChannel && dingChannel.enabled);
    $('dingWebhook').value = (dingChannel && dingChannel.config && dingChannel.config.webhook) || '';
    $('dingSecret').value = '';
    if (dingChannel && dingChannel.has_secret) {
      $('dingSecret').placeholder = '已保存；保存时可留空，测试时需重新填写';
      $('dingSecretHint').textContent = '服务器已保存加签 Secret；修改时重新填写。';
    }
    $('mailEnabled').checked = !!(mailChannel && mailChannel.enabled);
    $('mailTo').value = (mailChannel && mailChannel.config && mailChannel.config.to) || email;
    $('mailPrefix').value = (mailChannel && mailChannel.config && mailChannel.config.subject_prefix) || 'CC98 订阅提醒';
    updateMailStateHint($('mailEnabled').checked);
    setChannelStatus('通知配置已加载；请确认需要的渠道已勾选“启用”');
  } catch (error) {
    setChannelStatus(error.message || '通知配置加载失败', true);
  }
}

function channelPayload(provider, forTest = false) {
  const notifyIntervalMinutes = Number($('notifyInterval').value) || 60;
  if (provider === 'dingtalk') {
    const secret = $('dingSecret').value.trim();
    return {
      provider,
      enabled: $('dingEnabled').checked,
      notifyIntervalMinutes,
      config: {
        webhook: $('dingWebhook').value.trim(),
        secret: secret || (!forTest && dingChannel && dingChannel.has_secret ? '***' : ''),
      },
    };
  }
  return {
    provider,
    enabled: $('mailEnabled').checked,
    notifyIntervalMinutes,
    config: {
      to: $('mailTo').value.trim(),
      subject_prefix: $('mailPrefix').value.trim() || 'CC98 订阅提醒',
    },
  };
}

async function handleChannelAction(button, test) {
  const provider = button.dataset.channelSave || button.dataset.channelTest;
  const payload = channelPayload(provider, test);
  const original = button.textContent;
  button.disabled = true;
  button.textContent = test ? '发送中…' : '保存中…';
  try {
    if (test) await testChannel(payload);
    else {
      await saveChannel(payload);
      await chrome.storage.local.set({ [STORAGE_KEYS.NOTIFY_INTERVAL]: payload.notifyIntervalMinutes });
      await loadNotificationSettings();
    }
    if (test) {
      setChannelStatus('测试消息已发送');
    } else if (provider === 'email') {
      updateMailStateHint(payload.enabled);
      setChannelStatus(payload.enabled ? '邮箱通知已启用并保存' : '邮箱配置已保存，但通知未启用', !payload.enabled);
    } else {
      setChannelStatus(payload.enabled ? '钉钉通知已启用并保存' : '钉钉配置已保存，但通知未启用', !payload.enabled);
    }
  } catch (error) {
    setChannelStatus(error.message || (test ? '测试失败' : '保存失败'), true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// 绑定
['temperature', 'keywordCount', 'searchLimitPerKeyword', 'topicLimit', 'maxRepliesPerTopic', 'maxCharsPerReply'].forEach(bindRange);
$('save').addEventListener('click', save);
$('testLLM').addEventListener('click', testLLM);
$('reset').addEventListener('click', reset);
document.querySelectorAll('[data-channel-save], [data-channel-test]').forEach((button) => {
  button.addEventListener('click', () => handleChannelAction(button, !!button.dataset.channelTest));
});
$('mailEnabled').addEventListener('change', (event) => updateMailStateHint(event.target.checked));

load().catch((error) => setStatus(error.message || '设置加载失败', true));
