(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SideleafBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMAT = 'sideleaf-backup';
  const SCHEMA_VERSION = 1;
  const KEY_PREFIX = 'sideleaf.';
  const KNOWN_SHAPES = {
    'sideleaf.books.v1': 'array',
    'sideleaf.settings.v1': 'object',
    'sideleaf.notes.v1': 'array',
    'sideleaf.reading-lines.v1': 'object',
    'sideleaf.chapter-journals.v1': 'array',
    'sideleaf.read-requests.v1': 'array'
  };

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function collect(storage) {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) keys.push(key);
    }
    keys.sort();
    return Object.fromEntries(keys.map(key => [key, storage.getItem(key)]));
  }

  function parseKnown(storage, key, fallback) {
    try {
      const value = JSON.parse(storage[key] ?? '');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function summarize(storage, options = {}) {
    const books = parseKnown(storage, 'sideleaf.books.v1', []);
    const notes = parseKnown(storage, 'sideleaf.notes.v1', []);
    const lines = parseKnown(storage, 'sideleaf.reading-lines.v1', {});
    const journals = parseKnown(storage, 'sideleaf.chapter-journals.v1', []);
    const requests = parseKnown(storage, 'sideleaf.read-requests.v1', []);
    const bytes = Object.entries(storage).reduce((total, [key, value]) => total + key.length + String(value).length, 0) * 2;
    return {
      books: (Array.isArray(books) ? books.length : 0) + Math.max(0, Number(options.builtInBooks) || 0),
      notes: Array.isArray(notes) ? notes.length : 0,
      readingLines: isPlainObject(lines) ? Object.keys(lines).length : 0,
      journals: Array.isArray(journals) ? journals.length : 0,
      requests: Array.isArray(requests) ? requests.length : 0,
      keys: Object.keys(storage).length,
      bytes
    };
  }

  function validateStorage(storage) {
    if (!isPlainObject(storage)) throw new Error('备份里的数据区格式不正确。');
    const entries = Object.entries(storage);
    if (entries.length > 200) throw new Error('备份里的数据项异常多，已停止恢复。');
    entries.forEach(([key, rawValue]) => {
      if (!key.startsWith(KEY_PREFIX)) throw new Error(`发现不属于 Sideleaf 的数据项：${key}`);
      if (typeof rawValue !== 'string') throw new Error(`数据项 ${key} 已损坏。`);
      const expectedShape = KNOWN_SHAPES[key];
      if (!expectedShape) return;
      let parsed;
      try { parsed = JSON.parse(rawValue); }
      catch (_) { throw new Error(`数据项 ${key} 不是有效的 JSON。`); }
      if (expectedShape === 'array' && !Array.isArray(parsed)) throw new Error(`数据项 ${key} 的类型不正确。`);
      if (expectedShape === 'object' && !isPlainObject(parsed)) throw new Error(`数据项 ${key} 的类型不正确。`);
    });
  }

  function payloadOf(backup) {
    return {
      format: backup.format,
      schemaVersion: backup.schemaVersion,
      appVersion: backup.appVersion,
      exportedAt: backup.exportedAt,
      storage: backup.storage
    };
  }

  function bytesToHex(buffer) {
    return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function digest(text, cryptoObject) {
    const subtle = cryptoObject?.subtle;
    if (!subtle) throw new Error('当前浏览器不能完成备份完整性校验。');
    const encoded = new TextEncoder().encode(text);
    return bytesToHex(await subtle.digest('SHA-256', encoded));
  }

  async function create(storage, options = {}) {
    const backup = {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      appVersion: String(options.appVersion || 'unknown'),
      exportedAt: (options.now || new Date()).toISOString(),
      storage: collect(storage)
    };
    validateStorage(backup.storage);
    backup.integrity = {
      algorithm: 'SHA-256',
      value: await digest(JSON.stringify(payloadOf(backup)), options.crypto || globalThis.crypto)
    };
    return backup;
  }

  async function parse(text, options = {}) {
    let backup;
    try { backup = JSON.parse(text); }
    catch (_) { throw new Error('这不是有效的 Sideleaf 备份文件。'); }
    if (!isPlainObject(backup) || backup.format !== FORMAT) throw new Error('这不是 Sideleaf 的完整备份。');
    if (!Number.isInteger(backup.schemaVersion) || backup.schemaVersion < 1) throw new Error('备份版本信息不正确。');
    if (backup.schemaVersion > SCHEMA_VERSION) throw new Error('这份备份来自更新版 Sideleaf，请先更新应用再恢复。');
    if (typeof backup.exportedAt !== 'string' || Number.isNaN(Date.parse(backup.exportedAt))) throw new Error('备份时间信息不正确。');
    validateStorage(backup.storage);
    if (backup.integrity?.algorithm !== 'SHA-256' || typeof backup.integrity?.value !== 'string') {
      throw new Error('这份备份缺少完整性校验，已停止恢复。');
    }
    const actual = await digest(JSON.stringify(payloadOf(backup)), options.crypto || globalThis.crypto);
    if (actual !== backup.integrity.value.toLowerCase()) throw new Error('备份内容与校验值不一致，文件可能不完整。');
    return backup;
  }

  function replace(storage, nextStorage) {
    validateStorage(nextStorage);
    const previous = collect(storage);
    const apply = snapshot => {
      const existingKeys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) existingKeys.push(key);
      }
      existingKeys.forEach(key => storage.removeItem(key));
      Object.entries(snapshot).forEach(([key, value]) => storage.setItem(key, value));
    };
    try {
      apply(nextStorage);
      const written = collect(storage);
      const expectedEntries = Object.entries(nextStorage).sort(([left], [right]) => left.localeCompare(right));
      const writtenEntries = Object.entries(written);
      if (JSON.stringify(writtenEntries) !== JSON.stringify(expectedEntries)) throw new Error('恢复后的数据复核没有通过。');
    } catch (error) {
      try { apply(previous); } catch (_) {}
      throw error;
    }
    return function undo() { apply(previous); };
  }

  return {
    FORMAT,
    SCHEMA_VERSION,
    KEY_PREFIX,
    collect,
    summarize,
    create,
    parse,
    replace
  };
});
