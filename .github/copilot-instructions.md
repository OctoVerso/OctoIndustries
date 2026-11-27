# Game runtime hosting requirements

- Game launch pages and gameplay assets must be served from this repository. A redirect, remote iframe, or externally hosted game payload is a failure, even when the external page works.
- Runtime network access is allowed only for the game's own servers and backends. Do not load gameplay code, scripts, stylesheets, fonts, images, or other game assets from third-party hosting.
- Remove nonessential third-party runtime dependencies such as advertising, analytics, tracking, and CDN assets.
- Do not claim a game is locally playable unless its launch flow and required gameplay assets are local. If an authorized local source package is unavailable, keep the game explicitly unavailable rather than redirecting, proxying, or re-hosting copyrighted game assets without permission.
- Check game manifests, launch pages, nested frames, and runtime asset references when adding or changing games. Run the catalog sync and relevant tests; external game frames must fail validation.
