import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorld, createSloth, resetSloth, stepSloth, slothSize, slothSizeArt, slothRect,
  sortForDraw, createLeaf, stepLeaf, eatLeaves, trimLeaves, rescaleSloth,
  rescaleLeaf, spawnParticles, stepParticles, slothFrame,
} from '../js/sim.js';
import { SLOTH, SCENE, LEAF } from '../js/config.js';

const LEAF_ART = { width: 16, height: 16, box: [1, 3, 15, 14] };
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('computeWorld picks an integer scale and anchors the scene to the bottom', () => {
  const w = computeWorld(1920, 1080);
  assert.equal(w.scale, 4);                         // 1088 tall, crops 2 art rows
  assert.equal(w.sceneTop, 1080 - 272 * 4);
  assert.equal(w.groundLine, w.sceneTop + (SCENE.groundTop + SCENE.groundSink) * 4);
  assert.ok(w.groundLine < 1080 && w.groundLine > 0);
});

test('computeWorld steps down a scale rather than cropping too much canopy', () => {
  const w = computeWorld(1440, 720);                // round(720/272)=3 would crop 32 rows
  assert.equal(w.scale, 2);
  assert.ok(w.sceneTop > 0, 'sky is extended above the scene');
  const tiny = computeWorld(300, 100);
  assert.equal(tiny.scale, 1);
  const laptop = computeWorld(1366, 768);           // crops exactly the 16 flat canopy rows
  assert.equal(laptop.scale, 3);
  assert.equal(laptop.sceneTop, 768 - 816);
  const retina = computeWorld(2880, 1800);          // 1440x900 at 2x
  assert.equal(retina.scale, 7);
});

test('sloth size grows with leaves eaten up to the cap', () => {
  assert.equal(slothSizeArt(0), SLOTH.baseSize);
  assert.ok(slothSizeArt(1) > slothSizeArt(0));
  assert.equal(slothSizeArt(SLOTH.capLeaves), SLOTH.maxSize);
  assert.equal(slothSizeArt(SLOTH.capLeaves + 50), SLOTH.maxSize);
  const world = computeWorld(1000, 800);
  assert.equal(slothSize(0, world), SLOTH.baseSize * world.scale);
});

test('sloths start somewhere on screen and sit on the ground line', () => {
  const world = computeWorld(1200, 800);
  const s = createSloth({ id: 'abc', eaten: 0 }, world, { rng: seq(0.7, 0.3, 0.5) });
  const r = slothRect(s, world);
  assert.ok(r.x >= 0 && r.x + r.size <= world.w);
  assert.equal(r.y + r.size, world.groundLine);
  assert.ok([1, -1].includes(s.dir));
});

test('a new sloth overlaps the ground tiles by a third of its sprite', () => {
  const world = computeWorld(1920, 1080);
  const grassEdge = world.sceneTop + SCENE.groundTop * world.scale;
  const r = slothRect(createSloth({ id: 'n', eaten: 0 }, world, { rng: seq(0.5) }), world);
  assert.equal(SCENE.groundSink, 4);
  assert.equal(r.y + r.size - grassEdge, r.size / 3);
  assert.equal(SCENE.pattern, 'ABBAB');
});

test('resetSloth makes a newborn in place with a fresh id', () => {
  const world = computeWorld(1000, 800);
  const s = createSloth({ id: 'old', eaten: 30 }, world, { rng: seq(0.4, 0.2, 0.6) });
  const { x, dir } = s;
  resetSloth(s, 'new');
  assert.equal(s.id, 'new');
  assert.equal(s.eaten, 0);
  assert.equal(s.x, x);
  assert.equal(s.dir, dir);
  assert.equal(slothSize(s.eaten, world), SLOTH.baseSize * world.scale);
});

test('the tiniest sloth tops out around 12 art px per second', () => {
  const world = computeWorld(1000, 800);
  const s = createSloth({ id: 'quick', eaten: 0 }, world, { rng: seq(0.9, 0.5, 0.5) });
  s.speedMul = 1;
  s.x = 100; s.dir = 1;
  stepSloth(s, 1, world);
  const artPerSecond = (s.x - 100) / world.scale;
  assert.ok(artPerSecond > 11 && artPerSecond < 13, `got ${artPerSecond}`);
});

test('sloths roll and turn around at the edges', () => {
  const world = computeWorld(600, 500);
  const s = createSloth({ id: 's1', eaten: 0 }, world, { rng: seq(0.9, 0.0, 0) });
  s.x = 5; s.dir = -1;
  stepSloth(s, 1, world);                            // runs into the left edge
  assert.equal(s.x, 0);
  assert.equal(s.dir, 1);
  const size = slothSize(0, world);
  s.x = world.w - size - 1;
  for (let i = 0; i < 20; i++) stepSloth(s, 0.1, world);
  assert.equal(s.dir, -1);
  assert.ok(s.x <= world.w - size);
  assert.ok(s.x >= 0);
});

test('animation frame advances while rolling and wraps at 24', () => {
  const world = computeWorld(800, 600);
  const s = createSloth({ id: 's2', eaten: 0 }, world, { rng: seq(0.1, 0.2, 0), frames: 24 });
  s.x = 300; s.frameTime = 0;
  stepSloth(s, 0.1, world);
  assert.ok(s.frameTime > 0);
  s.frameTime = 23.9;
  stepSloth(s, 1, world);
  assert.ok(s.frameTime < 24);
  assert.ok(slothFrame(s) >= 0 && slothFrame(s) < 24);
});

test('bigger sloths roll a little slower than tiny ones', () => {
  const world = computeWorld(2000, 1000);
  const small = createSloth({ id: 'same', eaten: 0 }, world, { rng: seq(0.9, 0.5, 0) });
  const big = createSloth({ id: 'same', eaten: SLOTH.capLeaves }, world, { rng: seq(0.9, 0.5, 0) });
  small.x = big.x = 500; small.dir = big.dir = 1;
  stepSloth(small, 0.5, world); stepSloth(big, 0.5, world);
  assert.ok(small.x - 500 > big.x - 500);
});

test('draw order puts big sloths behind small ones', () => {
  const sloths = [
    { id: 'b', eaten: 3 }, { id: 'a', eaten: 10 }, { id: 'c', eaten: 0 }, { id: 'd', eaten: 3 },
  ];
  assert.deepEqual(sortForDraw(sloths).map((s) => s.id), ['a', 'b', 'd', 'c']);
  assert.deepEqual(sloths.map((s) => s.id), ['b', 'a', 'c', 'd'], 'input not mutated');
});

test('leaves sway with a sine from the drop point and stop on the ground', () => {
  const world = computeWorld(1000, 800);
  const leaf = createLeaf(500, 100, world, LEAF_ART, { rng: seq(0.5) });
  assert.equal(leaf.x + leaf.w / 2, 500);
  assert.equal(leaf.y + leaf.h / 2, 100);
  const startY = leaf.y;
  let maxDx = 0;
  for (let i = 0; i < 10; i++) {
    stepLeaf(leaf, 0.05, world);
    maxDx = Math.max(maxDx, Math.abs(leaf.x - leaf.x0));
  }
  assert.ok(leaf.y > startY, 'falls');
  assert.ok(maxDx > 0 && maxDx <= leaf.amp + 1e-9, 'sways within its amplitude');
  for (let i = 0; i < 2000 && !leaf.landed; i++) stepLeaf(leaf, 0.05, world);
  assert.ok(leaf.landed);
  assert.equal(leaf.y + leaf.contentBottom, world.groundLine, 'drawn bottom rests on the ground');
  const frozen = { x: leaf.x, y: leaf.y };
  stepLeaf(leaf, 1, world);
  assert.deepEqual({ x: leaf.x, y: leaf.y }, frozen, 'landed leaves stay put');
});

test('a sloth that collides with a leaf eats it and grows', () => {
  const world = computeWorld(1000, 800);
  const s = createSloth({ id: 'eater', eaten: 0 }, world, { rng: seq(0.5, 0.5, 0) });
  s.x = 400;
  const size = slothSize(0, world);
  const leaves = [
    createLeaf(400 + size / 2, world.groundLine - size / 2, world, LEAF_ART, { rng: seq(0.5) }), // inside the body
    createLeaf(50, 50, world, LEAF_ART, { rng: seq(0.5) }),                                      // far away
  ];
  const events = eatLeaves([s], leaves, world);
  assert.equal(events.length, 1);
  assert.equal(s.eaten, 1);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].x0, 50 - leaves[0].w / 2);
  assert.ok(slothSize(s.eaten, world) > size);
});

test('the sloth in front (smallest) gets the leaf when several overlap', () => {
  const world = computeWorld(1000, 800);
  const big = createSloth({ id: 'big', eaten: 20 }, world, { rng: seq(0.5) });
  const small = createSloth({ id: 'small', eaten: 0 }, world, { rng: seq(0.5) });
  big.x = 400; small.x = 400;
  const leaf = createLeaf(400 + slothSize(0, world) / 2, world.groundLine - 10, world, LEAF_ART, { rng: seq(0.5) });
  eatLeaves([big, small], [leaf], world);
  assert.equal(small.eaten, 1);
  assert.equal(big.eaten, 20);
});

test('trimLeaves removes landed leaves first', () => {
  const leaves = [{ landed: false, id: 1 }, { landed: true, id: 2 }, { landed: false, id: 3 }];
  trimLeaves(leaves, 2);
  assert.deepEqual(leaves.map((l) => l.id), [1, 3]);
  trimLeaves(leaves, 1);
  assert.deepEqual(leaves.map((l) => l.id), [3]);
});

test('resizing keeps sloths and leaves in proportion', () => {
  const a = computeWorld(1000, 800);
  const b = computeWorld(2000, 1200);
  const s = createSloth({ id: 'r', eaten: 5 }, a, { rng: seq(0.5, 0.5, 0) });
  s.x = (a.w - slothSize(5, a)) / 2;
  rescaleSloth(s, a, b);
  assert.ok(Math.abs(s.x - (b.w - slothSize(5, b)) / 2) < 1e-6, 'stays centred');
  const landed = createLeaf(500, 100, a, LEAF_ART, { rng: seq(0.5) });
  landed.landed = true; landed.y = a.groundLine - landed.contentBottom;
  rescaleLeaf(landed, a, b);
  assert.equal(landed.y + landed.contentBottom, b.groundLine);
  const falling = createLeaf(500, 100, a, LEAF_ART, { rng: seq(0.5) });
  rescaleLeaf(falling, a, b);
  assert.ok(falling.y >= 0 && falling.y < b.groundLine);
  assert.equal(falling.w, LEAF_ART.width * b.leafScale);
});

test('particles fly, fall under gravity, and expire', () => {
  const world = computeWorld(1000, 800);
  const ps = spawnParticles(100, 100, world, { rng: seq(0.5) });
  assert.ok(ps.length > 0);
  stepParticles(ps, 0.1, world);
  assert.ok(ps.every((p) => p.age > 0));
  stepParticles(ps, 10, world);
  assert.equal(ps.length, 0);
});

test('sprite frame count in config matches the generated sprite sheet manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../img/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.sloth.frames, SLOTH.frames);
  assert.equal(manifest.sloth.frameWidth * manifest.sloth.frames, 2688);
  const s = createSloth({ id: 'f', eaten: 0 }, computeWorld(800, 600), { rng: seq(0.5, 0.999, 0.5), frames: manifest.sloth.frames });
  assert.ok(slothFrame(s) < manifest.sloth.frames);
});

test('leaf config stays sane', () => {
  assert.ok(LEAF.maxLeaves > 10);
});
