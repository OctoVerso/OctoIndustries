# Bloons Tower Defense 5 — Import Report

## Summary

- **Game:** Bloons Tower Defense 5, Newgrounds portal ID 610995.
- **Overall completion:** **Level 3 — acquired, but full playability is not verified.**
- **Self-hosting:** **Local Level 2 — game files and runtime are local; online features have documented Ninja Kiwi dependencies.**

## 1. Repository audit — Verified

The Hub uses `BehindTheScenes/hub/catalog.js` as its generated game registry. `scripts/sync-games.mjs` discovers games from `game.json` and builds their banner and registry entry. Existing Flash imports use local Ruffle bundles and the shared `OctoLoader.loadRuffle` helper. This import adds a game folder and uses those extension points; it does not change shared runtime behavior.

## 2. Artifact verification — Verified

- Source page: [Newgrounds portal 610995](https://www.newgrounds.com/portal/view/610995).
- Source artifact: `https://uploads.ungrounded.net/610000/610995_btd5.swf`.
- Local copy: `games/bloons-td-5.swf` (14,894,821 bytes).
- Format: SWF / Flash version 13; stage dimensions 800 × 620; authored frame rate 30 FPS.
- SHA-256: `9c7a13f23dad328194f82b1a5cce396617e5f9c85ae5ffcff9bf0aad379a1d70`.
- The Newgrounds page title and archived metadata identify the game as Bloons Tower Defense 5.

## 3. Engine report — Verified

The artifact is a Flash SWF containing ActionScript 3 content. It is run with the repository's existing Ruffle WebAssembly runtime, copied locally under `ruffle/` with its MIT and Apache license files.

## 4. Runtime report — Partially Verified

The local HTML page fetched the SWF, initialized Ruffle, and created a player in Chromium. The player reports `frameRate: 60` and `quality: low` in its loaded configuration, while the SWF metadata remains 30 FPS. With software rendering the scene was incomplete; with WebGL enabled the headless renderer crashed. Full menu, gameplay, and sustained frame-rate execution remain unverified.

The SWF header sets a 30 FPS target. Per request, the local Ruffle launcher overrides it to 60 FPS and sets Flash quality to low to prioritize performance. This changes the Flash movie's timeline cadence and may speed up frame-driven behavior. A sustained 60 FPS result has not been measured; it depends on browser/device performance, and headless WebGL tests are unreliable in this environment.

## 5. Payload discovery — Partially Verified

The game is distributed as a single SWF with its game content embedded. The local launcher, thumbnail, Ruffle JavaScript/WASM, and license files are in this folder. The SWF also contains references to Ninja Kiwi profile, news, challenge, and save-manager code.

## 6. Extraction report — Verified

The original Newgrounds-hosted SWF was copied without modifying its bytes. The local file hash matches the verified acquisition hash above. The Newgrounds portal thumbnail is stored at `hub/banner-source.jpg`.

## 7. Preservation report — Verified

The original SWF is retained as acquired. The HTML page is a local Ruffle launcher; no game mechanics or embedded assets were rewritten.

## 8. Dependency report — Partially Verified

- Local game and runtime assets load from this repository.
- Chromium testing observed Ninja Kiwi requests to `http://ninjakiwi.com/btd5/scripts/get-challenge.php`, `get-special-missions.php`, and the BTD5 news-feed endpoints. These calls fail CORS from the local origin.
- A request to the legacy `core.mochibot.com/my/core.swf` service was refused.
- No proxy, remote iframe, or substitute backend was added.

## 9. Multiplayer and online services — Partially Verified

The SWF contains account/profile and challenge-service references. Those requests are blocked from the local origin in the test browser. Multiplayer functionality was not established.

## 10. Offline capability — Partially Verified

The SWF, launcher, runtime, thumbnail, and branding dependencies are locally stored and returned HTTP 200 from the local server. The game was not verified with network access disabled; online/profile/challenge features are known to fail from the local origin.

## 11. Browser compatibility — Not Tested

Only headless Chromium was exercised. Safari/iPad, Edge, touch input, fullscreen, and other browsers were not tested.

## 12. Self-hosting feasibility — Partially Verified

The original game file and runtime are hosted locally, and the launcher does not use a remote game page or iframe. The external Ninja Kiwi services remain dependencies for related features, so this is not classified as fully independent.

## 13. Save and persistence — Not Tested

The SWF contains `localSaveManager`/save-related symbols, but no in-game progress was created and reloaded. Progress retention and Continue behavior are not claimed as working.

## 14. Playability test — Partially Verified

Verified: local launcher and asset responses; Ruffle player initialization. Not verified: complete main menu, gameplay, controls, audio, fullscreen, progression, or save/resume. The headless renderer limitations prevented a reliable gameplay test.

## 15. Hub integration — Verified

`game.json` registers the game using the existing generator. The generated registry entry points to this local launcher and local banner. The targeted registry test passed.

## 16. Collection integrity — Verified

The existing registry test passed and confirmed all 24 importable game folders, including this one, have unique entries and valid launch/banner assets.

## 17. Update report — Not Applicable

This is a new game import; no existing installation or save was replaced.
