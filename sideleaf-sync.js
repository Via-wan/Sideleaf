(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SideleafSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AUTH_KEY = '__sideleaf_core_auth_v1';
  const DIRTY_KEY = '__sideleaf_core_dirty_v1';
  const DELETIONS_KEY = '__sideleaf_core_deletions_v1';
  const SYNCABLE_KEYS = Object.freeze([
    'sideleaf.books.v1',
    'sideleaf.settings.v1',
    'sideleaf.notes.v1',
    'sideleaf.reading-lines.v1',
    'sideleaf.chapter-journals.v1',
    'sideleaf.read-requests.v1'
  ]);
  let timer = 0;
  let inFlight = null;
  let statusListener = null;
  let dirtyRevision = 0;

  function parseJson(raw, fallback) {
    try { return JSON.parse(raw ?? '') ?? fallback; }
    catch (_) { return fallback; }
  }

  function readAuth(storage) {
    const auth = parseJson(storage.getItem(AUTH_KEY), null);
    if (!auth || typeof auth.baseUrl !== 'string' || typeof auth.token !== 'string') return null;
    return auth;
  }

  function readDirty(storage) {
    const dirty = parseJson(storage.getItem(DIRTY_KEY), {});
    return dirty && typeof dirty === 'object' && !Array.isArray(dirty) ? dirty : {};
  }

  function emit(state, detail = '') {
    if (typeof statusListener === 'function') statusListener({ state, detail });
  }

  function normalizeCoreUrl(raw) {
    const url = new URL(String(raw || ''));
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
      throw new Error('Sideleaf Core 必须使用 HTTPS。');
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  function markDirty(storage, keys = SYNCABLE_KEYS) {
    const dirty = readDirty(storage);
    const stamp = `${Date.now()}-${dirtyRevision += 1}`;
    keys.filter(key => SYNCABLE_KEYS.includes(key) || key === DELETIONS_KEY).forEach(key => { dirty[key] = stamp; });
    storage.setItem(DIRTY_KEY, JSON.stringify(dirty));
    schedule(storage);
  }

  function snapshotFor(storage, dirty) {
    const snapshot = { clientStorage: {} };
    Object.keys(dirty).forEach(key => {
      const raw = storage.getItem(key);
      if (raw === null) return;
      if (key === DELETIONS_KEY) {
        snapshot.deletions = parseJson(raw, []);
        return;
      }
      snapshot.clientStorage[key] = raw;
      if (key === 'sideleaf.books.v1') snapshot.books = parseJson(raw, []);
      if (key === 'sideleaf.reading-lines.v1') snapshot.readingLines = parseJson(raw, {});
      if (key === 'sideleaf.notes.v1') snapshot.notes = parseJson(raw, []);
      if (key === 'sideleaf.chapter-journals.v1') snapshot.journals = parseJson(raw, []);
      if (key === 'sideleaf.read-requests.v1') snapshot.requests = parseJson(raw, []);
    });
    return snapshot;
  }

  async function syncNow(storage, options = {}) {
    if (inFlight) return inFlight;
    clearTimeout(timer);
    const auth = readAuth(storage);
    const dirty = readDirty(storage);
    if (!auth || !Object.keys(dirty).length) return { ok:false, skipped:true };
    const fetchImpl = options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') return { ok:false, skipped:true };
    inFlight = (async () => {
      emit('syncing');
      try {
        const response = await fetchImpl(`${normalizeCoreUrl(auth.baseUrl)}/api/device/sync`, {
          method:'POST',
          headers:{ authorization:`Bearer ${auth.token}`, 'content-type':'application/json' },
          body:JSON.stringify(snapshotFor(storage, dirty))
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) emit('authorization-error');
          throw new Error(result.error || `同步失败（HTTP ${response.status}）。`);
        }
        const current = readDirty(storage);
        Object.entries(dirty).forEach(([key, stamp]) => {
          if (current[key] === stamp) {
            delete current[key];
            if (key === DELETIONS_KEY) storage.removeItem(DELETIONS_KEY);
          }
        });
        storage.setItem(DIRTY_KEY, JSON.stringify(current));
        storage.setItem(AUTH_KEY, JSON.stringify({ ...auth, lastSyncedAt:Date.now() }));
        emit('synced');
        return result;
      } catch (error) {
        emit('offline', error.message || '同步暂时未完成。');
        return { ok:false, error };
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function schedule(storage, delay = 1200) {
    if (!readAuth(storage)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { syncNow(storage); }, delay);
  }

  function queueDeletion(storage, deletion) {
    if (!deletion || typeof deletion.id !== 'string' || !deletion.id) return;
    const existing = parseJson(storage.getItem(DELETIONS_KEY), []);
    const deletions = Array.isArray(existing) ? existing : [];
    const key = `${deletion.entity}:${deletion.id}`;
    if (!deletions.some(item => `${item.entity}:${item.id}` === key)) deletions.push(deletion);
    storage.setItem(DELETIONS_KEY, JSON.stringify(deletions));
    markDirty(storage, [DELETIONS_KEY]);
  }

  async function pairWithCode(storage, options = {}) {
    const baseUrl = normalizeCoreUrl(options.baseUrl);
    const code = String(options.code || '').trim();
    if (!code) throw new Error('请先粘贴一次性配对码。');
    const fetchImpl = options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('这台设备暂时不能连接 Sideleaf Core。');
    emit('pairing');
    const response = await fetchImpl(`${baseUrl}/api/device/pair`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ code })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.token !== 'string') {
      emit('pairing-error', result.error || '配对没有完成。');
      throw new Error(result.error || '配对没有完成。');
    }
    storage.setItem(AUTH_KEY, JSON.stringify({
      baseUrl,
      token:result.token,
      deviceId:result.deviceId,
      deviceName:result.deviceName,
      connectedAt:Date.now()
    }));
    markDirty(storage, SYNCABLE_KEYS);
    await syncNow(storage, { fetch:fetchImpl });
    emit('connected');
    return true;
  }

  async function acceptPairing(storage, options = {}) {
    const locationObject = options.location || globalThis.location;
    if (!locationObject?.href) return false;
    const current = new URL(locationObject.href);
    const code = current.searchParams.get('sideleaf_pair');
    const rawCore = current.searchParams.get('sideleaf_core');
    if (!code || !rawCore) return false;
    await pairWithCode(storage, { baseUrl:rawCore, code, fetch:options.fetch });
    current.searchParams.delete('sideleaf_pair');
    current.searchParams.delete('sideleaf_core');
    const historyObject = options.history || globalThis.history;
    historyObject?.replaceState?.(null, '', `${current.pathname}${current.search}${current.hash}`);
    return true;
  }

  async function start(storage, options = {}) {
    statusListener = options.onStatus || statusListener;
    try { await acceptPairing(storage, options); }
    catch (_) { return; }
    await syncNow(storage, options);
    if (typeof globalThis.addEventListener === 'function' && !start.listenersAdded) {
      globalThis.addEventListener('online', () => syncNow(storage));
      globalThis.addEventListener('visibilitychange', () => {
        if (!globalThis.document || globalThis.document.visibilityState === 'visible') syncNow(storage);
      });
      start.listenersAdded = true;
    }
  }

  function status(storage) {
    const auth = readAuth(storage);
    const dirty = readDirty(storage);
    return {
      connected:Boolean(auth),
      deviceName:auth?.deviceName || '',
      lastSyncedAt:Number(auth?.lastSyncedAt || 0),
      pending:Object.keys(dirty).length
    };
  }

  return { AUTH_KEY, DIRTY_KEY, DELETIONS_KEY, SYNCABLE_KEYS, markDirty, queueDeletion, syncNow, pairWithCode, acceptPairing, start, status, snapshotFor };
});
