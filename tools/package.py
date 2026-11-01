#!/usr/bin/env python3
"""Build the Chrome Web Store upload ZIP for Tumble Grove.

Only the files the extension needs at runtime go in (manifest, page, scripts,
images, audio, icons). Source art, tests, tooling, docs and OS cruft stay out.
The archive is written to dist/tumble-grove-<version>.zip with fixed timestamps
so the same tree always produces the same bytes.

Also runs the checks the Web Store would otherwise fail you on:
  - manifest parses, is MV3, name <= 75 chars, description <= 132 chars
  - version is 1-4 dot-separated integers
  - the manifest's 128px icon exists and really is 128x128
  - every file referenced from the manifest, newtab.html, JS imports and
    the asset URLs in js/ exists inside the package

No third-party dependencies.
"""
import json
import pathlib
import re
import struct
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

INCLUDE = [
    "manifest.json",
    "newtab.html",
    "newtab.css",
    "js",
    "img",
    "audio",
    "icons",
]
SKIP_NAMES = {".DS_Store", "Thumbs.db"}


def runtime_files():
    files = []
    for entry in INCLUDE:
        path = ROOT / entry
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(p for p in sorted(path.rglob("*")) if p.is_file() and p.name not in SKIP_NAMES)
        else:
            raise SystemExit(f"missing: {entry}")
    return sorted(files)


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        raise SystemExit(f"{path.relative_to(ROOT)} is not a PNG")
    return struct.unpack(">II", head[16:24])


def check(manifest, present):
    problems = []
    rel = lambda p: str(p.relative_to(ROOT))

    if manifest.get("manifest_version") != 3:
        problems.append("manifest_version must be 3")
    if len(manifest.get("name", "")) > 75:
        problems.append("name is longer than 75 characters")
    desc = manifest.get("description", "")
    if not desc or len(desc) > 132:
        problems.append(f"description must be 1-132 characters (is {len(desc)})")
    if not re.fullmatch(r"\d+(\.\d+){0,3}", manifest.get("version", "")):
        problems.append("version must be 1-4 dot-separated integers")

    icon = manifest.get("icons", {}).get("128")
    if not icon:
        problems.append("icons.128 is required by the Web Store")
    elif icon not in present:
        problems.append(f"icons.128 points at a missing file: {icon}")
    else:
        size = png_size(ROOT / icon)
        if size != (128, 128):
            problems.append(f"{icon} is {size[0]}x{size[1]}, must be 128x128")
    for key, path in manifest.get("icons", {}).items():
        if path not in present:
            problems.append(f"icons.{key} points at a missing file: {path}")

    newtab = manifest.get("chrome_url_overrides", {}).get("newtab")
    if not newtab or newtab not in present:
        problems.append("chrome_url_overrides.newtab must point at a packaged file")

    # Files referenced from the page.
    html = (ROOT / newtab).read_text() if newtab in present else ""
    for ref in re.findall(r'(?:src|href)="([^"#]+)"', html):
        if ref not in present:
            problems.append(f"{newtab} references a missing file: {ref}")

    # Static imports and asset URLs inside the scripts.
    for js in sorted((ROOT / "js").glob("*.js")):
        text = js.read_text()
        for imp in re.findall(r"""from\s+['"]\./([^'"]+)['"]""", text):
            if f"js/{imp}" not in present:
                problems.append(f"{rel(js)} imports a missing module: {imp}")
        for url in re.findall(r"""['"]((?:img|audio|icons)/[^'"]+)['"]""", text):
            if url not in present:
                problems.append(f"{rel(js)} references a missing asset: {url}")

    for key in ("content_scripts", "background", "host_permissions"):
        if key in manifest:
            problems.append(f"unexpected manifest key for a New Tab page: {key}")

    # The Web Store treats every file called manifest.json as an extension
    # manifest and rejects the upload if it finds more than one.
    for path in present:
        if path != "manifest.json" and path.rsplit("/", 1)[-1] == "manifest.json":
            problems.append(f"{path} must be renamed: only the root manifest.json may have that name")
    return problems


def main():
    files = runtime_files()
    present = {str(p.relative_to(ROOT)) for p in files}
    manifest = json.loads((ROOT / "manifest.json").read_text())
    problems = check(manifest, present)
    if problems:
        print("Not packaged. Fix these first:")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    DIST.mkdir(exist_ok=True)
    out = DIST / f"tumble-grove-{manifest['version']}.zip"
    total = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            arc = str(path.relative_to(ROOT))
            info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            data = path.read_bytes()
            total += len(data)
            zf.writestr(info, data)
            print(f"  {arc}  ({len(data):,} bytes)")
    print(f"\n{out.relative_to(ROOT)}: {len(files)} files, {total:,} bytes uncompressed, "
          f"{out.stat().st_size:,} bytes zipped")
    print(f"{manifest['name']} {manifest['version']} - ready to upload at "
          "https://chrome.google.com/webstore/devconsole")


if __name__ == "__main__":
    main()
