import assert from 'node:assert/strict';

import { hasRestrictedNotice } from '../src/content/lib/content-policy.js';
import { createRequestBudget } from '../src/content/lib/request-budget.js';
import { migrateSearchBudget, normalizeSearchBudget } from '../src/content/lib/storage.js';
import { shouldPauseAfterTopic } from '../src/content/pipeline/reply-reader.js';

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
    topicLimit: 20,
    maxRepliesPerTopic: 20,
    maxCharsPerReply: 2000,
  }
);

assert.deepEqual(
  migrateSearchBudget({ topicLimit: 5, maxRepliesPerTopic: 20 }),
  { topicLimit: 12, maxRepliesPerTopic: 15, budgetVersion: 3 }
);
assert.deepEqual(
  migrateSearchBudget({ topicLimit: 8, maxRepliesPerTopic: 15, budgetVersion: 2 }),
  { topicLimit: 12, maxRepliesPerTopic: 15, budgetVersion: 3 }
);
assert.equal(shouldPauseAfterTopic(5, 20), true);
assert.equal(shouldPauseAfterTopic(10, 20), true);
assert.equal(shouldPauseAfterTopic(20, 20), false);

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
      async get() {
        return { cc98Token: token, cc98AuthType: 'bearer' };
      },
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

const { getPostDetail, searchPosts } = await import('../src/content/lib/cc98-api.js');
await assert.rejects(
  () => searchPosts('访问保护测试'),
  (error) => error.type === 'cc98_access_guard'
);
assert.equal(fetchCount, 1, '403 must not be retried');

responseMode = 'success';
await searchPosts('缓存测试');
await searchPosts('缓存测试');
assert.equal(fetchCount, 2, 'second identical search should use memory cache');

const detailBudget = createRequestBudget(2);
await getPostDetail(123, { maxPages: 1, skipTopicInfo: true, requestBudget: detailBudget });
assert.equal(detailBudget.used, 1, 'search-result topics should read posts without refetching topic metadata');

globalThis.location = { hostname: 'test-extension', protocol: 'chrome-extension:' };
globalThis.localStorage = { length: 0, getItem() { return null; }, key() { return null; } };
const extensionPageFetches = fetchCount;
await searchPosts('完整搜索页凭证测试');
assert.equal(fetchCount, extensionPageFetches + 1, 'full search page should reuse the session token');

console.log('frontend safety limits passed');
