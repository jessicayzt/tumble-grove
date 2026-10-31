// Tunables for Tumble Grove. Distances are in "art pixels" unless noted;
// the renderer multiplies them by the current scene scale.

export const SCENE = {
  height: 272,          // height of the source scene
  tuftRow: 192,         // y where the grass tufts above the ground start
  groundTop: 208,       // y of the top of the ground tiles (grass edge)
  groundSink: 4,        // things rest this far below the grass edge, so a new
                        //   (12px) sloth overlaps the ground by a third of its sprite
  blockWidth: 64,       // one ground block = 4 tiles of 16px
  blockHeight: 80,      // tufts (16) + 4 rows of ground (64)
  // Ground block variants in tiles.png: [x, y] of the 64x80 block.
  blocks: { A: [16, 0], B: [96, 0] },
  // Repeating left-to-right pattern, matching the asset pack's preview.
  pattern: 'ABBAB',
  // How many art rows of canopy we're willing to crop off the top before
  // dropping to a smaller scale and extending the sky instead.
  maxCropRows: 16,
};

export const SLOTH = {
  frames: 24,           // frames in the sprite sheet (checked against img/manifest.json)
  baseSize: 12,         // a brand-new sloth, in art px (square sprite)
  maxSize: 56,          // size cap
  capLeaves: 40,        // leaves needed to reach the cap
  bodyRadius: 0.44,     // fraction of size used as the eating hitbox
  speedBase: 13,        // art px / s for the tiniest sloth
  speedPerSize: -0.075, // bigger sloths roll a bit slower
  speedJitter: 0.2,     // +/- per-sloth speed variation
  minFps: 6,            // animation rate is derived from roll speed,
  maxFps: 14,           //   clamped so it never looks frozen or frantic
  rollContact: 0.92,    // effective rolling circumference = pi * size * this
};

export const LEAF = {
  scaleFactor: 0.5,     // leaf scale relative to the scene scale (rounded, >= 1)
  fallSpeed: 36,        // art px / s
  fallJitter: 12,
  swayAmplitude: 8,     // art px
  swayJitter: 6,
  swayPeriod: 1.4,      // seconds
  swayPeriodJitter: 0.6,
  maxTilt: 0.35,        // radians, tilts into the direction of travel
  hitRadius: 0.25,      // fraction of drawn size
  maxLeaves: 150,
};

export const PARTICLE = {
  count: 7,
  life: 0.55,           // seconds
  speed: 70,            // art px / s
  gravity: 160,         // art px / s^2
  colors: ['#adbc3a', '#74a334', '#56864c'],
};
