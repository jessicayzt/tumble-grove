import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSoundBank, pickRate, semitonesToRate } from '../js/audio.js';

function fakeContext() {
  const started = [];
  const node = (extra = {}) => ({
    connections: [],
    connect(target) { this.connections.push(target); },
    disconnect() {},
    ...extra,
  });
  return {
    state: 'suspended',
    resumed: 0,
    destination: { kind: 'destination' },
    started,
    async resume() { this.resumed++; this.state = 'running'; },
    createGain() { return node({ gain: { value: 1 } }); },
    createDynamicsCompressor() { return node({ kind: 'compressor' }); },
    createBufferSource() {
      const src = node({
        buffer: null,
        playbackRate: { value: 1 },
        onended: null,
        start() { started.push(this); },
      });
      return src;
    },
  };
}

const okFetch = (url) => Promise.resolve({ ok: true, arrayBuffer: async () => ({ url }) });
const decode = async (bytes) => ({ decoded: bytes.url });
const SOURCES = {
  jump: { url: 'audio/jump.wav', volume: 1, pitchSemitones: 2 },
  crunch: { url: 'audio/crunch.wav', volume: 0.5, pitchSemitones: 2 },
};

test('semitone helpers', () => {
  assert.equal(semitonesToRate(0), 1);
  assert.ok(Math.abs(semitonesToRate(12) - 2) < 1e-12);
  assert.equal(pickRate(2, () => 0.5), 1);
  assert.ok(Math.abs(pickRate(2, () => 1) - semitonesToRate(2)) < 1e-12);
  assert.ok(Math.abs(pickRate(2, () => 0) - semitonesToRate(-2)) < 1e-12);
});

test('nothing plays before the first user gesture unlocks audio', async () => {
  const ctx = fakeContext();
  const bank = createSoundBank(SOURCES, { createContext: () => ctx, decode, fetchFn: okFetch });
  await bank.ready;
  assert.equal(bank.has('jump'), true);
  assert.equal(bank.play('jump'), false);
  assert.equal(ctx.started.length, 0);
  assert.equal(bank.unlocked, false);
});

test('unlock creates the context once and resumes it; plays apply volume and a slight pitch change', async () => {
  const ctx = fakeContext();
  let created = 0;
  const rolls = [0.0, 1.0, 0.5];
  let i = 0;
  const bank = createSoundBank(SOURCES, {
    createContext: () => { created++; return ctx; },
    decode, fetchFn: okFetch, rng: () => rolls[i++ % rolls.length],
  });
  await bank.ready;
  assert.equal(bank.unlock(), true);
  assert.equal(bank.unlock(), true);
  assert.equal(created, 1);
  await Promise.resolve();
  assert.ok(ctx.resumed >= 1, 'suspended context gets resumed');

  assert.equal(bank.play('crunch'), true);
  assert.equal(bank.play('crunch'), true);
  assert.equal(bank.play('jump'), true);
  assert.equal(ctx.started.length, 3);
  const [c1, c2, j1] = ctx.started;
  assert.equal(c1.buffer.decoded, 'audio/crunch.wav');
  assert.equal(c1.connections[0].gain.value, 0.5, 'crunch at half volume');
  assert.equal(j1.connections[0].gain.value, 1, 'jump at full volume');
  const lo = semitonesToRate(-2); const hi = semitonesToRate(2);
  assert.ok(Math.abs(c1.playbackRate.value - lo) < 1e-12);
  assert.ok(Math.abs(c2.playbackRate.value - hi) < 1e-12);
  assert.equal(j1.playbackRate.value, 1);
  for (const s of ctx.started) {
    assert.ok(s.playbackRate.value >= lo - 1e-12 && s.playbackRate.value <= hi + 1e-12);
  }
  assert.equal(bank.play('nope'), false);
});

test('a sample that fails to load is skipped without breaking the others', async () => {
  const ctx = fakeContext();
  const fetchFn = (url) => (url.includes('crunch')
    ? Promise.resolve({ ok: false, status: 404 })
    : okFetch(url));
  const origWarn = console.warn; const warned = [];
  console.warn = (...a) => warned.push(a);
  try {
    const bank = createSoundBank(SOURCES, { createContext: () => ctx, decode, fetchFn });
    await bank.ready;
    bank.unlock();
    assert.equal(bank.play('crunch'), false);
    assert.equal(bank.play('jump'), true);
    assert.equal(warned.length, 1);
  } finally {
    console.warn = origWarn;
  }
});

test('audio failing entirely leaves the bank inert rather than throwing', async () => {
  const bank = createSoundBank(SOURCES, {
    createContext: () => { throw new Error('no audio device'); }, decode, fetchFn: okFetch,
  });
  await bank.ready;
  const origWarn = console.warn; console.warn = () => {};
  try {
    assert.equal(bank.unlock(), false);
    assert.equal(bank.play('jump'), false);
  } finally {
    console.warn = origWarn;
  }
});
