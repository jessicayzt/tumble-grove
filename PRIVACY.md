# Tumble Grove privacy policy

_Last updated: 2026-10-31_

Tumble Grove is a Chrome extension that replaces the New Tab page with an
animated pixel-art forest. It is built to keep nothing about you.

## What the extension stores

The only data the extension writes is its own settings:

- the number of sloths you chose on the Sloth-o-meter, and
- a random id and a leaves-eaten count for each sloth, so they keep their size.

This is saved with Chrome's `storage.sync` API, which means Chrome itself may
copy it between the devices where you are signed in to the same Chrome
profile, under Google's Chrome Sync terms. The data contains no personal
information and is never read by anyone but the extension.

## What the extension does not do

- It makes no network requests. Every image and sound ships inside the
  extension package and is loaded locally.
- It does not collect, transmit, sell or share any personal data, browsing
  history, page content or usage analytics.
- It does not use cookies, third-party services or remote code.
- It requests a single permission, `storage`, for the settings described above.

## Removing your data

Uninstalling the extension removes its settings from Chrome. Settings already
synced to other devices are removed when Chrome Sync next updates them.

## Contact

Questions about this policy: open an issue at
https://github.com/jessicayzt/tumble-grove/issues.
