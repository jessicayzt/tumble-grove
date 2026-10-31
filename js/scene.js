// Draws the static forest background onto a canvas sized to the world.
//
// Layers (all from the Forest asset pack, drawn at an integer scale):
//   1. sky band      - the flat colour at the top of the middle layer, used
//                      to extend the scene upwards on tall viewports
//   2. back.png      - distant treeline, tiled horizontally
//   3. middle.png    - big trees, bushes, mushrooms, tiled horizontally
//   4. tiles.png     - ground blocks repeated in the pack's A-B-B-A-A pattern,
//                      as one contiguous strip across the whole width

import { SCENE } from './config.js';

const FALLBACK_SKY = '#222200';

/** Colour of the top-left pixel of an image (the flat canopy shadow). */
export function sampleTopColor(image) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 255) return `rgb(${r}, ${g}, ${b})`;
  } catch {
    /* tainted or unavailable: fall through */
  }
  return FALLBACK_SKY;
}

function tileLayer(ctx, image, world) {
  const dw = image.width * world.scale;
  const dh = image.height * world.scale;
  for (let x = 0; x < world.w; x += dw) {
    ctx.drawImage(image, 0, 0, image.width, image.height, x, world.sceneTop, dw, dh);
  }
}

function drawGround(ctx, tiles, world) {
  const { scale } = world;
  const bw = SCENE.blockWidth * scale;
  const bh = SCENE.blockHeight * scale;
  const y = world.sceneTop + SCENE.tuftRow * scale;
  const pattern = SCENE.pattern;
  for (let i = 0, x = 0; x < world.w; i++, x += bw) {
    const [sx, sy] = SCENE.blocks[pattern[i % pattern.length]];
    ctx.drawImage(tiles, sx, sy, SCENE.blockWidth, SCENE.blockHeight, x, y, bw, bh);
  }
}

/**
 * @param ctx    2d context of a canvas already sized to world.w x world.h
 * @param images { back, middle, tiles } HTMLImageElements
 * @param world  from computeWorld()
 */
export function drawBackground(ctx, images, world) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = sampleTopColor(images.middle);
  ctx.fillRect(0, 0, world.w, world.h);
  tileLayer(ctx, images.back, world);
  tileLayer(ctx, images.middle, world);
  drawGround(ctx, images.tiles, world);
}
