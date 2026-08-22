const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const SideleafBackup = require('../sideleaf-backup.js');
const SideleafLibrary = require('../sideleaf-library.js');

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const original = {
  'sideleaf.books.v1': JSON.stringify([{ id: 'book-1', title: '雨停以后', content: '正文' }]),
  'sideleaf.notes.v1': JSON.stringify([{ id: 'note-1', text: '亲亲' }]),
  'sideleaf.likes.v1': JSON.stringify([{ id: 'like-1', quote: '喜欢这句' }]),
  'sideleaf.settings.v1': JSON.stringify({ fontSize: 17 }),
  'sideleaf.future.v2': JSON.stringify({ kept: true })
};

test('完整备份包含所有 Sideleaf 数据，但不夹带其他站点数据', async () => {
  const storage = new MemoryStorage({ ...original, unrelated: 'nope' });
  SideleafLibrary.ensure(storage);
  const backup = await SideleafBackup.create(storage, {
    appVersion: 'test',
    now: new Date('2026-08-21T00:00:00.000Z'),
    crypto: webcrypto
  });
  const backedUpBooks = JSON.parse(backup.storage['sideleaf.books.v1']);
  assert.equal(backedUpBooks.length, 2);
  assert.equal(backedUpBooks[0].id, 'sideleaf-sample-rain');
  assert.equal(backedUpBooks[0].content, SideleafLibrary.BUILT_IN_BOOKS[0].content);
  assert.equal(backup.storage.unrelated, undefined);
  assert.equal(backup.schemaVersion, 1);
  assert.match(backup.integrity.value, /^[a-f0-9]{64}$/);
  const parsed = await SideleafBackup.parse(JSON.stringify(backup), { crypto: webcrypto });
  assert.deepEqual(parsed.storage, backup.storage);
  assert.equal(SideleafBackup.summarize(parsed.storage).books, 2);
  assert.equal(SideleafBackup.summarize(parsed.storage).likes, 1);
});

test('内容被改过的备份会被完整性校验拒绝', async () => {
  const backup = await SideleafBackup.create(new MemoryStorage(original), { crypto: webcrypto });
  backup.storage['sideleaf.books.v1'] = '[]';
  await assert.rejects(
    SideleafBackup.parse(JSON.stringify(backup), { crypto: webcrypto }),
    /校验值不一致/
  );
});

test('恢复会替换 Sideleaf 数据、保留其他数据，并可立即撤销', () => {
  const storage = new MemoryStorage({
    'sideleaf.books.v1': '[]',
    'sideleaf.old.v1': 'old',
    unrelated: 'still-here'
  });
  const undo = SideleafBackup.replace(storage, original);
  assert.deepEqual(SideleafBackup.collect(storage), original);
  assert.equal(storage.getItem('unrelated'), 'still-here');
  undo();
  assert.deepEqual(SideleafBackup.collect(storage), {
    'sideleaf.books.v1': '[]',
    'sideleaf.old.v1': 'old'
  });
});

test('已知数据项的结构不正确时拒绝恢复', () => {
  assert.throws(
    () => SideleafBackup.replace(new MemoryStorage(), { 'sideleaf.books.v1': '{}' }),
    /类型不正确/
  );
});

test('喜欢数据损坏时拒绝恢复', () => {
  assert.throws(
    () => SideleafBackup.replace(new MemoryStorage(), { 'sideleaf.likes.v1': '{}' }),
    /类型不正确/
  );
});

test('恢复中途写入失败时自动回滚原数据', () => {
  class FailingStorage extends MemoryStorage {
    constructor(initial) {
      super(initial);
      this.failedOnce = false;
    }
    setItem(key, value) {
      if (!this.failedOnce && key === 'sideleaf.notes.v1') {
        this.failedOnce = true;
        throw new Error('quota');
      }
      super.setItem(key, value);
    }
  }
  const before = {
    'sideleaf.books.v1': JSON.stringify([{ id: 'safe' }]),
    'sideleaf.notes.v1': '[]'
  };
  const storage = new FailingStorage(before);
  assert.throws(() => SideleafBackup.replace(storage, original), /quota/);
  assert.deepEqual(SideleafBackup.collect(storage), before);
});

test('Core 当前书架合并会保留两边独有内容，并以 Core 同 ID 内容为准', () => {
  const current = {
    'sideleaf.books.v1': JSON.stringify([
      { id:'local-only', title:'本机独有' },
      { id:'shared', title:'本机旧标题', progress:12 }
    ]),
    'sideleaf.notes.v1': JSON.stringify([{ id:'local-note', author:'wish' }]),
    'sideleaf.likes.v1': JSON.stringify([{ id:'local-like', quote:'愿喜欢的句子' }]),
    'sideleaf.reading-lines.v1': JSON.stringify({
      shared:{ wish:{ current:12 }, zheng:{ current:null }, schemaVersion:2 }
    }),
    'sideleaf.future.v2': JSON.stringify({ local:true })
  };
  const incoming = {
    'sideleaf.books.v1': JSON.stringify([
      { id:'core-only', title:'Core 独有' },
      { id:'shared', title:'Core 新标题', content:'完整正文' }
    ]),
    'sideleaf.notes.v1': JSON.stringify([{ id:'core-note', author:'zheng' }]),
    'sideleaf.likes.v1': JSON.stringify([{ id:'core-like', quote:'Core 留下的喜欢' }]),
    'sideleaf.reading-lines.v1': JSON.stringify({
      shared:{ zheng:{ current:88, furthest:88 }, schemaVersion:2 }
    })
  };
  const merged = SideleafBackup.merge(current, incoming);
  const books = JSON.parse(merged['sideleaf.books.v1']);
  assert.deepEqual(books.map(book => book.id), ['local-only', 'shared', 'core-only']);
  assert.deepEqual(books.find(book => book.id === 'shared'), {
    id:'shared', title:'Core 新标题', progress:12, content:'完整正文'
  });
  assert.deepEqual(JSON.parse(merged['sideleaf.notes.v1']).map(note => note.id), ['local-note', 'core-note']);
  assert.deepEqual(JSON.parse(merged['sideleaf.likes.v1']).map(like => like.id), ['local-like', 'core-like']);
  const lines = JSON.parse(merged['sideleaf.reading-lines.v1']);
  assert.equal(lines.shared.wish.current, 12);
  assert.equal(lines.shared.zheng.current, 88);
  assert.equal(merged['sideleaf.future.v2'], JSON.stringify({ local:true }));
});
