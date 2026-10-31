// Persistence for Tumble Grove.
//
// Everything lives under one key in chrome.storage.sync so the sloth count
// and how much each sloth has eaten follow the user across devices. When the
// page is opened outside an extension (e.g. file:// while developing) it
// falls back to localStorage so the scene still works.
//
// chrome.storage.sync is rate limited (120 writes/min, 1800/hour), so writes
// are debounced and spaced out; the state is tiny (< 1 KB for 20 sloths).

export const STORAGE_KEY = 'tumbleGrove';
export const SCHEMA_VERSION = 1;
export const MIN_SLOTHS = 1;
export const MAX_SLOTHS = 20;
export const DEFAULT_SLOTHS = 3;
export const MAX_EATEN_STORED = 9999;

const DEBOUNCE_MS = 800;       // wait for a burst of changes to settle
const MIN_WRITE_GAP_MS = 3000;  // never write more often than this
const MAX_RETRY_GAP_MS = 60000; // back off up to this after repeated failures
const MAX_LOGGED_FAILURES = 3;

export function newId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function clampCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_SLOTHS;
  return Math.min(MAX_SLOTHS, Math.max(MIN_SLOTHS, v));
}

export function defaultState() {
  const sloths = [];
  for (let i = 0; i < DEFAULT_SLOTHS; i++) sloths.push({ id: newId(), eaten: 0 });
  return { v: SCHEMA_VERSION, count: DEFAULT_SLOTHS, sloths };
}

/** Coerce anything read from storage into a well-formed state, or null. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sloths = Array.isArray(raw.sloths) ? raw.sloths : [];
  const seen = new Set();
  const clean = [];
  for (const s of sloths) {
    if (!s || typeof s !== 'object') continue;
    const id = typeof s.id === 'string' && s.id ? s.id : newId();
    if (seen.has(id)) continue;
    seen.add(id);
    const eaten = Math.min(MAX_EATEN_STORED, Math.max(0, Math.floor(Number(s.eaten) || 0)));
    clean.push({ id, eaten });
  }
  const hasCount = Number.isFinite(Number(raw.count));
  if (!hasCount && clean.length === 0) return null; // nothing usable in here
  let count = clampCount(hasCount ? raw.count : clean.length);
  // Keep the roster and the count consistent.
  while (clean.length < count) clean.push({ id: newId(), eaten: 0 });
  if (clean.length > count) clean.length = count;
  return { v: SCHEMA_VERSION, count, sloths: clean };
}

/**
 * Merge a state that arrived from another tab/device into the local one.
 * The remote roster wins (it reflects the latest slider position), but a
 * sloth's `eaten` only ever grows, so take the max to avoid losing a meal
 * this tab served while the remote write was in flight.
 */
export function mergeStates(local, remote) {
  const r = normalizeState(remote);
  if (!r) return local;
  if (!local) return r;
  const byId = new Map(local.sloths.map((s) => [s.id, s]));
  return {
    v: SCHEMA_VERSION,
    count: r.count,
    sloths: r.sloths.map((s) => {
      const mine = byId.get(s.id);
      return { id: s.id, eaten: mine ? Math.max(mine.eaten, s.eaten) : s.eaten };
    }),
  };
}

export function serialize(state) {
  return JSON.stringify({
    v: SCHEMA_VERSION,
    count: state.count,
    sloths: state.sloths.map((s) => ({ id: s.id, eaten: s.eaten })),
  });
}

/* ------------------------------------------------------------------ */
/* Backends                                                            */
/* ------------------------------------------------------------------ */

function chromeSyncBackend() {
  const area = chrome.storage.sync;
  return {
    name: 'chrome.storage.sync',
    async get() {
      const res = await area.get(STORAGE_KEY);
      return res ? res[STORAGE_KEY] : undefined;
    },
    async set(value) {
      await area.set({ [STORAGE_KEY]: value });
    },
    onChange(cb) {
      const handler = (changes, areaName) => {
        if (areaName !== 'sync' || !(STORAGE_KEY in changes)) return;
        cb(changes[STORAGE_KEY].newValue);
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

function localStorageBackend() {
  return {
    name: 'localStorage',
    async get() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    },
    async set(value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    },
    onChange(cb) {
      const handler = (e) => {
        if (e.key !== STORAGE_KEY) return;
        try {
          cb(e.newValue ? JSON.parse(e.newValue) : undefined);
        } catch {
          /* ignore malformed */
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

export function pickBackend() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    return chromeSyncBackend();
  }
  return localStorageBackend();
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

/**
 * A small store with debounced, rate-limited writes.
 *
 *   const store = createStore();
 *   const { state, fromDefaults } = await store.load();  // state is never null
 *   store.save(state);                           // schedules a write
 *   store.onRemoteChange((remote) => {...});     // other tabs / devices
 */
export function createStore(backend = pickBackend(), timers = globalThis) {
  let timer = null;
  let pending = null;
  let lastWriteAt = -Infinity;
  let lastWritten = null; // serialized form of what we last sent, to ignore echoes
  let writing = false;
  let failures = 0;

  async function flushNow() {
    if (timer) {
      timers.clearTimeout(timer);
      timer = null;
    }
    if (!pending || writing) return;
    const payload = pending;
    pending = null;
    writing = true;
    try {
      lastWritten = serialize(payload);
      lastWriteAt = Date.now();
      await backend.set(JSON.parse(lastWritten));
      failures = 0;
    } catch (err) {
      failures += 1;
      if (failures <= MAX_LOGGED_FAILURES) {
        console.warn('[Tumble Grove] save failed, will retry:', err);
      }
      if (!pending) pending = payload; // retry on the next schedule
      const backoff = Math.min(MAX_RETRY_GAP_MS, MIN_WRITE_GAP_MS * 2 ** (failures - 1));
      timer = timers.setTimeout(flushNow, backoff);
    } finally {
      writing = false;
    }
    if (pending && !timer) schedule();
  }

  function schedule() {
    if (timer) timers.clearTimeout(timer);
    const wait = Math.max(DEBOUNCE_MS, lastWriteAt + MIN_WRITE_GAP_MS - Date.now());
    timer = timers.setTimeout(flushNow, wait);
  }

  return {
    backendName: backend.name,

    /** Resolves to { state, fromDefaults }; `state` is always well-formed. */
    async load() {
      let raw;
      try {
        raw = await backend.get();
      } catch (err) {
        console.warn('[Tumble Grove] load failed, using defaults:', err);
      }
      const stored = normalizeState(raw);
      return stored ? { state: stored, fromDefaults: false } : { state: defaultState(), fromDefaults: true };
    },

    /** Queue `state` to be written. Later calls replace earlier pending ones. */
    save(state) {
      pending = { v: SCHEMA_VERSION, count: state.count, sloths: state.sloths.map((s) => ({ id: s.id, eaten: s.eaten })) };
      schedule();
    },

    /** Write immediately (e.g. when the tab is being hidden). */
    flush: flushNow,

    hasPending() {
      return pending !== null;
    },

    /** cb(remoteState) for changes made elsewhere; our own writes are filtered out. */
    onRemoteChange(cb) {
      return backend.onChange((value) => {
        if (value === undefined) return;
        try {
          if (lastWritten && serialize(normalizeState(value)) === lastWritten) return;
        } catch {
          /* fall through and deliver */
        }
        cb(value);
      });
    },
  };
}
