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
| A sloth touches a leaf | The leaf is eaten and the sloth grows (up to a cap after 40 leaves) |
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
js/config.js           All the tunables (sizes, speeds, sway, growth cap)
img/                   Runtime images generated from assets/ (sprite sheet, layers, leaf)
icons/icon.png         Extension icon, also shown on the Sloth-o-meter (used as-is)
assets/                Source art (never loaded directly by the page)
tools/build_assets.py  Rebuilds img/ from assets/
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
after 40 leaves. Reset gives every sloth a fresh id with zero leaves eaten,
which is also how the reset propagates through sync (see below).

**Leaves.** `x = x₀ + A·sin(ωt)` with a tilt that follows the sway, falling at
a constant speed until the drawn bottom of the leaf reaches the ground. A leaf
is eaten when it overlaps a sloth's body circle; the sloth in front gets it
first.

**Sync.** One key (`tumbleGrove`) holds `{ count, sloths: [{ id, eaten }] }`.
Writes are debounced and spaced at least 3 s apart to stay well inside the
`storage.sync` quotas. Changes from other tabs or devices are merged: the
remote roster wins, but a sloth's `eaten` only ever goes up for a given id, so
a meal served here is never lost to a stale write from elsewhere. Opened as a
plain file (outside an extension) the page falls back to `localStorage`.

## Development

```sh
# rebuild img/ from assets/ (needs Pillow: python3 -m pip install pillow)
python3 tools/build_assets.py

# run the unit tests (Node 20+, no dependencies)
node --test tests/
```

After editing files, hit the reload icon on the extension's card in
`chrome://extensions` and open a new tab.
