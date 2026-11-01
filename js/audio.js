// Sound effects for Tumble Grove, played through the Web Audio API.
//
// Samples are fetched and decoded as soon as the page loads (decoding uses
// an OfflineAudioContext, which needs no user gesture). The real AudioContext
// is created on the first click, which Chrome's autoplay policy requires, so
// `unlock()` must be called from a pointer handler before `play()` can be
// heard. Each play gets its own gain (per-sound volume) and a small random
// playback-rate change so repeated sounds don't feel identical.

/** Playback rate for a pitch shift of `semitones`. */
export function semitonesToRate(semitones) {
  return 2 ** (semitones / 12);
}

/** Random playback rate within +/- `semitones` of the original pitch. */
export function pickRate(semitones, rng = Math.random) {
  return semitonesToRate((rng() * 2 - 1) * semitones);
}

function defaultDecode(bytes) {
  // Any sample rate works: buffer sources resample to the playing context.
  const decoder = new OfflineAudioContext(1, 1, 44100);
  return decoder.decodeAudioData(bytes);
}

/**
 * @param sources  { name: { url, volume = 1, pitchSemitones = 0 } }
 * @param deps     test seams: createContext(), decode(arrayBuffer), fetchFn, rng
 */
export function createSoundBank(sources, deps = {}) {
  const {
    createContext = () => new AudioContext(),
    decode = defaultDecode,
    fetchFn = (url) => fetch(url),
    rng = Math.random,
  } = deps;

  const buffers = new Map();
  let ctx = null;
  let master = null;

  const ready = Promise.all(
    Object.entries(sources).map(async ([name, spec]) => {
      try {
        const res = await fetchFn(spec.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffers.set(name, await decode(await res.arrayBuffer()));
      } catch (err) {
        console.warn(`[Tumble Grove] sound "${name}" unavailable:`, err);
      }
    }),
  );

  /** Call from a user gesture (e.g. pointerdown). Safe to call repeatedly. */
  function unlock() {
    if (!ctx) {
      try {
        ctx = createContext();
        master = ctx.createGain();
        master.gain.value = 1;
        // A compressor keeps a pile-up of simultaneous crunches from clipping.
        const limiter = ctx.createDynamicsCompressor();
        master.connect(limiter);
        limiter.connect(ctx.destination);
      } catch (err) {
        console.warn('[Tumble Grove] audio unavailable:', err);
        ctx = null;
        return false;
      }
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    return true;
  }

  /** Play `name` once. Returns false if audio isn't unlocked or loaded yet. */
  function play(name) {
    const buffer = buffers.get(name);
    if (!ctx || !buffer) return false;
    const spec = sources[name];
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pickRate(spec.pitchSemitones ?? 0, rng);
    const gain = ctx.createGain();
    gain.gain.value = spec.volume ?? 1;
    source.connect(gain);
    gain.connect(master);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return true;
  }

  return {
    unlock,
    play,
    ready: ready.then(() => undefined),
    get unlocked() {
      return ctx !== null;
    },
    has(name) {
      return buffers.has(name);
    },
  };
}
