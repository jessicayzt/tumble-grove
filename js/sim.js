// Pure simulation for Tumble Grove: sloths roll, leaves fall, sloths eat.
// No DOM access here so it can be unit tested with plain Node.

import { SLOTH, LEAF, PARTICLE, SCENE } from './config.js';

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

/**
 * Work out how the 272px-tall scene maps onto a viewport of w x h device
 * pixels. The scene is anchored to the bottom; the scale is an integer so
 * pixel art stays crisp. We prefer the scale that fills the height, allowing
 * a small crop of canopy at the top; otherwise we step down one scale and
 * extend the sky above the scene.
 */
export function computeWorld(w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let scale = Math.max(1, Math.round(h / SCENE.height));
  const cropRows = (SCENE.height * scale - h) / scale;
  if (scale > 1 && cropRows > SCENE.maxCropRows) scale -= 1;
  const sceneHeight = SCENE.height * scale;
  const sceneTop = h - sceneHeight; // negative when cropping
  return {
    w,
    h,
    scale,
    sceneTop,
    groundLine: sceneTop + (SCENE.groundTop + SCENE.groundSink) * scale, // where things rest
    leafScale: Math.max(1, Math.round(scale * LEAF.scaleFactor)),
  };
}

/* ------------------------------------------------------------------ */
/* Random helpers                                                      */
/* ------------------------------------------------------------------ */

/** Deterministic 0..1 number from a string, so a sloth keeps its quirks. */
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/* ------------------------------------------------------------------ */
/* Sloths                                                              */
/* ------------------------------------------------------------------ */

export function slothSizeArt(eaten) {
  const t = Math.min(Math.max(eaten, 0), SLOTH.capLeaves) / SLOTH.capLeaves;
  return SLOTH.baseSize + (SLOTH.maxSize - SLOTH.baseSize) * t;
}

export function slothSize(eaten, world) {
  return slothSizeArt(eaten) * world.scale;
}

/** Roll speed in device px/s for a sloth of the given size. */
export function slothSpeed(sloth, world) {
  const art = slothSizeArt(sloth.eaten);
  const base = SLOTH.speedBase + SLOTH.speedPerSize * art;
  return Math.max(4, base) * sloth.speedMul * world.scale;
}

/**
 * Create a live sloth from a persisted record {id, eaten}.
 * Starts at an arbitrary x on the ground, rolling in an arbitrary direction.
 * Options: rng (0..1 generator), frames (sprite frame count).
 */
export function createSloth(record, world, { rng = Math.random, frames = SLOTH.frames } = {}) {
  const sloth = {
    id: record.id,
    eaten: record.eaten || 0,
    x: 0,
    dir: rng() < 0.5 ? -1 : 1,
    speedMul: 1 + (hash01(record.id) * 2 - 1) * SLOTH.speedJitter,
    frameTime: rng() * frames, // random starting frame
    frames,
    lift: 0,   // height above the ground line (device px) while hopping
    vLift: 0,  // vertical speed, positive = up (device px / s)
  };
  const size = slothSize(sloth.eaten, world);
  sloth.x = rng() * Math.max(0, world.w - size);
  return sloth;
}

/**
 * Reset a sloth to a newborn: it keeps its place on the ground but gets a new
 * id, because the sync merge only ever lets `eaten` grow for a given id.
 */
export function resetSloth(sloth, id) {
  sloth.id = id;
  sloth.eaten = 0;
  sloth.speedMul = 1 + (hash01(id) * 2 - 1) * SLOTH.speedJitter;
  return sloth;
}

/** Keep a sloth on screen after a resize, preserving its relative position. */
export function rescaleSloth(sloth, oldWorld, newWorld) {
  const oldSize = slothSize(sloth.eaten, oldWorld);
  const newSize = slothSize(sloth.eaten, newWorld);
  const oldRange = Math.max(1, oldWorld.w - oldSize);
  const newRange = Math.max(0, newWorld.w - newSize);
  sloth.x = Math.min(1, Math.max(0, sloth.x / oldRange)) * newRange;
  const k = newWorld.scale / oldWorld.scale;
  sloth.lift *= k;
  sloth.vLift *= k;
}

export function isAirborne(sloth) {
  return sloth.lift > 0 || sloth.vLift > 0;
}

/**
 * Launch a hop. The height depends a little on size; the frame freezes while
 * the sloth is in the air (see stepSloth). A sloth already in the air cannot
 * be launched again; returns whether a hop started.
 */
export function jumpSloth(sloth, world) {
  if (isAirborne(sloth)) return false;
  const art = slothSizeArt(sloth.eaten);
  const height = SLOTH.jumpHeightBase + SLOTH.jumpHeightPerSize * art;
  sloth.vLift = Math.sqrt(2 * SLOTH.jumpGravity * height) * world.scale;
  return true;
}

/**
 * Front-most grounded sloth (smallest drawn last) whose sprite box contains
 * (x, y). Airborne sloths are ignored, so a click on one falls through to
 * whatever is behind it, or drops a leaf.
 */
export function hitTestSloth(sloths, x, y, world) {
  const frontToBack = sortForDraw(sloths).reverse();
  for (const sloth of frontToBack) {
    if (isAirborne(sloth)) continue;
    const r = slothRect(sloth, world);
    if (x >= r.x && x <= r.x + r.size && y >= r.y && y <= r.y + r.size) return sloth;
  }
  return null;
}

export function stepSloth(sloth, dt, world) {
  const size = slothSize(sloth.eaten, world);
  const airborne = isAirborne(sloth);
  const speed = slothSpeed(sloth, world) * (airborne ? SLOTH.jumpSpeedBoost : 1);
  sloth.x += sloth.dir * speed * dt;

  if (airborne) {
    // Parabolic hop; landing snaps back onto the ground line.
    sloth.lift += sloth.vLift * dt;
    sloth.vLift -= SLOTH.jumpGravity * world.scale * dt;
    if (sloth.lift <= 0) {
      sloth.lift = 0;
      sloth.vLift = 0;
    }
  }

  const maxX = world.w - size;
  if (maxX <= 0) {
    sloth.x = 0; // window narrower than the sloth: just sit there
  } else if (sloth.x <= 0) {
    sloth.x = 0;
    sloth.dir = 1;
  } else if (sloth.x >= maxX) {
    sloth.x = maxX;
    sloth.dir = -1;
  }

  // Animation rate follows the roll: one full turn per circumference.
  // The frame is frozen for the whole hop (the edge flip still mirrors it).
  if (airborne) return;
  const circumference = Math.PI * size * SLOTH.rollContact;
  const fps = Math.min(SLOTH.maxFps, Math.max(SLOTH.minFps, (24 * speed) / circumference));
  sloth.frameTime = (sloth.frameTime + fps * dt) % sloth.frames;
}

export function slothFrame(sloth) {
  return Math.floor(sloth.frameTime) % sloth.frames;
}

/** Drawing rectangle: bottom of the sprite sits on the ground line, minus any hop. */
export function slothRect(sloth, world) {
  const size = slothSize(sloth.eaten, world);
  return { x: sloth.x, y: world.groundLine - size - sloth.lift, size };
}

/** Bigger sloths are drawn first (further back); smaller ones in front. */
export function sortForDraw(sloths) {
  return [...sloths].sort((a, b) => b.eaten - a.eaten || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* ------------------------------------------------------------------ */
/* Leaves                                                              */
/* ------------------------------------------------------------------ */

/**
 * Drop a leaf centred on (x, y). `leafBox` is the opaque bounds of the leaf
 * art [x0, y0, x1, y1] in art px, so landing uses the drawn leaf, not the
 * transparent padding around it.
 */
export function createLeaf(x, y, world, leafArt, { rng = Math.random } = {}) {
  const s = world.leafScale;
  const w = leafArt.width * s;
  const h = leafArt.height * s;
  return {
    x0: x - w / 2,        // anchor x (where it was dropped)
    x: x - w / 2,
    y: y - h / 2,
    w,
    h,
    contentBottom: leafArt.box[3] * s, // from the top of the drawn leaf
    t: 0,
    amp: (LEAF.swayAmplitude + LEAF.swayJitter * (rng() * 2 - 1)) * world.scale,
    omega: (2 * Math.PI) / (LEAF.swayPeriod + LEAF.swayPeriodJitter * (rng() * 2 - 1)),
    vy: (LEAF.fallSpeed + LEAF.fallJitter * (rng() * 2 - 1)) * world.scale,
    rot: 0,
    landed: false,
  };
}

export function stepLeaf(leaf, dt, world) {
  if (leaf.landed) return;
  leaf.t += dt;
  leaf.y += leaf.vy * dt;
  leaf.x = leaf.x0 + leaf.amp * Math.sin(leaf.omega * leaf.t);
  leaf.rot = LEAF.maxTilt * Math.cos(leaf.omega * leaf.t);
  const floor = world.groundLine - leaf.contentBottom;
  if (leaf.y >= floor) {
    leaf.y = floor;
    leaf.rot = 0;
    leaf.landed = true;
  }
}

export function rescaleLeaf(leaf, oldWorld, newWorld) {
  const sx = newWorld.w / oldWorld.w;
  const k = newWorld.leafScale / oldWorld.leafScale;
  leaf.x0 *= sx;
  leaf.x *= sx;
  leaf.w *= k;
  leaf.h *= k;
  leaf.contentBottom *= k;
  leaf.amp *= newWorld.scale / oldWorld.scale;
  leaf.vy *= newWorld.scale / oldWorld.scale;
  if (leaf.landed) {
    leaf.y = newWorld.groundLine - leaf.contentBottom;
  } else {
    // Keep the same fraction of the way down to the ground.
    const oldFloor = oldWorld.groundLine - leaf.contentBottom / k;
    const frac = oldFloor > 0 ? Math.min(1, Math.max(0, leaf.y / oldFloor)) : 1;
    leaf.y = frac * (newWorld.groundLine - leaf.contentBottom);
  }
}

/* ------------------------------------------------------------------ */
/* Eating                                                              */
/* ------------------------------------------------------------------ */

/**
 * Any sloth overlapping a leaf eats it. Sloths in front (smaller) get first
 * dibs, which also helps the little ones catch up.
 * Mutates `leaves` (removes eaten) and sloth.eaten. Returns [{sloth, leaf}].
 */
export function eatLeaves(sloths, leaves, world) {
  if (!leaves.length || !sloths.length) return [];
  const eaten = [];
  const order = sortForDraw(sloths).reverse(); // front to back
  for (let i = leaves.length - 1; i >= 0; i--) {
    const leaf = leaves[i];
    const lx = leaf.x + leaf.w / 2;
    const ly = leaf.y + leaf.h / 2;
    const lr = leaf.w * LEAF.hitRadius;
    for (const sloth of order) {
      const size = slothSize(sloth.eaten, world);
      const cx = sloth.x + size / 2;
      const cy = world.groundLine - size / 2 - sloth.lift; // follows the hop
      const r = size * SLOTH.bodyRadius;
      const dx = lx - cx;
      const dy = ly - cy;
      if (dx * dx + dy * dy <= (r + lr) * (r + lr)) {
        sloth.eaten += 1;
        leaves.splice(i, 1);
        eaten.push({ sloth, leaf });
        break;
      }
    }
  }
  return eaten;
}

/** Drop the oldest leaves when there are too many lying around. */
export function trimLeaves(leaves, max = LEAF.maxLeaves) {
  while (leaves.length > max) {
    const idx = leaves.findIndex((l) => l.landed);
    leaves.splice(idx >= 0 ? idx : 0, 1);
  }
}

/* ------------------------------------------------------------------ */
/* Particles (little puff when a leaf is eaten)                        */
/* ------------------------------------------------------------------ */

export function spawnParticles(x, y, world, { rng = Math.random } = {}) {
  const out = [];
  for (let i = 0; i < PARTICLE.count; i++) {
    const a = -Math.PI / 2 + (rng() * 2 - 1) * 1.1; // mostly upwards
    const v = PARTICLE.speed * (0.5 + rng() * 0.8) * world.scale;
    out.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: PARTICLE.life,
      age: 0,
      color: PARTICLE.colors[i % PARTICLE.colors.length],
    });
  }
  return out;
}

export function stepParticles(particles, dt, world) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += PARTICLE.gravity * world.scale * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
