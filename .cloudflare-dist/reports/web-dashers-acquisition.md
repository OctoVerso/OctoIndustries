# Web Dashers Acquisition Report

## 1. Artifact Verification

- Application: Web Dashers, browser game; no native package name applies.
- Launch artifact: `Octo-Industries/Web-Dashers/index.html`.
- Payload: 82 MB, 258 files under `assets/`, plus `db/` and original `wd_branding/` artwork.
- Verification: bundled entry scripts, Phaser runtime, game scenes, levels, images, audio, fonts, and data files are present. This is the game project, not a downloader or launcher wrapper.
- Source: <https://github.com/web-dashers/web-dashers.github.io>.

## 2. Engine Report

Phaser HTML5 game. Phaser's bundled runtime is `assets/scripts/libs/phaser.min.js`; Pako is bundled for compression. The exact Phaser version is not declared in the source package.

## 3. Runtime Report

Browser JavaScript with Canvas/WebGL rendering, `fetch`, `ResizeObserver`, Web Audio, localStorage, and IndexedDB. Main levels launch from local text data and local media. The Octo home button/watermark are injected by catalog sync, and the shared Octo loader runs before game startup.

## 4. Payload Discovery Report

Copied the actual payload: game/core/player/audio/editor scripts; Phaser and Pako; level/object definitions; 258 asset files including sprite sheets, backgrounds, ground tiles, fonts, music, sound effects, level data, and the source's thumbnails/wordmarks. Its domain-gated notice returns without affecting local-host launches.

## 5. Preservation Report

Original game engine, scenes, controls, menus, art, music, levels, editor, and local progress logic are preserved. Changes are limited to Octo branding/loading, hub registration, and allowing non-upstream hosting.

## 6. Dependency Report

Local main-game resources are bundled. Online level search/download, external song/SFX retrieval, and account/cloud-save endpoints still require remote proxy/backend services. Local progress/settings use browser storage.

## 7. Multiplayer Report

No live player-versus-player matchmaking was identified. Community levels/accounts are backend-dependent: Tier 3 for online features; the local single-player game is preserved.

## 8. Offline Capability Report

- On a local web server or deployed Octo site: game files and main levels are local; primary gameplay can run without network once the page is served locally.
- Online levels, remote audio, login, and cloud saves require network.
- Direct `file://` launch and standalone offline export are not verified; browser fetch/storage restrictions can prevent full operation.
- Local progress/settings persist via localStorage; audio database/cache uses IndexedDB.

## 9. Browser Compatibility Report

Targets modern mobile/desktop browsers with Canvas/WebGL, Web Audio, `fetch`, `ResizeObserver`, and pointer/touch input. Safari and Edge on iPad are expected candidates; device-specific compatibility has not yet been smoke-tested.

## 10. Self-Hosting Feasibility Report

The complete source tree is self-hostable as static files. Octo catalog sync registers search/categories/navigation and generates the game banner from the bundled source thumbnail. Online API features remain external. A single-file offline export and fully embedded master standalone are not produced by this repository's existing build pipeline.