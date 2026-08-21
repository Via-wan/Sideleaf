const test = require('node:test');
const assert = require('node:assert/strict');
const SideleafLibrary = require('../sideleaf-library.js');

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('书库初始化会把内置样章迁入统一书籍清单', () => {
  const imported = { id: 'book-1', title: '索拉里斯星', content: '正文' };
  const storage = new MemoryStorage({
    'sideleaf.books.v1': JSON.stringify([imported])
  });
  const books = SideleafLibrary.ensure(storage);
  assert.equal(books.length, 2);
  assert.equal(books[0].id, 'sideleaf-sample-rain');
  assert.equal(books[0].content, SideleafLibrary.BUILT_IN_BOOKS[0].content);
  assert.deepEqual(books[1], imported);
});

test('重复初始化不会复制内置书', () => {
  const storage = new MemoryStorage();
  SideleafLibrary.ensure(storage);
  SideleafLibrary.ensure(storage);
  const books = JSON.parse(storage.getItem('sideleaf.books.v1'));
  assert.equal(books.filter(book => book.id === 'sideleaf-sample-rain').length, 1);
});

test('恢复旧备份时补齐内置书，已有快照则保持原样', () => {
  const oldSnapshot = {
    'sideleaf.books.v1': JSON.stringify([{ id: 'book-1', title: '索拉里斯星', content: '正文' }])
  };
  const migrated = SideleafLibrary.ensureSnapshot(oldSnapshot);
  assert.equal(JSON.parse(migrated['sideleaf.books.v1']).length, 2);

  const savedSample = { ...SideleafLibrary.BUILT_IN_BOOKS[0], content: '备份当时的样章正文', progress: 17 };
  const currentSnapshot = {
    'sideleaf.books.v1': JSON.stringify([savedSample])
  };
  const preserved = SideleafLibrary.ensureSnapshot(currentSnapshot);
  assert.deepEqual(JSON.parse(preserved['sideleaf.books.v1'])[0], savedSample);
});

test('新增导入书统一排在全部内置书之后', () => {
  const imported = { id: 'book-new', title: '新书', content: '正文' };
  const books = SideleafLibrary.insertImported([], imported);
  assert.equal(books[0].id, 'sideleaf-sample-rain');
  assert.deepEqual(books[1], imported);
});
