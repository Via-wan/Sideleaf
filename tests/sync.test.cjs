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

test('从桌面 PWA 手动粘贴配对码，并立即同步这份书架', async () => {
  const storage = new MemoryStorage({
    'sideleaf.books.v1': JSON.stringify([
      { id:'book-1', title:'雨停以后', content:'正文一' },
      { id:'book-2', title:'索拉里斯星', content:'正文二' }
    ]),
    'sideleaf.notes.v1': '[]'
  });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/device/pair')) {
      assert.equal(JSON.parse(init.body).code, 'one-time-code');
      return new Response(JSON.stringify({ token:'device-token', deviceId:'device-2', deviceName:'愿的桌面 Sideleaf' }), { status:200 });
    }
    return new Response(JSON.stringify({ ok:true, merged:{} }), { status:200 });
  };
  await SideleafSync.pairWithCode(storage, {
    baseUrl:'https://core.example/',
    code:'  one-time-code  ',
    fetch
  });
  assert.equal(SideleafSync.status(storage).connected, true);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].init.body).books.length, 2);
  assert.equal(JSON.parse(storage.getItem(SideleafSync.AUTH_KEY)).baseUrl, 'https://core.example');
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

test('喜欢会作为独立变化同步到 Core', async () => {
  const storage = new MemoryStorage({
    [SideleafSync.AUTH_KEY]: JSON.stringify({ baseUrl:'https://core.example', token:'device-token' }),
    'sideleaf.likes.v1': JSON.stringify([{ id:'like-1', bookId:'book-1', rangeStart:1, rangeEnd:4, author:'wish' }])
  });
  SideleafSync.markDirty(storage, ['sideleaf.likes.v1']);
  let sent;
  await SideleafSync.syncNow(storage, { fetch:async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok:true }), { status:200 });
  } });
  assert.equal(JSON.parse(sent.clientStorage['sideleaf.likes.v1'])[0].id, 'like-1');
  assert.equal(sent.likes[0].author, 'wish');
  assert.equal(sent.notes, undefined);
});

test('叶间与书评会同步到 Core，并整批拉回双方的新内容与通知', async () => {
  const storage = new MemoryStorage({
    [SideleafSync.AUTH_KEY]: JSON.stringify({ baseUrl:'https://core.example', token:'device-token' }),
    'sideleaf.leaf-posts.v1': JSON.stringify([{ id:'wish-leaf', author:'wish', body:'愿的叶子。', comments:[] }]),
    'sideleaf.reviews.v1': JSON.stringify([{ id:'wish-review', author:'wish', bookId:'book-1', body:'愿的书评。' }])
  });
  SideleafSync.markDirty(storage, ['sideleaf.leaf-posts.v1', 'sideleaf.reviews.v1']);
  let sent;
  await SideleafSync.syncNow(storage, { fetch:async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok:true, state:{
      leafPosts:[
        { id:'wish-leaf', author:'wish', body:'愿的叶子。', comments:[] },
        { id:'zheng-leaf', author:'zheng', body:'峥的叶子。', comments:[] }
      ],
      reviews:[
        { id:'wish-review', author:'wish', bookId:'book-1', body:'愿的书评。' },
        { id:'zheng-review', author:'zheng', bookId:'book-1', body:'峥的书评。' }
      ],
      activityNotifications:[{ kind:'leaf-comment', entityId:'comment-1', readAt:null }]
    } }), { status:200 });
  } });
  assert.equal(sent.leafPosts[0].id, 'wish-leaf');
  assert.equal(sent.reviews[0].id, 'wish-review');
  assert.deepEqual(JSON.parse(storage.getItem('sideleaf.leaf-posts.v1')).map(item => item.id), ['wish-leaf', 'zheng-leaf']);
  assert.deepEqual(JSON.parse(storage.getItem('sideleaf.reviews.v1')).map(item => item.id), ['wish-review', 'zheng-review']);
  assert.equal(JSON.parse(storage.getItem('sideleaf.activity-notifications.v1'))[0].entityId, 'comment-1');
});

test('没有本机脏数据时仍拉回峥的阅读线、批注与请求状态', async () => {
  const storage = new MemoryStorage({
    [SideleafSync.AUTH_KEY]: JSON.stringify({ baseUrl:'https://core.example', token:'device-token' }),
    'sideleaf.reading-lines.v1': JSON.stringify({
      'book-1':{ wish:{ current:88 }, zheng:{ current:null, furthest:null }, schemaVersion:2 }
    }),
    'sideleaf.notes.v1': JSON.stringify([{ id:'wish-note', author:'wish', text:'愿先说。' }]),
    'sideleaf.likes.v1': JSON.stringify([
      { id:'wish-like', bookId:'book-1', author:'wish', rangeStart:1, rangeEnd:3 },
      { id:'old-zheng-like', bookId:'book-1', author:'zheng', rangeStart:4, rangeEnd:6 }
    ]),
    'sideleaf.read-requests.v1': JSON.stringify([{ id:'request-1', status:'pending', bookId:'book-1' }])
  });
  let sent;
  await SideleafSync.syncNow(storage, { fetch:async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({
      ok:true,
      state:{
        readingLines:{ 'book-1':{ zheng:{ current:120, furthest:120, updatedAt:2 } } },
        notes:[{ id:'zheng-note', bookId:'book-1', author:'zheng', text:'峥接住了。' }],
        journals:[{
          id:'journal-1', bookId:'book-1', chapterKey:'1:0:第一章', chapterTitle:'第一章',
          chapterPath:['第一章'], chapterAnchor:0, chapterEnd:120, text:'第一篇札记。', createdAt:3, updatedAt:3
        }],
        likes:[{ id:'new-zheng-like', bookId:'book-1', author:'zheng', rangeStart:8, rangeEnd:10 }],
        likesReplaceZheng:true,
        requests:[{ id:'request-1', status:'completed', completedAt:3, updatedAt:3 }]
      }
    }), { status:200 });
  } });
  assert.deepEqual(sent, { clientStorage:{} });
  const lines = JSON.parse(storage.getItem('sideleaf.reading-lines.v1'));
  assert.equal(lines['book-1'].wish.current, 88);
  assert.equal(lines['book-1'].zheng.current, 120);
  const notes = JSON.parse(storage.getItem('sideleaf.notes.v1'));
  assert.deepEqual(notes.map(note => note.id), ['wish-note', 'zheng-note']);
  assert.equal(JSON.parse(storage.getItem('sideleaf.chapter-journals.v1'))[0].text, '第一篇札记。');
  const likes = JSON.parse(storage.getItem('sideleaf.likes.v1'));
  assert.deepEqual(likes.map(like => like.id), ['wish-like', 'new-zheng-like']);
  assert.equal(JSON.parse(storage.getItem('sideleaf.read-requests.v1'))[0].status, 'completed');
});

test('切页发生在同步途中时，结束后会再拉一次最新的峥活动', async () => {
  const storage = new MemoryStorage({
    [SideleafSync.AUTH_KEY]: JSON.stringify({ baseUrl:'https://core.example', token:'device-token' }),
    'sideleaf.reading-lines.v1': JSON.stringify({
      'book-1':{ wish:{ current:88 }, zheng:{ current:null, furthest:null }, schemaVersion:2 }
    }),
    'sideleaf.notes.v1': '[]'
  });
  let finishFirst;
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Promise(resolve => { finishFirst = resolve; });
    }
    return new Response(JSON.stringify({
      ok:true,
      state:{
        readingLines:{ 'book-1':{ zheng:{ current:2304, furthest:2304, updatedAt:3 } } },
        notes:[{ id:'latest-note', bookId:'book-1', author:'zheng', text:'刚写回来的批注。' }]
      }
    }), { status:200 });
  };

  const first = SideleafSync.syncNow(storage, { fetch });
  const pageTurn = SideleafSync.syncNow(storage, { fetch, queueIfBusy:true });
  finishFirst(new Response(JSON.stringify({ ok:true, state:{} }), { status:200 }));
  await Promise.all([first, pageTurn]);

  assert.equal(calls, 2);
  assert.equal(JSON.parse(storage.getItem('sideleaf.reading-lines.v1'))['book-1'].zheng.current, 2304);
  assert.equal(JSON.parse(storage.getItem('sideleaf.notes.v1'))[0].id, 'latest-note');
});

test('恢复接口使用设备凭证，并支持读取、固定与恢复快照', async () => {
  const storage = new MemoryStorage({
    [SideleafSync.AUTH_KEY]: JSON.stringify({ baseUrl:'https://core.example', token:'device-token' })
  });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/device/recovery')) {
      return new Response(JSON.stringify({ current:{ summary:{ books:1 } }, snapshots:[] }), { status:200 });
    }
    if (url.endsWith('/api/device/recovery/current')) {
      return new Response(JSON.stringify({ backup:{ format:'sideleaf-backup' } }), { status:200 });
    }
    if (url.endsWith('/api/device/recovery/snapshots') && init.method === 'POST') {
      return new Response(JSON.stringify({ snapshot:{ id:'snapshot-1', pinned:true } }), { status:200 });
    }
    if (url.endsWith('/api/device/recovery/snapshots/snapshot-1/pin')) {
      return new Response(JSON.stringify({ snapshot:{ id:'snapshot-1', pinned:false } }), { status:200 });
    }
    return new Response(JSON.stringify({ rollbackSnapshotId:'rollback-1', backup:{ format:'sideleaf-backup' } }), { status:200 });
  };
  assert.equal((await SideleafSync.recoveryOverview(storage, { fetch })).current.summary.books, 1);
  assert.equal((await SideleafSync.fetchRecoveryBackup(storage, null, { fetch })).format, 'sideleaf-backup');
  assert.equal((await SideleafSync.createRecoverySnapshot(storage, '愿手动保存', { fetch })).snapshot.pinned, true);
  assert.equal((await SideleafSync.pinRecoverySnapshot(storage, 'snapshot-1', false, { fetch })).snapshot.pinned, false);
  assert.equal((await SideleafSync.restoreRecoverySnapshot(storage, 'snapshot-1', { fetch })).rollbackSnapshotId, 'rollback-1');
  calls.forEach(call => assert.equal(call.init.headers.authorization, 'Bearer device-token'));
  assert.equal(JSON.parse(calls[2].init.body).reason, '愿手动保存');
  assert.equal(JSON.parse(calls[3].init.body).pinned, false);
});
