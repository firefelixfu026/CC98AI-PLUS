// ============================================================
// CC98 API 客户端（旧 data/cc98_client.py 的 JS 翻译）
//   searchPosts：搜主题，1.2s 限速；遇到访问保护立即停止
//   getPostDetail：读一个主题 + 所有楼层，404 回退 /post/basic
// ============================================================
import { fetchProxy } from './net.js';
import { getAuth, isTokenExpired } from './token-extractor.js';
import { getCC98Auth } from './storage.js';
import { AppError, ERROR_TYPES } from './errors.js';
import { isWebVPN, getApiBase, getWebBase } from './webvpn.js';
import {
  CC98_SEARCH_MIN_INTERVAL_MS,
  SEARCH_CACHE_TTL_MS,
  TOPIC_CACHE_TTL_MS,
} from '../../shared/constants.js';

// 搜索限速状态
let _searchChain = Promise.resolve();
let _lastSearchAt = 0;
const _searchCache = new Map();
const _topicCache = new Map();
const MAX_CACHE_ENTRIES = 40;

function _withRateLimit(fn) {
  const run = _searchChain.then(async () => {
    const wait = CC98_SEARCH_MIN_INTERVAL_MS - (Date.now() - _lastSearchAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _lastSearchAt = Date.now();
    return fn();
  });
  _searchChain = run.catch(() => {});
  return run;
}

async function _ensureAuth() {
  // 在 CC98 内容页优先读取当前登录态；独立搜索页没有站点 localStorage，
  // 因此回退到内容脚本写入 chrome.storage.session 的临时凭证。
  const isExtensionPage = typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
  const auth = (isExtensionPage ? null : getAuth()) || await getCC98Auth();
  if (!auth) {
    throw new AppError(ERROR_TYPES.CC98_NOT_LOGGED_IN, '未检测到 CC98 登录凭证，请先在 cc98.org 登录');
  }
  // CC98 的 access_token 一小时过期，靠页面自身用 refresh_token 续期。
  // 已过期时直接提示刷新，省得发一堆注定 401 的请求。
  if (auth.type === 'bearer' && isTokenExpired()) {
    throw new AppError(
      ERROR_TYPES.CC98_TOKEN_EXPIRED,
      'CC98 登录已过期，请刷新 CC98 页面后重试（页面会自动续期）'
    );
  }
  return auth;
}

function _headers(auth) {
  // 注意：User-Agent 和 Cookie 都是 fetch 的 forbidden header，手动设置会被浏览器丢弃。
  // 所以 cookie 型凭证不能靠 header 传，改用 credentials:'include' 让浏览器自己带。
  const headers = { Accept: 'application/json' };
  if (auth.type === 'bearer') {
    const v = auth.value;
    headers.Authorization = v.toLowerCase().startsWith('bearer ') ? v : 'Bearer ' + v;
  }
  return headers;
}

function _clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function _cacheGet(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return _clone(entry.value);
}

function _cacheSet(cache, key, value) {
  cache.set(key, { ts: Date.now(), value: _clone(value) });
  while (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

function _guardText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return String(value.detail || value.message || value.error || '');
}

function _isAccessGuard(errOrPayload) {
  const status = errOrPayload && errOrPayload.status;
  if (status === 403 || status === 429) return true;
  return /反爬|爬虫|访问过于频繁|请求过于频繁|too many requests|rate.?limit|last_search/i
    .test(_guardText(errOrPayload));
}

function _accessGuardError(detail) {
  return new AppError(
    ERROR_TYPES.CC98_ACCESS_GUARD,
    'CC98 返回了访问限制或反爬提示，本轮搜索已停止',
    detail
  );
}

async function _getJson(path, params, auth, requestBudget) {
  const qs = new URLSearchParams(params || {}).toString();
  const url = (await getApiBase()) + path + (qs ? '?' + qs : '');
  console.debug('[CC98 AI+] 请求：', url);
  // WebVPN 靠 cookie 维持会话；cookie 型凭证也只能靠浏览器自动携带
  const credentials = isWebVPN() || auth.type === 'cookie' ? 'include' : 'omit';
  try {
    if (requestBudget && typeof requestBudget.consume === 'function') requestBudget.consume();
    const payload = await fetchProxy(url, { method: 'GET', headers: _headers(auth), credentials });
    if (_isAccessGuard(payload)) throw _accessGuardError(_guardText(payload));
    return payload;
  } catch (err) {
    if (err && err.type === ERROR_TYPES.CC98_ACCESS_GUARD) throw err;
    if (_isAccessGuard(err)) throw _accessGuardError(err.detail || err.message);
    // 明确标记成 CC98 的错误，否则上层只看到 401 会误判成 LLM API Key 问题
    if (err && err.status === 401) {
      throw new AppError(
        ERROR_TYPES.CC98_TOKEN_EXPIRED,
        'CC98 登录凭证无效或已过期（插件没能拿到有效的登录态）',
        `${auth.type} 凭证，长度 ${String(auth.value || '').length}`
      );
    }
    throw err;
  }
}

function _limitedGetJson(path, params, auth, requestBudget) {
  return _withRateLimit(() => _getJson(path, params, auth, requestBudget));
}

// 搜索主题，返回标准化主题数组
export async function searchPosts(query, boardId = null, limit = 20, offset = 0, opts = {}) {
  const q = (query || '').trim();
  if (!q) throw new Error('query must not be empty');
  const auth = await _ensureAuth();
  const cacheKey = `${boardId || 0}|${q}|${limit}|${offset}`;
  const cached = _cacheGet(_searchCache, cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  let endpoint = '/topic/search';
  if (boardId != null && boardId !== 0) endpoint = `/topic/search/board/${boardId}`;

  const topics = [];
  let cur = offset;
  while (topics.length < limit) {
    const size = Math.min(20, limit - topics.length);
    const payload = await _limitedGetJson(
      endpoint,
      { keyword: q, from: cur, size },
      auth,
      opts.requestBudget
    );
    // 返回不是数组，说明拿到的不是搜索结果（WebVPN 拦截页、登录跳转、错误 HTML 等）。
    // 这种情况必须报错，不能当成「搜不到」静默吞掉。
    if (!Array.isArray(payload)) {
      throw new AppError(
        ERROR_TYPES.CC98_API_FAILED,
        'CC98 搜索接口返回了非预期内容（可能是 WebVPN 拦截、未授权该子域，或登录已失效）',
        typeof payload === 'string' ? payload.slice(0, 300) : payload
      );
    }
    if (!payload.length) break;
    topics.push(...payload.map(normalizeTopic));
    if (payload.length < size) break;
    cur += payload.length;
  }
  const result = topics.slice(0, limit);
  _cacheSet(_searchCache, cacheKey, result);
  return result;
}

// 读一个主题 + 所有楼层
export async function getPostDetail(postId, opts = {}) {
  const pageSize = opts.pageSize || 10;
  const maxPages = opts.maxPages || null;
  const skipTopicInfo = opts.skipTopicInfo === true;
  const auth = await _ensureAuth();
  const cacheKey = `${postId}|${pageSize}|${maxPages == null ? 'all' : maxPages}|${skipTopicInfo ? 'posts' : 'full'}`;
  const cached = _cacheGet(_topicCache, cacheKey, TOPIC_CACHE_TTL_MS);
  if (cached) return cached;

  let topicId = postId;
  let topicInfo = null;
  if (!skipTopicInfo) {
    try {
      topicInfo = await _limitedGetJson(`/topic/${topicId}`, null, auth, opts.requestBudget);
    } catch (err) {
      if (!err || err.status !== 404) throw err;
      const basic = await _limitedGetJson('/post/basic', { id: postId }, auth, opts.requestBudget);
      const bp = Array.isArray(basic) ? basic[0] : basic;
      if (!bp || !bp.topicId) throw err;
      topicId = bp.topicId;
      topicInfo = await _limitedGetJson(`/topic/${topicId}`, null, auth, opts.requestBudget);
    }
  }

  const isDict = topicInfo && typeof topicInfo === 'object' && !Array.isArray(topicInfo);
  const topic = isDict ? normalizeTopic(topicInfo) : { id: topicId };
  const expectedFloorCount = isDict && typeof topicInfo.replyCount === 'number' ? topicInfo.replyCount + 1 : null;

  const posts = [];
  let offset = 0;
  let pagesRead = 0;
  while (true) {
    if (maxPages != null && pagesRead >= maxPages) break;
    const payload = await _limitedGetJson(
      `/topic/${topicId}/post`,
      { from: offset, size: pageSize },
      auth,
      opts.requestBudget
    );
    if (!Array.isArray(payload) || !payload.length) break;
    posts.push(...payload.map(normalizePost));
    pagesRead++;
    if (payload.length < pageSize) break;
    if (expectedFloorCount != null && posts.length >= expectedFloorCount) break;
    offset += payload.length;
  }

  const result = {
    topic,
    posts,
    post_count: posts.length,
    url: `${getWebBase()}/topic/${topicId}`,
  };
  _cacheSet(_topicCache, cacheKey, result);
  return result;
}

function _firstPresent(obj, names) {
  for (const n of names) if (obj && n in obj) return obj[n];
  return undefined;
}

export function normalizeTopic(item) {
  const topicId = _firstPresent(item, ['id', 'topicId']);
  return {
    id: topicId,
    title: item.title,
    board_id: item.boardId,
    board_name: item.boardName,
    author_id: item.userId,
    author_name: _firstPresent(item, ['userName', 'authorName', 'lastPostUser']),
    time: _firstPresent(item, ['time', 'createTime']),
    last_post_time: item.lastPostTime,
    last_post_user: item.lastPostUser,
    reply_count: item.replyCount,
    hit_count: item.hitCount,
    like_count: item.likeCount,
    is_anonymous: item.isAnonymous,
    type: item.type,
    url: `${getWebBase()}/topic/${topicId}`,
    raw: item,
  };
}

export function normalizePost(item) {
  return {
    id: item.id,
    topic_id: item.topicId,
    floor: item.floor,
    title: item.title,
    content: item.content,
    content_type: item.contentType,
    user_id: item.userId,
    user_name: item.userName,
    time: item.time,
    is_anonymous: item.isAnonymous,
    is_deleted: item.isDeleted,
    is_lz: item.isLZ,
    like_count: item.likeCount,
    url: `${getWebBase()}/topic/${item.topicId}`,
    raw: item,
  };
}
