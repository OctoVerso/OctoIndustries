# Ragdoll Drop

This folder contains the original Ragdoll Drop Unity WebGL build, hosted locally by Octo Industries. The game page, merged-file loader, Unity loader, framework, data, and split WebAssembly payload are all local. The catalog sync adds the shared Octo Industries branding to `index.html`; local compatibility adjustments limit the loading slideshow to its two available images and replace the unavailable `fonts.invalid` Torus font URLs with the existing local Torus WOFF file. Neither change alters gameplay.

## Artifact verification

- Game: Ragdoll Drop, developed by Ericetto; Unity product version `0.1`.
- Engine: Unity WebGL `2022.3.62f3`, Brotli-compressed payload.
- Entry point: `index.html`; it declares the Unity product and points to the local `JS/poki/` and `Build/` runtime files.
- The supplied UBGHyper URL is a portal page. Its game-only shell points to this Unity build; neither portal page nor an external iframe is used by this local copy.
- Payload source: [`freeonlinewebtools/gamelist14.github.io`, pinned commit `cbd77aa6d87f9a78db232a472b0a57412ff6dfe5`](https://github.com/freeonlinewebtools/gamelist14.github.io/tree/cbd77aa6d87f9a78db232a472b0a57412ff6dfe5/Ragdoll-Drop).
- Cover source: [`UBGHyper/GameList.github.io`, pinned commit `2892fc0e9813e7169cd0cc3a5885b3049ccb0e2b`](https://github.com/UBGHyper/GameList.github.io/tree/2892fc0e9813e7169cd0cc3a5885b3049ccb0e2b/Ragdoll-Drop).

SHA-256 hashes below were computed from the downloaded source files. The `index.html` hash is for the original pinned file before additive branding and slideshow adjustments; the local loader hash reflects its font URL compatibility patch.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `index.html` | 3,060 | `7977582ec9f38bab8914062c64d45f8a48c53dac4fabcf7daaefaadf9418ab43` |
| `merge.js` | 9,554 | `60a7dfecdc32ee41b98e29295146c27aab0701c0856604fe8cb4b33ad2037898` |
| `Build/410e5115a82fe21daf3dff2040631f21.wasm.unityweb.part1` | 19,922,944 | `06827a306f20c9ef8275df4bf4f5b4eeddb02c4754aa92c8ea7935abde8fad47` |
| `Build/410e5115a82fe21daf3dff2040631f21.wasm.unityweb.part2` | 3,479,611 | `d1cc03a7b1f910606475bcdbc9a0b0540dca750838c15a5c58e5ba40135e356c` |
| `Build/5b8ea49647417e58b78803801eb7506f.framework.js.unityweb` | 366,909 | `3db7a78c024bd1c085d3606f05ef9cd5e7fef27fbe6e8d0b0c33f374b8e55482` |
| `Build/64cbab5583908a093c59d52635bffa4b.data.unityweb` | 11,089,869 | `839451fcfe823fc12e67485a87a4cc035c437819865329df15cf125a5e261c1e` |
| `Build/813700ccfaf64a0a3c57e3aa3166490b.loader.js` | 133,120 | `9294ee9c63d20d29b4786ab9ff95c5e2eba16cc0ad33f9a7fd252fe5e6e8785b` |
| `JS/poki/master-loader.js` | 1,396 | `670f42dc6bab7b213ebad52aa9c36dc0f89f2692bfb66b2ebf29eda48b403c96` |
| `JS/poki/poki-sdk.js` | 359 | `b1eec38ab640e0a62de08a7665fb5518dd15a38fae4965e727513a698bc0f890` |
| `JS/poki/unity-2020.js` | 40,968 | `a3dca4fc4ffa7b751da76fe6295ff572fec0c212c2caba0ae5fb8b252789a94f` |
| `ragdoll-drop.jpg` | 7,554 | `d087c9ce43f89eb521c19e0794700ec91ba045fa553aa286f5dd60a0c0781934` |
| `screenshots/1.jpg` | 7,554 | `d087c9ce43f89eb521c19e0794700ec91ba045fa553aa286f5dd60a0c0781934` |
| `screenshots/1-small.jpg` | 7,554 | `d087c9ce43f89eb521c19e0794700ec91ba045fa553aa286f5dd60a0c0781934` |
| `screenshots/2.jpg` | 37,268 | `ce78301b12f86c4769e533d94c18ebe42cf954639d5e784a6e9663f309ece7d7` |
| `screenshots/2-small.jpg` | 37,268 | `ce78301b12f86c4769e533d94c18ebe42cf954639d5e784a6e9663f309ece7d7` |

`merge.js` joins the two local WebAssembly parts at runtime. The payload repository's other listed loading screenshots were 404 HTML responses, so the slideshow uses the genuine game screenshot from the pinned cover source plus a gameplay capture made from the locally running original build. No game code was rebuilt or reconstructed. No license file was present in the downloaded game folder.

The upstream `JS/poki/unity-2020.js` hash before the local font-path patch was `db47b3c8b0c530c28b0d174017ba66928a63efc45a88331d9a5b3a3c3afa500e`.

## Save, offline, and runtime status

- **Save level 5:** a run reached score/high score 62; after reload both reset to 0. No progress keys appeared in localStorage or Unity's `/idbfs` database. Progress is not retained.
- **Offline: not verified:** the game payload is self-hosted, but there is no offline service-worker cache in this import. A working connection to the Octo Industries site is required to fetch the page and assets.
- **Performance: not verified:** Chromium smoke testing confirmed the game rendered and accepted gameplay input at 1280x900, but did not measure sustained frame rate or stability on the documented reference devices; no 60 FPS claim is made.
- The local Poki shim is included in the original game delivery. Third-party ad, account, and multiplayer services are not configured by this import.
