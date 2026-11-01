# Chrome Web Store listing for Tumble Grove

Everything the Developer Dashboard asks for, ready to paste. Fields marked
(required) must be filled in before the item can be submitted.

## Package

Build with `python3 tools/package.py` and upload `dist/tumble-grove-<version>.zip`.
Each upload needs a higher `"version"` in `manifest.json` than the one on the store.

## Store listing tab

**Name (required):** Tumble Grove

**Summary (required, max 132 characters):**

> Replaces your New Tab with a pixel-art forest where sloths roll around. Drop leaves to feed them and watch them grow.

**Description (required):**

> Tumble Grove turns every new tab into a quiet pixel-art forest. A grove of
> round sloths tumbles back and forth along the ground, turning around at the
> edges of the window.
>
> Click anywhere in the air to drop a leaf. It sways down on the breeze and
> settles in the grass, and any sloth that rolls into it eats it with a crunch
> and grows a little. Smaller sloths roll in front of the big ones, so a
> well-fed grove builds up real depth. Click a sloth and it hops.
>
> The brown Sloth-o-meter in the corner sets how many sloths live in your
> grove (1 to 20), and a reset button shrinks them all back to newborn size.
> Your sloth count and their sizes follow you across devices through Chrome
> Sync.
>
> This extension replaces the New Tab page. It works offline, makes no network
> requests, has no ads or tracking, and asks only for the storage permission
> it needs to remember your sloths. Open source: https://github.com/jessicayzt/tumble-grove

**Category (required):** Fun

**Language (required):** English

**Store icon (required):** `store/icon128.png` (128x128)

**Screenshots (at least one required, exactly 1280x800 or 640x400):**
`store/screenshot-1280x800.png` is a real capture of the extension. Retina
captures come out at 2x (2560x1600) and the store rejects them as-is; run
`python3 tools/store_assets.py --fit <capture.png>` to scale a capture down
to a flat 1280x800 PNG in place.

**Small promo tile (optional, 440x280):** `store/promo-small-440x280.png`

**Marquee promo tile (optional, 1400x560):** `store/promo-marquee-1400x560.png`

**Official URL / homepage:** https://github.com/jessicayzt/tumble-grove

## Privacy practices tab

**Single purpose (required):**

> Replaces the New Tab page with an animated pixel-art forest scene that the
> user can interact with.

**Permission justification: `storage` (required):**

> Saves the user's chosen number of sloths and each sloth's leaves-eaten count
> so the grove looks the same on every new tab and, via chrome.storage.sync,
> on the user's other signed-in devices. Nothing else is stored.

**Remote code:** No, I am not using remote code.

**Data usage (required):** tick nothing. The extension collects no personally
identifiable information, health, financial, authentication, personal
communications, location, web history, user activity or website content.

**Certifications (required):** all three apply and can be ticked:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/jessicayzt/tumble-grove/blob/main/PRIVACY.md
(live once `PRIVACY.md` is pushed to the public repo)

## Distribution tab

- Visibility: Public
- Regions: all
- Pricing: free

## Notes for review

New Tab overrides get a closer look. The summary and description both say
plainly that the extension replaces the New Tab page, the package contains
no remote code, and the only permission is `storage`.
