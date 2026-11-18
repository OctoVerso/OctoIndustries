# Head Soccer acquisition and verification

## Acquisition

- Requested page: `https://ubghyper.github.io/games/Head-Soccer.html`
- Acquired the original Construct build from `freeonlinewebtools/gamelist7.github.io`, commit `345c032e7a76c8a0021201f9ddeb7d9bc5646cca`.
- Installed locally at `Octo-Industries/Head-Soccer/`; registered in the game catalog and README.
- The local entry uses a minimal launch page and the original game payload. Portal and advertising wrappers were not included.
- Removed the runtime's request for the unavailable `/main.min.js` GameDistribution SDK. The local game then loaded without failed or error HTTP requests.

## Verification

- Headless Chrome 159 loaded the original game through `Loading`, `Menu`, `Shop1Player`, and `SinglePlayerField`.
- The match rendered with both players and an advancing match clock.
- No JavaScript page errors, failed requests, or HTTP error responses were observed.
- `node --check` passed for the imported runtime scripts.
- The project is configured for Construct `vsync` rendering at a 1280x720 project size.

## Remaining limitation

The 60 FPS requirement is **not verified**. During gameplay, the runtime advanced 23 ticks in 5.163 seconds (about 4.45 ticks/second); a separate gameplay screencast observed about 5.45 frames/second. This environment's headless Chromium reported the SwiftShader software WebGL renderer rather than hardware acceleration, so these results do not establish performance on a supported GPU-backed device. Do not mark the 60 FPS requirement as passed; retest on documented hardware-accelerated reference devices and browsers. Audio and input behavior also still need manual verification outside this headless test.
