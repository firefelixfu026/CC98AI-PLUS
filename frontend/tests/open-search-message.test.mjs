import assert from 'node:assert/strict';
import test from 'node:test';

test('OPEN_SEARCH creates the internal search tab and responds', async () => {
  let messageListener = null;
  let createdUrl = null;

  globalThis.chrome = {
    action: {
      setBadgeBackgroundColor() {},
      setBadgeText() {},
    },
    alarms: {
      create() {},
      onAlarm: { addListener() {} },
    },
    runtime: {
      lastError: null,
      getURL(path) { return `chrome-extension://test/${path}`; },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: {
        addListener(listener) { messageListener = listener; },
      },
      openOptionsPage() { return Promise.resolve(); },
    },
    storage: {
      local: { async get() { return {}; } },
      session: { setAccessLevel() { return Promise.resolve(); } },
    },
    tabs: {
      create(options, callback) {
        createdUrl = options.url;
        callback({ id: 42 });
      },
    },
  };

  await import(`../src/background/service-worker.js?test=${Date.now()}`);
  assert.equal(typeof messageListener, 'function');

  let response = null;
  const keepChannelOpen = messageListener(
    { type: 'OPEN_SEARCH' },
    {},
    (value) => { response = value; }
  );

  assert.equal(keepChannelOpen, true);
  assert.equal(createdUrl, 'chrome-extension://test/src/pages/search/search.html');
  assert.deepEqual(response, { ok: true, tabId: 42 });
});
