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
    'sideleaf.likes.v1',
    'sideleaf.reading-lines.v1',
    'sideleaf.chapter-journals.v1',
    'sideleaf.read-requests.v1',
    'sideleaf.hidden-built-ins.v1'
  ]);
  let timer = 0;
  let inFlight = null;
  let queuedSync = null;
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
      if (key === 'sideleaf.likes.v1') snapshot.likes = parseJson(raw, []);
      if (key === 'sideleaf.read-requests.v1') snapshot.requests = parseJson(raw, []);
    });
    return snapshot;
  }

  function applyServerState(storage, state) {
    if (!state || typeof state !== 'object') return false;
    let changed = false;
    if (state.readingLines && typeof state.readingLines === 'object') {
      const local = parseJson(storage.getItem('sideleaf.reading-lines.v1'), {});
      Object.entries(state.readingLines).forEach(([bookId, incoming]) => {
        if (!incoming?.zheng) return;
        local[bookId] = {
          ...(local[bookId] || {}),
          zheng:{ ...(local[bookId]?.zheng || {}), ...incoming.zheng },
          schemaVersion:2,
          updatedAt:Math.max(Number(local[bookId]?.updatedAt || 0), Number(incoming.zheng.updatedAt || 0))
        };
        changed = true;
      });
      if (changed) storage.setItem('sideleaf.reading-lines.v1', JSON.stringify(local));
    }
    if (Array.isArray(state.notes) && state.notes.length) {
      const localNotes = parseJson(storage.getItem('sideleaf.notes.v1'), []);
      const notes = Array.isArray(localNotes) ? localNotes : [];
      const byId = new Map(notes.map((note, index) => [note.id, index]));
      state.notes.forEach(note => {
        if (!note || note.author !== 'zheng' || typeof note.id !== 'string') return;
        const index = byId.get(note.id);
        if (index === undefined) {
          byId.set(note.id, notes.length);
          notes.push(note);
        } else {
          notes[index] = { ...notes[index], ...note };
        }
        changed = true;
      });
      storage.setItem('sideleaf.notes.v1', JSON.stringify(notes));
    }
    if (Array.isArray(state.journals) && state.journals.length) {
      const localJournals = parseJson(storage.getItem('sideleaf.chapter-journals.v1'), []);
      const journals = Array.isArray(localJournals) ? localJournals : [];
      const byChapter = new Map(journals.map((journal, index) => [`${journal.bookId}:${journal.chapterKey}`, index]));
      let journalsChanged = false;
      state.journals.forEach(journal => {
        if (!journal?.bookId || !journal?.chapterKey) return;
        const key = `${journal.bookId}:${journal.chapterKey}`;
        const index = byChapter.get(key);
        if (index === undefined) {
          byChapter.set(key, journals.length);
          journals.push(journal);
          journalsChanged = true;
          return;
        }
        if (Number(journal.updatedAt || 0) > Number(journals[index]?.updatedAt || 0)) {
          journals[index] = { ...journals[index], ...journal };
          journalsChanged = true;
        }
      });
      if (journalsChanged) {
        storage.setItem('sideleaf.chapter-journals.v1', JSON.stringify(journals));
        changed = true;
      }
    }
    if (Array.isArray(state.likes)) {
      const localLikes = parseJson(storage.getItem('sideleaf.likes.v1'), []);
      let likes = Array.isArray(localLikes) ? localLikes : [];
      if (state.likesReplaceZheng) likes = likes.filter(like => like?.author !== 'zheng');
      const byId = new Map(likes.map((like, index) => [like.id, index]));
      state.likes.forEach(like => {
        if (!like?.id || like.author !== 'zheng') return;
        const index = byId.get(like.id);
        if (index === undefined) {
          byId.set(like.id, likes.length);
          likes.push(like);
        } else {
          likes[index] = { ...likes[index], ...like };
        }
      });
      storage.setItem('sideleaf.likes.v1', JSON.stringify(likes));
      changed = true;
    }
    if (Array.isArray(state.requests) && state.requests.length) {
      const localRequests = parseJson(storage.getItem('sideleaf.read-requests.v1'), []);
      const requests = Array.isArray(localRequests) ? localRequests : [];
      const byId = new Map(requests.map((request, index) => [request.id, index]));
      state.requests.forEach(request => {
        const index = byId.get(request?.id);
        if (index === undefined) return;
        requests[index] = { ...requests[index], ...request };
        changed = true;
      });
      storage.setItem('sideleaf.read-requests.v1', JSON.stringify(requests));
    }
    if (changed && typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent('sideleaf:core-state', { detail:state }));
    }
    return changed;
  }

  async function syncNow(storage, options = {}) {
    if (inFlight) {
      if (!options.queueIfBusy) return inFlight;
      queuedSync = {
        storage,
        options:{ ...options, queueIfBusy:false }
      };
      await inFlight;
      if (inFlight) return inFlight;
      const queued = queuedSync;
      queuedSync = null;
      return queued ? syncNow(queued.storage, queued.options) : { ok:true, queued:true };
    }
    clearTimeout(timer);
    const auth = readAuth(storage);
    const dirty = readDirty(storage);
    if (!auth) return { ok:false, skipped:true };
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
        applyServerState(storage, result.state);
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

  async function coreRequest(storage, path, options = {}) {
    const auth = readAuth(storage);
    if (!auth) throw new Error('请先连接 Sideleaf Core。');
    const fetchImpl = options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('这台设备暂时不能连接 Sideleaf Core。');
    const response = await fetchImpl(`${normalizeCoreUrl(auth.baseUrl)}${path}`, {
      method:options.method || 'GET',
      headers:{
        authorization:`Bearer ${auth.token}`,
        ...(options.body === undefined ? {} : { 'content-type':'application/json' })
      },
      ...(options.body === undefined ? {} : { body:JSON.stringify(options.body) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) emit('authorization-error');
      throw new Error(result.error || `Core 请求失败（HTTP ${response.status}）。`);
    }
    return result;
  }

  async function recoveryOverview(storage, options = {}) {
    return coreRequest(storage, '/api/device/recovery', options);
  }

  async function fetchRecoveryBackup(storage, snapshotId = null, options = {}) {
    const path = snapshotId
      ? `/api/device/recovery/snapshots/${encodeURIComponent(snapshotId)}`
      : '/api/device/recovery/current';
    const result = await coreRequest(storage, path, options);
    return result.backup;
  }

  async function createRecoverySnapshot(storage, reason = '愿手动保存', options = {}) {
    return coreRequest(storage, '/api/device/recovery/snapshots', {
      ...options,
      method:'POST',
      body:{ reason }
    });
  }

  async function pinRecoverySnapshot(storage, snapshotId, pinned, options = {}) {
    return coreRequest(storage, `/api/device/recovery/snapshots/${encodeURIComponent(snapshotId)}/pin`, {
      ...options,
      method:'POST',
      body:{ pinned:Boolean(pinned) }
    });
  }

  async function restoreRecoverySnapshot(storage, snapshotId, options = {}) {
    return coreRequest(storage, `/api/device/recovery/snapshots/${encodeURIComponent(snapshotId)}/restore`, {
      ...options,
      method:'POST'
    });
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

  return {
    AUTH_KEY, DIRTY_KEY, DELETIONS_KEY, SYNCABLE_KEYS,
    markDirty, queueDeletion, syncNow, pairWithCode, acceptPairing, start, status,
    recoveryOverview, fetchRecoveryBackup, createRecoverySnapshot, pinRecoverySnapshot, restoreRecoverySnapshot,
    snapshotFor, applyServerState
  };
});
