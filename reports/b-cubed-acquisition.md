# B-Cubed Acquisition and Integration Report

Date: 2026-11-23

## Completion classification

- **Acquisition:** Level 1 - Fully acquired and self-hosted
- **Save:** Level 3 - Original level-time progression is persisted
- **Offline:** Partially Verified - static game payload and audio are local; no required remote host remains
- **Overall:** Partially Verified - launch, gameplay, assets, catalog, save format, and frame stability verified; full 30-level completion was not manually exercised

## Repository Audit

Verified - The repository uses static game folders under `Octo-Industries/`, authoritative `game.json` manifests, generated `BehindTheScenes/hub/catalog.js`, shared branding scripts, and `scripts/build-pages-site.mjs` for publication.

## Artifact Verification

Verified - The target is B-Cubed. The public target page identified `https://ubgwtf.gitlab.io/b-cubed/` as its playable delivery. The delivery returned a custom HTML/WebGL runtime with embedded level data and Three.js, a `bcubed-atlas.json` sprite atlas, a PNG texture, and MP3 audio.

Evidence:

- `Octo-Industries/B-Cubed/index.html`
- `Octo-Industries/B-Cubed/scripts/bcubed.js`
- `Octo-Industries/B-Cubed/images/bcubed-atlas.json`
- `Octo-Industries/B-Cubed/images/game.png`

## Engine, Runtime, and Payload

- Engine: Custom JavaScript/Three.js WebGL runtime
- Rendering: HTML canvas and WebGL
- Input: Keyboard, touch/swipe
- Audio: Howler.js embedded in the runtime, with local MP3 files
- Levels: 30 levels embedded in `bcubed.js`
- Save: original `BCubed.times` LocalStorage array, plus `BCubed.music` and `BCubed.sound`

## Extraction and Preservation

Verified - Original static runtime files were downloaded and stored locally. Portal and cloak dependencies were removed from the entry page. The original gameplay, levels, rendering, menus, effects, and sound names were preserved.

Localized files include:

- `Octo-Industries/B-Cubed/scripts/`
- `Octo-Industries/B-Cubed/styles/`
- `Octo-Industries/B-Cubed/images/`
- `Octo-Industries/B-Cubed/sounds/`
- `Octo-Industries/B-Cubed/screenshots/01-gameplay.png`

## Multiplayer and External Dependencies

Not Applicable - B-Cubed is a single-player game.

No runtime external URLs remain in the localized HTML or CSS. The source reference URL is retained only as metadata in `game.json`.

## Save and Persistence

Verified - B-Cubed natively writes completed level times to `localStorage["BCubed.times"]`. Reload testing restored a populated save array. Independent save isolation follows the browser origin.

Limitations:

- The original runtime does not expose reliable per-frame or mid-level state, so exact mid-level restoration is not claimed.
- Device-wide/local account synchronization is not available; saves remain browser/device-local.

## Playability and Performance

Verified:

- Local entry page loads
- WebGL canvas initializes at 2560x1600 for a 1280x800 viewport
- Title and level menu are visible
- A user gesture starts Level 1
- Level name is displayed
- No third-party asset request failures occurred
- Measured requestAnimationFrame average: 16.53 ms
- Measured 95th percentile frame interval: 16.70 ms
- Equivalent sustained rate: approximately 60.5 FPS in headless Chromium

The only observed browser console error during headless launch was an audio autoplay block before user interaction. Loading completed and gameplay started after activating the local Octo loader/play control.

## Hub Integration

Verified - `game.json` is included by catalog synchronization and the central catalog contains B-Cubed:

- ID: `b-cubed`
- Title: B-Cubed
- Category: Puzzle
- Launch: `/Octo-Industries/B-Cubed/index.html`
- Banner source: `screenshots/01-gameplay.png`

The static publication build completed and wrote `dist/`.

## Remaining tests

Not Tested - 30-level manual completion, touch-device gesture testing, physical iPad Safari, and browser-close/reopen persistence on a real mobile device.
