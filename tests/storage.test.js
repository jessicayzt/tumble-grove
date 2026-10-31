import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeState, mergeStates, defaultState, clampCount, createStore, serialize,
  MAX_SLOTHS, MIN_SLOTHS, DEFAULT_SLOTHS, STORAGE_KEY,
} from '../js/storage.js';

test('clampCount keeps the slider range', () => {
  assert.equal(clampCount(0), MIN_SLOTHS);
  assert.equal(clampCount(99), MAX_SLOTHS);
  assert.equal(clampCount('7'), 7);
  assert.equal(clampCount('nope'), DEFAULT_SLOTHS);
});

test('defaultState has the default number of fresh sloths', () => {
  const s = defaultState();
  assert.equal(s.count, DEFAULT_SLOTHS);
  assert.equal(s.sloths.length, DEFAULT_SLOTHS);
  assert.ok(s.sloths.every((x) => x.eaten === 0 && typeof x.id === 'string'));
});

test('normalizeState repairs odd input', () => {
  assert.equal(normalizeState(null), null);
  assert.equal(normalizeState('junk'), null);
  const s = normalizeState({ count: 4, sloths: [{ id: 'a', eaten: 3.7 }, { id: 'a', eaten: 9 }, { eaten: -2 }] });
  assert.equal(s.count, 4);
  assert.equal(s.sloths.length, 4, 'padded to count');
  assert.equal(s.sloths[0].eaten, 3, 'floored');
  assert.equal(s.sloths[1].eaten, 0, 'negative clamped, id generated');
  assert.equal(new Set(s.sloths.map((x) => x.id)).size, 4, 'ids unique');
  const t = normalizeState({ count: 1, sloths: [{ id: 'a', eaten: 1 }, { id: 'b', eaten: 2 }] });
  assert.equal(t.sloths.length, 1, 'trimmed to count');
  assert.equal(normalizeState({}), null, 'empty object is not a state');
  assert.equal(normalizeState([]), null);
  assert.equal(normalizeState({ sloths: 'x' }), null);
  const u = normalizeState({ sloths: [{ id: 'a', eaten: 2 }, { id: 'b', eaten: 0 }] });
  assert.equal(u.count, 2, 'missing count falls back to the roster size');
});

test('mergeStates takes the remote roster but never loses a meal', () => {
  const local = { count: 3, sloths: [{ id: 'a', eaten: 5 }, { id: 'b', eaten: 1 }, { id: 'c', eaten: 0 }] };
  const remote = { count: 2, sloths: [{ id: 'a', eaten: 4 }, { id: 'b', eaten: 2 }] };
  const m = mergeStates(local, remote);
  assert.equal(m.count, 2);
  assert.deepEqual(m.sloths, [{ id: 'a', eaten: 5 }, { id: 'b', eaten: 2 }]);
  assert.deepEqual(mergeStates(local, null), local);
  assert.deepEqual(mergeStates(null, remote).sloths, remote.sloths);
});

function fakeBackend() {
  const listeners = new Set();
  const be = {
    name: 'fake',
    stored: undefined,
    sets: [],
    failNext: false,
    async get() { return this.stored; },
    async set(v) {
      if (this.failNext) { this.failNext = false; throw new Error('quota'); }
      this.sets.push(v); this.stored = v;
    },
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    emit(v) { for (const cb of listeners) cb(v); },
  };
  return be;
}

function fakeTimers() {
  let now = 0; const queue = [];
  return {
    setTimeout(fn, ms) { const id = Symbol(); queue.push({ id, at: now + ms, fn }); return id; },
    clearTimeout(id) { const i = queue.findIndex((q) => q.id === id); if (i >= 0) queue.splice(i, 1); },
    async advance(ms) {
      now += ms;
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= now) { const q = queue.shift(); await q.fn(); }
      await Promise.resolve();
    },
    pending() { return queue.length; },
  };
}

test('store loads defaults when nothing is stored and debounces writes', async () => {
  const be = fakeBackend(); const timers = fakeTimers();
  const store = createStore(be, timers);
  const { state, fromDefaults } = await store.load();
  assert.equal(fromDefaults, true);
  assert.equal(state.count, DEFAULT_SLOTHS);
  state.sloths[0].eaten = 1; store.save(state);
  state.sloths[0].eaten = 2; store.save(state);
  state.sloths[0].eaten = 3; store.save(state);
  assert.equal(be.sets.length, 0, 'nothing written yet');
  await timers.advance(1000);
  assert.equal(be.sets.length, 1, 'one coalesced write');
  assert.equal(be.sets[0].sloths[0].eaten, 3);
  assert.equal(be.sets[0].count, DEFAULT_SLOTHS);
});

test('store reports a stored state as not-from-defaults', async () => {
  const be = fakeBackend(); const timers = fakeTimers();
  be.stored = { v: 1, count: 2, sloths: [{ id: 'p', eaten: 7 }, { id: 'q', eaten: 0 }] };
  const { state, fromDefaults } = await createStore(be, timers).load();
  assert.equal(fromDefaults, false);
  assert.deepEqual(state.sloths.map((s) => s.id), ['p', 'q']);
  be.stored = { junk: true };
  assert.equal((await createStore(be, timers).load()).fromDefaults, true, 'garbage falls back to defaults');
});

test('store spaces writes out and retries after a failure', async () => {
  const be = fakeBackend(); const timers = fakeTimers();
  const store = createStore(be, timers);
  const { state } = await store.load();
  store.save(state); await timers.advance(1000);
  assert.equal(be.sets.length, 1);
  state.count = 5; store.save(state);
  await timers.advance(1000);
  assert.equal(be.sets.length, 1, 'second write waits for the minimum gap');
  await timers.advance(2500);
  assert.equal(be.sets.length, 2);
  be.failNext = true;
  state.count = 6; store.save(state);
  await timers.advance(4000);
  assert.equal(be.sets.length, 2, 'failed write not recorded');
  assert.ok(store.hasPending(), 'kept for retry');
  await timers.advance(4000);
  assert.equal(be.sets.length, 3, 'retried');
  assert.equal(be.sets[2].count, 6);
});

test('store backs off exponentially while writes keep failing', async () => {
  const be = fakeBackend(); const timers = fakeTimers();
  const store = createStore(be, timers);
  const { state } = await store.load();
  const origSet = be.set.bind(be);
  let attempts = 0; let failing = true;
  be.set = async (v) => { attempts++; if (failing) throw new Error('nope'); return origSet(v); };
  store.save(state);
  await timers.advance(1000);                 // 1st attempt fails -> retry in 3 s
  assert.equal(attempts, 1);
  await timers.advance(3000);                 // 2nd fails -> retry in 6 s
  assert.equal(attempts, 2);
  await timers.advance(3000);
  assert.equal(attempts, 2, 'not yet: backoff doubled');
  await timers.advance(3000);
  assert.equal(attempts, 3);
  failing = false;
  await timers.advance(12000);
  assert.equal(attempts, 4);
  assert.equal(be.sets.length, 1, 'eventually written');
  assert.equal(store.hasPending(), false);
});

test('a pending write can be replaced after a remote change is merged in', async () => {
  // Tab B has a meal queued; tab A changes the slider first. B must not
  // resurrect the old roster when its timer fires.
  const be = fakeBackend(); const timers = fakeTimers();
  const store = createStore(be, timers);
  let local = { count: 3, sloths: [{ id: 'a', eaten: 0 }, { id: 'b', eaten: 0 }, { id: 'c', eaten: 0 }] };
  local.sloths[0].eaten = 1; store.save(local);        // queued, not yet written
  const remote = { v: 1, count: 2, sloths: [{ id: 'a', eaten: 0 }, { id: 'b', eaten: 0 }] };
  local = mergeStates(local, remote);                  // what main.js does on remote change
  assert.deepEqual(local.sloths, [{ id: 'a', eaten: 1 }, { id: 'b', eaten: 0 }]);
  if (store.hasPending()) store.save(local);           // and re-queues the fresh snapshot
  await timers.advance(1000);
  assert.equal(be.sets.length, 1);
  assert.equal(be.sets[0].count, 2, 'remote slider change survives');
  assert.deepEqual(be.sets[0].sloths, [{ id: 'a', eaten: 1 }, { id: 'b', eaten: 0 }]);
});

test('store ignores echoes of its own writes but delivers remote changes', async () => {
  const be = fakeBackend(); const timers = fakeTimers();
  const store = createStore(be, timers);
  const { state } = await store.load();
  const got = [];
  store.onRemoteChange((v) => got.push(v));
  store.save(state); await timers.advance(1000);
  be.emit(be.stored);                                  // chrome echoes our own set
  assert.equal(got.length, 0);
  const remote = { v: 1, count: 2, sloths: [{ id: 'x', eaten: 1 }, { id: 'y', eaten: 0 }] };
  be.emit(remote);
  assert.equal(got.length, 1);
  assert.equal(serialize(got[0]), serialize(remote));
  assert.equal(STORAGE_KEY, 'tumbleGrove');
});
