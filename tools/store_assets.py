#!/usr/bin/env python3
"""Render Chrome Web Store listing images from the extension's own art.

Writes to store/:
  screenshot-1280x800.png   required: at least one screenshot (1280x800)
  promo-small-440x280.png   optional small promo tile
  promo-marquee-1400x560.png optional marquee tile
  icon128.png               the store icon (same as icons/icon128.png)

The scene is composed exactly like js/scene.js + js/sim.js (bottom-anchored
integer scale, A-B-B-A-B ground blocks, ground line 4 art px below the grass
edge) and populated with sloths and leaves. They are mock-ups in the sense
that no browser was involved, so swap in real screenshots whenever you have
them: files that already exist in store/ are left alone unless you pass
--force, so a real screenshot saved there is never overwritten.

    python3 tools/store_assets.py [--force]
    python3 tools/store_assets.py --fit path/to/capture.png
        Resize a real capture to 1280x800 (exact 16:10 captures scale,
        anything else is centre-cropped first) and save it flat (no alpha)
        as store/screenshot-1280x800.png.

Needs Pillow.
"""
import math
import pathlib
import shutil
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "img"
STORE = ROOT / "store"

# Keep in step with js/config.js.
SCENE_H, TUFT_ROW, GROUND_TOP, GROUND_SINK, MAX_CROP = 272, 192, 208, 4, 16
BLOCKS = {"A": (16, 0), "B": (96, 0)}
PATTERN = "ABBAB"
BASE_SIZE, MAX_SIZE, CAP = 12, 56, 40
FRAME = 112


def world(w, h, scale=None):
    if scale is None:
        scale = max(1, round(h / SCENE_H))
        if scale > 1 and (SCENE_H * scale - h) / scale > MAX_CROP:
            scale -= 1
    top = h - SCENE_H * scale
    return dict(w=w, h=h, scale=scale, top=top,
                ground_line=top + (GROUND_TOP + GROUND_SINK) * scale,
                leaf_scale=max(1, round(scale * 0.5)))


def size_art(eaten):
    return BASE_SIZE + (MAX_SIZE - BASE_SIZE) * min(eaten, CAP) / CAP


class Art:
    def __init__(self):
        self.back = Image.open(IMG / "back.png").convert("RGBA")
        self.middle = Image.open(IMG / "middle.png").convert("RGBA")
        self.tiles = Image.open(IMG / "tiles.png").convert("RGBA")
        self.sheet = Image.open(IMG / "sloth_sheet.png").convert("RGBA")
        self.leaf = Image.open(IMG / "leaf.png").convert("RGBA")

    def frame(self, i):
        return self.sheet.crop((i * FRAME, 0, (i + 1) * FRAME, FRAME))


def paste_layer(canvas, layer, wd):
    s = wd["scale"]
    big = layer.resize((layer.width * s, layer.height * s), Image.NEAREST)
    x = 0
    while x < wd["w"]:
        if wd["top"] >= 0:
            canvas.alpha_composite(big, (x, wd["top"]))
        else:
            canvas.alpha_composite(big.crop((0, -wd["top"], big.width, big.height)), (x, 0))
        x += big.width


def draw_background(art, wd):
    canvas = Image.new("RGBA", (wd["w"], wd["h"]), art.middle.getpixel((0, 0)))
    paste_layer(canvas, art.back, wd)
    paste_layer(canvas, art.middle, wd)
    s = wd["scale"]
    bw, bh = 64 * s, 80 * s
    y = wd["top"] + TUFT_ROW * s
    x = i = 0
    while x < wd["w"]:
        sx, sy = BLOCKS[PATTERN[i % len(PATTERN)]]
        block = art.tiles.crop((sx, sy, sx + 64, sy + 80)).resize((bw, bh), Image.NEAREST)
        if y < wd["h"]:
            canvas.alpha_composite(block, (x, y))
        x += bw
        i += 1
    return canvas


def draw_sloth(canvas, art, wd, x_frac, eaten, frame, facing_right=False, lift_art=0):
    size = round(size_art(eaten) * wd["scale"])
    img = art.frame(frame).resize((size, size), Image.LANCZOS if size < FRAME else Image.NEAREST)
    if facing_right:  # the sheet rolls left; right-movers are mirrored, as in the page
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    x = int(x_frac * wd["w"] - size / 2)
    y = wd["ground_line"] - size - round(lift_art * wd["scale"])
    canvas.alpha_composite(img, (x, y))


def draw_leaf(canvas, art, wd, x_frac, y=None, angle=0):
    ls = wd["leaf_scale"]
    img = art.leaf.resize((16 * ls, 16 * ls), Image.NEAREST)
    if angle:
        img = img.rotate(angle, resample=Image.NEAREST, expand=True)
    x = int(x_frac * wd["w"] - img.width / 2)
    if y is None:
        y = wd["ground_line"] - 14 * ls  # resting on the ground line (leaf art's bottom row)
    canvas.alpha_composite(img, (x, y))


def screenshot(art):
    wd = world(1280, 800)
    c = draw_background(art, wd)
    # Back to front: big ones first, as the page draws them.
    draw_sloth(c, art, wd, 0.74, 40, 13, facing_right=True)
    draw_sloth(c, art, wd, 0.40, 18, 4)
    draw_sloth(c, art, wd, 0.57, 9, 21, facing_right=True, lift_art=16)
    draw_sloth(c, art, wd, 0.16, 3, 7, facing_right=True)
    draw_sloth(c, art, wd, 0.90, 0, 0)
    draw_leaf(c, art, wd, 0.30)
    draw_leaf(c, art, wd, 0.66)
    draw_leaf(c, art, wd, 0.25, y=int(wd["h"] * 0.42), angle=-18)
    draw_leaf(c, art, wd, 0.50, y=int(wd["h"] * 0.28), angle=12)
    return c


def small_tile(art):
    wd = world(440, 280, scale=2)  # close-up on the ground at 2x
    c = draw_background(art, wd)
    draw_sloth(c, art, wd, 0.72, 40, 12, facing_right=True)
    draw_sloth(c, art, wd, 0.30, 14, 2)
    draw_sloth(c, art, wd, 0.50, 0, 0, facing_right=True)
    draw_leaf(c, art, wd, 0.42)
    draw_leaf(c, art, wd, 0.60, y=int(wd["h"] * 0.35), angle=15)
    return c


def marquee(art):
    wd = world(1400, 560)
    c = draw_background(art, wd)
    draw_sloth(c, art, wd, 0.80, 40, 14, facing_right=True)
    draw_sloth(c, art, wd, 0.22, 26, 5)
    draw_sloth(c, art, wd, 0.47, 12, 20, facing_right=True)
    draw_sloth(c, art, wd, 0.62, 2, 1, lift_art=14)
    draw_sloth(c, art, wd, 0.08, 0, 9, facing_right=True)
    draw_leaf(c, art, wd, 0.35)
    draw_leaf(c, art, wd, 0.70)
    draw_leaf(c, art, wd, 0.55, y=int(wd["h"] * 0.33), angle=-12)
    return c


def fit_screenshot(capture, size=(1280, 800)):
    """Turn a real capture (e.g. a 2560x1600 Retina shot) into a store screenshot."""
    src = Image.open(capture).convert("RGBA")
    flat = Image.new("RGB", src.size, (34, 34, 0))
    flat.paste(src, mask=src.split()[3])
    target = size[0] / size[1]
    if abs(flat.width / flat.height - target) > 1e-3:
        # Centre-crop to 16:10 before scaling so nothing is squashed.
        if flat.width / flat.height > target:
            w = round(flat.height * target)
            x0 = (flat.width - w) // 2
            flat = flat.crop((x0, 0, x0 + w, flat.height))
        else:
            h = round(flat.width / target)
            y0 = (flat.height - h) // 2
            flat = flat.crop((0, y0, flat.width, y0 + h))
    exact = flat.width % size[0] == 0 and flat.width // size[0] == flat.height // size[1]
    out = flat.resize(size, Image.BOX if exact else Image.LANCZOS)
    STORE.mkdir(exist_ok=True)
    out.save(STORE / "screenshot-1280x800.png", optimize=True)
    print(f"store/screenshot-1280x800.png: {out.width}x{out.height} from {src.width}x{src.height}")


def main(argv):
    if "--fit" in argv:
        fit_screenshot(argv[argv.index("--fit") + 1])
        return
    force = "--force" in argv
    STORE.mkdir(exist_ok=True)
    art = Art()
    outputs = {
        "screenshot-1280x800.png": screenshot,
        "promo-small-440x280.png": small_tile,
        "promo-marquee-1400x560.png": marquee,
    }
    for name, render in outputs.items():
        path = STORE / name
        if path.exists() and not force:
            print(f"store/{name}: kept (pass --force to regenerate the mock-up)")
            continue
        image = render(art)
        image.convert("RGB").save(path, optimize=True)  # 24-bit, no alpha
        print(f"store/{name}: {image.width}x{image.height}")
    shutil.copyfile(ROOT / "icons" / "icon128.png", STORE / "icon128.png")
    print("store/icon128.png: 128x128")


if __name__ == "__main__":
    main(sys.argv[1:])
