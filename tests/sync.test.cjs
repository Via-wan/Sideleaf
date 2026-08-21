const test = require('node:test');
const assert = require('node:assert/strict');
const SideleafSync = require('../sideleaf-sync.js');

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

test('一次性配对后保存受限设备凭证并立即同步现有数据', async () => {
  const storage = new MemoryStorage({
    'sideleaf.books.v1': JSON.stringify([{ id:'book-1', title:'雨停以后', content:'正文' }]),
    'sideleaf.notes.v1': '[]'
  });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/device/pair')) {
      return new Response(JSON.stringify({ token:'device-token', deviceId:'device-1', deviceName:'愿的 iPhone' }), { status:200 });
    }
    return new Response(JSON.stringify({ ok:true, merged:{} }), { status:200 });
  };
  let replaced = '';
  const paired = await SideleafSync.acceptPairing(storage, {
    fetch,
    location:{ href:'https://via-wan.github.io/Sideleaf/?sideleaf_pair=once&sideleaf_core=https%3A%2F%2Fcore.example' },
    history:{ replaceState:(_state, _title, url) => { replaced = url; } }
  });
  assert.equal(paired, true);
  assert.equal(SideleafSync.status(storage).connected, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers.authorization, 'Bearer device-token');
  assert.equal(JSON.parse(calls[1].init.body).books[0].id, 'book-1');
  assert.equal(replaced, '/Sideleaf/');
});

test('明确删除批注时发送一次可重试的删除动作', async () => {
  const storage = new MemoryStorage({
    [SideleafSync.AUTH_KEY]: JSON.stringify({ baseUrl:'https://core.example', token:'device-token' })
  });
  SideleafSync.queueDeletion(storage, { entity:'annotation-message', id:'note-1' });
  let sent;
  await SideleafSync.syncNow(storage, { fetch:async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok:true }), { status:200 });
  } });
  assert.deepEqual(sent.deletions, [{ entity:'annotation-message', id:'note-1' }]);
  assert.equal(storage.getItem(SideleafSync.DELETIONS_KEY), null);
});

test('断网时保留脏数据，恢复后只发送变化过的分类', async () => {
  const storage = new MemoryStorage({
    [SideleafSync.AUTH_KEY]: JSON.stringify({ baseUrl:'https://core.example', token:'device-token' }),
    'sideleaf.notes.v1': JSON.stringify([{ id:'note-1' }]),
    'sideleaf.books.v1': JSON.stringify([{ id:'book-1' }])
  });
  SideleafSync.markDirty(storage, ['sideleaf.notes.v1']);
  await SideleafSync.syncNow(storage, { fetch:async () => { throw new Error('offline'); } });
  assert.equal(SideleafSync.status(storage).pending, 1);
  let sent;
  await SideleafSync.syncNow(storage, { fetch:async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok:true }), { status:200 });
  } });
  assert.deepEqual(sent.notes, [{ id:'note-1' }]);
  assert.equal(sent.books, undefined);
  assert.equal(SideleafSync.status(storage).pending, 0);
});
