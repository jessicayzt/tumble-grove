#!/usr/bin/env python3
"""Build the runtime images for Tumble Grove from the source assets.

Reads from  assets/            (source of truth, never modified)
Writes to   img/ and icons/    (what the extension actually loads)

- sloth_roll.gif  -> img/sloth_sheet.png   (24 frames, one horizontal strip)
- leaf.png        -> img/leaf.png
- Forest/Layers/* -> img/back.png, img/middle.png, img/tiles.png
- audio/*.wav     -> audio/*.wav           (sound effects)
- icons/icon.png  -> icons/icon128.png     (centred on a transparent 128px canvas,
                                           never scaled; the Web Store needs 128x128)
- img/assets.json                        (frame count / sizes, read by the page;
                                           not named manifest.json because the Web
                                           Store rejects packages with two of those)

The extension icon (icons/icon.png) is hand-made; the page shows it as-is.

Only needs Pillow:  python3 -m pip install pillow
"""
import json
import pathlib
import shutil

from PIL import Image, ImageSequence, GifImagePlugin

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
IMG = ROOT / "img"
AUDIO = ROOT / "audio"
ICONS = ROOT / "icons"

# Decode every GIF frame as full RGBA so transparency survives compositing.
GifImagePlugin.LOADING_STRATEGY = GifImagePlugin.LoadingStrategy.RGB_ALWAYS


def build_sprite_sheet():
    gif = Image.open(ASSETS / "sloth_roll.gif")
    frames = [f.convert("RGBA") for f in ImageSequence.Iterator(gif)]
    w, h = frames[0].size
    durations = [f.info.get("duration", 100) for f in ImageSequence.Iterator(gif)]

    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0), frame)
    sheet.save(IMG / "sloth_sheet.png", optimize=True)

    # Per-frame bounding boxes let the page use a tight hitbox if it wants to.
    boxes = [list(f.getbbox()) for f in frames]
    return {
        "file": "sloth_sheet.png",
        "frames": len(frames),
        "frameWidth": w,
        "frameHeight": h,
        "frameDurationMs": durations[0],
        "boxes": boxes,
    }


def copy_layers():
    layers = ASSETS / "Forest" / "Layers"
    out = {}
    for name in ("back", "middle", "tiles"):
        src = layers / f"{name}.png"
        shutil.copyfile(src, IMG / f"{name}.png")
        with Image.open(src) as im:
            out[name] = {"file": f"{name}.png", "width": im.width, "height": im.height}
    shutil.copyfile(ASSETS / "leaf.png", IMG / "leaf.png")
    with Image.open(ASSETS / "leaf.png") as im:
        # box = opaque bounds [x0, y0, x1, y1] so leaves land on their drawn edge
        out["leaf"] = {"file": "leaf.png", "width": im.width, "height": im.height,
                       "box": list(im.convert("RGBA").getbbox())}
    return out


def pad_icon():
    """Centre icons/icon.png on a transparent 128x128 canvas without resizing."""
    with Image.open(ICONS / "icon.png") as im:
        icon = im.convert("RGBA")
        if icon.width > 128 or icon.height > 128:
            raise SystemExit("icons/icon.png is larger than 128px; it would need scaling")
        canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        canvas.paste(icon, ((128 - icon.width) // 2, (128 - icon.height) // 2), icon)
        canvas.save(ICONS / "icon128.png", optimize=True)
        return icon.size


def copy_audio():
    out = {}
    for src in sorted((ASSETS / "audio").glob("*.wav")):
        shutil.copyfile(src, AUDIO / src.name)
        out[src.stem] = {"file": src.name}
    return out


def main():
    IMG.mkdir(exist_ok=True)
    AUDIO.mkdir(exist_ok=True)
    sloth = build_sprite_sheet()
    layers = copy_layers()
    audio = copy_audio()
    icon_size = pad_icon()
    manifest = {"sloth": sloth, **layers, "audio": audio}
    (IMG / "assets.json").write_text(json.dumps(manifest, indent=2) + "\n")
    stale = IMG / "manifest.json"
    if stale.exists():
        stale.unlink()
    print("sprite sheet:", sloth["frames"], "frames of",
          f'{sloth["frameWidth"]}x{sloth["frameHeight"]}')
    for name, info in layers.items():
        print(f"{name}: {info['width']}x{info['height']}")
    print("audio:", ", ".join(audio) or "none")
    print(f"icon: {icon_size[0]}x{icon_size[1]} padded to 128x128")


if __name__ == "__main__":
    main()
