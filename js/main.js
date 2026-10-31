// Tumble Grove - New Tab page entry point.
//
// Two stacked canvases: #bg holds the forest (redrawn only on resize) and
// #fg is cleared and redrawn every animation frame with leaves, sloths and
// particles. Everything is simulated in device pixels so pixel art stays
// crisp on high-DPI screens.

import {
  computeWorld, createSloth, resetSloth, stepSloth, slothRect, slothFrame, sortForDraw,
  createLeaf, stepLeaf, eatLeaves, trimLeaves, rescaleSloth, rescaleLeaf,
  spawnParticles, stepParticles,
} from './sim.js';
import { drawBackground } from './scene.js';
import { createStore, mergeStates, clampCount, newId, MIN_SLOTHS, MAX_SLOTHS } from './storage.js';

// The sprite sheet shows the sloth tumbling to the LEFT (its face travels
// counter-clockwise). Sloths heading right are drawn mirrored.
const SPRITE_NATIVE_DIR = -1;

const bg = document.getElementById('bg');
const fg = document.getElementById('fg');
const slider = document.getElementById('sloth-count');
const sliderValue = document.getElementById('sloth-count-value');
const resetButton = document.getElementById('reset');

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function sliceFrames(sheet, info) {
  // Slicing into separate bitmaps avoids neighbouring frames bleeding in
  // when a small sloth is drawn with smoothing on.
  const frames = [];
  for (let i = 0; i < info.frames; i++) {
    const sx = i * info.frameWidth;
    if (typeof createImageBitmap === 'function') {
      frames.push(await createImageBitmap(sheet, sx, 0, info.frameWidth, info.frameHeight));
    } else {
      const c = document.createElement('canvas');
      c.width = info.frameWidth;
      c.height = info.frameHeight;
      c.getContext('2d').drawImage(sheet, -sx, 0);
      frames.push(c);
    }
  }
  return frames;
}

async function main() {
  const [manifest, back, middle, tiles, sheet, leafImg] = await Promise.all([
    fetch('img/manifest.json').then((r) => r.json()),
    loadImage('img/back.png'),
    loadImage('img/middle.png'),
    loadImage('img/tiles.png'),
    loadImage('img/sloth_sheet.png'),
    loadImage('img/leaf.png'),
  ]);
  const frames = await sliceFrames(sheet, manifest.sloth);
  const frameCount = frames.length;
  const leafArt = manifest.leaf; // { width, height, box }
  const images = { back, middle, tiles };

  const bgCtx = bg.getContext('2d');
  const fgCtx = fg.getContext('2d');
  const store = createStore();

  let world = null;
  let sloths = [];
  const leaves = [];
  const particles = [];

  /* ---------------- persistence ---------------- */

  const snapshot = () => ({
    count: sloths.length,
    sloths: sloths.map((s) => ({ id: s.id, eaten: s.eaten })),
  });

  const persist = () => store.save(snapshot());

  function applyState(state) {
    const live = new Map(sloths.map((s) => [s.id, s]));
    sloths = state.sloths.map((rec) => {
      const s = live.get(rec.id);
      if (s) {
        s.eaten = rec.eaten;
        return s;
      }
      return createSloth(rec, world, { frames: frameCount });
    });
    syncSlider();
  }

  function syncSlider() {
    slider.value = String(sloths.length);
    sliderValue.value = String(sloths.length);
    sliderValue.textContent = String(sloths.length);
    slider.setAttribute('aria-valuetext', `${sloths.length} ${sloths.length === 1 ? 'sloth' : 'sloths'}`);
  }

  function setCount(n) {
    n = clampCount(n);
    while (sloths.length < n) sloths.push(createSloth({ id: newId(), eaten: 0 }, world, { frames: frameCount }));
    if (sloths.length > n) sloths.length = n; // newest sloths leave first
    syncSlider();
    persist();
  }

  /* ---------------- layout ---------------- */

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const next = computeWorld(window.innerWidth * dpr, window.innerHeight * dpr);
    if (world && next.w === world.w && next.h === world.h) return;
    for (const c of [bg, fg]) {
      c.width = next.w;
      c.height = next.h;
    }
    if (world) {
      for (const s of sloths) rescaleSloth(s, world, next);
      for (const l of leaves) rescaleLeaf(l, world, next);
      particles.length = 0;
    }
    world = next;
    drawBackground(bgCtx, images, world);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 60);
  });
  // Moving the window to a display with a different pixel density.
  (function watchDpr() {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { resize(); watchDpr(); }, { once: true });
  })();

  /* ---------------- input ---------------- */

  /** Pointer position in device pixels. */
  function devicePoint(e) {
    const rect = fg.getBoundingClientRect();
    const k = world.w / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
  }

  fg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !world) return;
    const { x, y } = devicePoint(e);
    if (y >= world.groundLine) return; // only the air above the ground drops leaves
    leaves.push(createLeaf(x, y, world, leafArt));
    trimLeaves(leaves);
  });

  let cursorInAir = true;
  fg.addEventListener('pointermove', (e) => {
    if (!world) return;
    const inAir = devicePoint(e).y < world.groundLine;
    if (inAir !== cursorInAir) {
      cursorInAir = inAir;
      fg.style.cursor = inAir ? 'crosshair' : 'default';
    }
  });

  slider.min = String(MIN_SLOTHS);
  slider.max = String(MAX_SLOTHS);
  slider.addEventListener('input', () => setCount(slider.value));

  resetButton.addEventListener('click', () => {
    for (const s of sloths) {
      const { x, size } = slothRect(s, world);
      particles.push(...spawnParticles(x + size / 2, world.groundLine - size / 2, world));
      resetSloth(s, newId());
    }
    persist();
  });

  store.onRemoteChange((remote) => {
    applyState(mergeStates(snapshot(), remote));
    // A write queued before this change would resurrect the old roster;
    // replace it with a snapshot that includes what just arrived.
    if (store.hasPending()) persist();
  });

  const flush = () => { if (store.hasPending()) store.flush(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);

  /* ---------------- drawing ---------------- */

  function drawLeaf(ctx, leaf) {
    ctx.imageSmoothingEnabled = false;
    if (leaf.landed || Math.abs(leaf.rot) < 0.02) {
      ctx.drawImage(leafImg, Math.round(leaf.x), Math.round(leaf.y), leaf.w, leaf.h);
      return;
    }
    ctx.save();
    ctx.translate(leaf.x + leaf.w / 2, leaf.y + leaf.h / 2);
    ctx.rotate(leaf.rot);
    ctx.drawImage(leafImg, -leaf.w / 2, -leaf.h / 2, leaf.w, leaf.h);
    ctx.restore();
  }

  function drawSloth(ctx, sloth) {
    const { x, size } = slothRect(sloth, world);
    const sz = Math.max(1, Math.round(size));
    const dx = Math.round(x);
    const dy = world.groundLine - sz; // sprite bottom on the ground line
    const frame = frames[slothFrame(sloth)];
    const downscaling = sz < manifest.sloth.frameWidth;
    ctx.imageSmoothingEnabled = downscaling;
    if (downscaling) ctx.imageSmoothingQuality = 'high';
    if (sloth.dir === SPRITE_NATIVE_DIR) {
      ctx.drawImage(frame, dx, dy, sz, sz);
    } else {
      ctx.save();
      ctx.translate(dx + sz, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, 0, 0, sz, sz);
      ctx.restore();
    }
  }

  function render() {
    const ctx = fgCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, world.w, world.h);
    for (const leaf of leaves) drawLeaf(ctx, leaf);
    for (const sloth of sortForDraw(sloths)) drawSloth(ctx, sloth); // big (back) to small (front)
    const px = world.leafScale;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), px, px);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- loop ---------------- */

  function update(dt) {
    for (const s of sloths) stepSloth(s, dt, world);
    for (const l of leaves) stepLeaf(l, dt, world);
    const meals = eatLeaves(sloths, leaves, world);
    for (const { leaf } of meals) {
      particles.push(...spawnParticles(leaf.x + leaf.w / 2, leaf.y + leaf.h / 2, world));
    }
    if (meals.length) persist();
    stepParticles(particles, dt, world);
  }

  let last = performance.now();
  let frameErrors = 0;
  function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); // clamp after tab was hidden
    last = now;
    try {
      update(dt);
      render();
    } catch (err) {
      if (++frameErrors <= 3) console.error('[Tumble Grove] frame failed:', err);
    }
    requestAnimationFrame(tick);
  }

  resize();
  const { state, fromDefaults } = await store.load();
  applyState(state);
  // First run on this profile: write the defaults so every tab (and every
  // synced device) shares the same sloths instead of inventing its own.
  if (fromDefaults) persist();
  requestAnimationFrame(tick);
}

main().catch((err) => {
  console.error('[Tumble Grove] failed to start:', err);
});
