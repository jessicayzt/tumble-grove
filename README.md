# Tumble Grove

A New Tab replacement for Chrome: a pixel-art forest where sloths tumble back
and forth along the ground. Click anywhere in the air to drop a leaf; any
sloth that rolls into it eats it and grows a little. The **Sloth-o-meter**
slider sets how many sloths live in the grove (1–20). Settings and how much
each sloth has eaten sync across your Chrome profiles via `chrome.storage.sync`.

## Install (unpacked)

1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder (`tumble-grove`).
3. Open a new tab. Chrome may ask you to confirm the New Tab change.

## How to play

| Action | Result |
| --- | --- |
| Click above the ground | A leaf drops from the click point, swaying as it falls, and comes to rest on the grass |
| Click a sloth | It hops (with a jump sound): a small parabola with its frame frozen, bouncing off the page edge if it gets there. Clicking it again mid-air drops a leaf instead |
| A sloth touches a leaf | The leaf is eaten with a crunch and the sloth grows (up to a cap after 40 leaves) |
| Sloth-o-meter slider | Sets the number of sloths; new ones arrive tiny, extra ones leave (newest first) |
| Reset all sloths (↺, left of the meter) | Shrinks every sloth back to its initial size; they keep their places |

Smaller sloths always roll in front of bigger ones, so the grove reads with
depth: the giants lumber along at the back, the newcomers zip past in front.

## How it works

```
manifest.json          MV3 manifest: overrides the New Tab page, asks for "storage"
newtab.html / .css     Two full-screen canvases plus the Sloth-o-meter panel
js/main.js             Wiring: image loading, resize, input, render loop, persistence
js/scene.js            Draws the forest background (sky band, back, middle, ground strip)
js/sim.js              Pure simulation: rolling, turning, leaves, eating, growth, depth
js/storage.js          chrome.storage.sync adapter with debounced, rate-limited writes
js/audio.js            Web Audio sound bank: per-sound volume, random pitch shift
js/config.js           All the tunables (sizes, speeds, sway, growth cap, sound levels)
img/                   Runtime images generated from assets/ (sprite sheet, layers, leaf)
audio/                 Sound effects copied from assets/audio/ (jump.wav, crunch.wav)
icons/icon.png         Extension icon, also shown on the Sloth-o-meter (used as-is)
assets/                Source art (never loaded directly by the page)
tools/build_assets.py  Rebuilds img/ and audio/ from assets/
tests/                 Node unit tests for sim.js and storage.js
```

**Background.** The Forest pack's three layers are drawn at an integer scale
so the pixel art stays crisp. The 272px-tall scene is anchored to the bottom
of the window; the scale is chosen to fill the height, cropping at most the
flat 16 rows at the top of the canopy, otherwise the sky is extended with the
same flat colour. The ground is a contiguous strip of the pack's 64px blocks
repeated in an A‑B‑B‑A‑B pattern across the whole width.

**Sloths.** The 24-frame GIF is converted into a horizontal sprite sheet
(`img/sloth_sheet.png`) and sliced into frames at load time. Each sloth is a
square sprite whose bottom edge sits on the ground line, which is 4 art‑px
below the grass edge so a new sloth overlaps the ground by a third of its
sprite instead of floating on top of it. The sheet shows the sloth tumbling to the
left, so sloths heading right are drawn mirrored. Animation speed follows the
roll speed (one turn per circumference, clamped to 6–14 fps). The tiniest
sloth rolls at about 13 art‑px per second and bigger sloths roll a little
slower. Size is derived from leaves eaten: 12 art‑px when new, up to 56 art‑px
after 40 leaves. Clicking a sloth launches a hop (height grows a little with
size); its frame is frozen until it lands and the usual edge turn‑around makes
it bounce off the sides. Reset gives every sloth a fresh id with zero leaves
eaten, which is also how the reset propagates through sync (see below).

**Leaves.** `x = x₀ + A·sin(ωt)` with a tilt that follows the sway, falling at
a constant speed until the drawn bottom of the leaf reaches the ground. A leaf
is eaten when it overlaps a sloth's body circle; the sloth in front gets it
first.

**Sound.** A jump plays `jump.wav`; eating plays `crunch.wav` at half volume,
since that sample is much louder. Every play is pitch‑shifted by a random
amount within ±2 semitones (via the buffer source's playback rate) so repeats
don't sound mechanical. Samples are decoded at load; the AudioContext itself is
created on the first click, as Chrome's autoplay policy requires.

**Sync.** One key (`tumbleGrove`) holds `{ count, sloths: [{ id, eaten }] }`.
Writes are debounced and spaced at least 3 s apart to stay well inside the
`storage.sync` quotas. Changes from other tabs or devices are merged: the
remote roster wins, but a sloth's `eaten` only ever goes up for a given id, so
a meal served here is never lost to a stale write from elsewhere. Opened as a
plain file (outside an extension) the page falls back to `localStorage`.

## Development

```sh
# rebuild img/ and audio/ from assets/ (needs Pillow: python3 -m pip install pillow)
python3 tools/build_assets.py

# run the unit tests (Node 20+, no dependencies)
node --test tests/
```

After editing files, hit the reload icon on the extension's card in
`chrome://extensions` and open a new tab.

## Publishing to the Chrome Web Store

```sh
python3 tools/build_assets.py   # if any art or audio changed
node --test tests/
python3 tools/package.py        # -> dist/tumble-grove-<version>.zip (runtime files only)
python3 tools/store_assets.py   # -> store/*.png listing images (optional, from the game art)
```

1. Bump `"version"` in `manifest.json`; the store refuses a version that is not
   higher than the one already published.
2. Run `tools/package.py`. It checks the manifest (MV3, name and summary
   lengths, 128x128 icon, every referenced file present) and writes the ZIP.
3. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time $5 registration), add a new item and upload the ZIP.
4. Fill the Store listing, Privacy practices and Distribution tabs from
   [`store/LISTING.md`](store/LISTING.md); the images are in `store/` and the
   privacy policy is [`PRIVACY.md`](PRIVACY.md).
5. Submit for review. New Tab overrides tend to take a little longer.

The package contains only `manifest.json`, the page, `js/`, `img/`, `audio/`
and `icons/`; source art, tests and tooling stay out.
