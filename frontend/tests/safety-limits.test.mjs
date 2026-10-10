import assert from 'node:assert/strict';

import { hasRestrictedNotice } from '../src/content/lib/content-policy.js';
import { createRequestBudget } from '../src/content/lib/request-budget.js';
import { normalizeSearchBudget } from '../src/content/lib/storage.js';

assert.equal(hasRestrictedNotice('楼主说明：请勿转载本文。'), true);
assert.equal(hasRestrictedNotice('普通课程讨论内容'), false);

const requestBudget = createRequestBudget(2);
requestBudget.consume();
requestBudget.consume();
assert.throws(() => requestBudget.consume(), (error) => error.type === 'search_request_limit');

assert.deepEqual(
  normalizeSearchBudget({
    keywordCount: 10,
    searchLimitPerKeyword: 50,
    topicLimit: 20,
    maxRepliesPerTopic: 60,
    maxCharsPerReply: 5000,
  }),
  {
    keywordCount: 4,
    searchLimitPerKeyword: 20,
    topicLimit: 5,
    maxRepliesPerTopic: 20,
    maxCharsPerReply: 2000,
  }
);

const token = `${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}`;
globalThis.location = { hostname: 'www.cc98.org' };
globalThis.document = { cookie: '' };
globalThis.localStorage = {
  length: 1,
  getItem(key) {
    if (key === '__1_accessToken') return `str-Bearer ${token}`;
    return null;
  },
  key(index) { return index === 0 ? '__1_accessToken' : null; },
};

let fetchCount = 0;
let responseMode = 'guard';
globalThis.chrome = {
  storage: {
    local: {
      async get() { return {}; },
      async set() {},
    },
    session: {
      async set() {},
      async remove() {},
    },
  },
  runtime: {
    async sendMessage() {
      fetchCount += 1;
      if (responseMode === 'guard') {
        return { ok: false, status: 403, data: { detail: '访问过于频繁' } };
      }
      return { ok: true, status: 200, data: [] };
    },
  },
};

const { searchPosts } = await import('../src/content/lib/cc98-api.js');
await assert.rejects(
  () => searchPosts('访问保护测试'),
  (error) => error.type === 'cc98_access_guard'
);
assert.equal(fetchCount, 1, '403 must not be retried');

responseMode = 'success';
await searchPosts('缓存测试');
await searchPosts('缓存测试');
assert.equal(fetchCount, 2, 'second identical search should use memory cache');

console.log('frontend safety limits passed');
