# Turball

## Acquisition status

- **Artifact status:** Partially Verified
- **Localization status:** Local Level 2 - Locally Hosted with Documented Dependencies
- **Acquisition class:** Level 2 - Acquired & Partially Self-Hosted

The public browser build for Turball release
`8016d11bcb58-44956691996-1` is stored in this repository. Octo Industries
hosts the HTML entry point, application modules, styles, release scripts,
images, fonts, and release assets locally. The game no longer uses an iframe
or redirects to the Turball website for its gameplay shell.

## External dependencies

- The Turball API remains at `https://api.turball.io`.
- Optional portal, analytics, authentication, and cross-promotion integrations
  may remain externally dependent.
- Casual bot/free-play functionality must be browser-tested to confirm whether
  it can operate without the API.

## Files

- `index.html`: localized Turball entry point
- `assets/app/`: application modules and chunks
- `assets/releases/8016d11bcb58-44956691996-1/`: release assets
- `hub/banner-source.webp`: Octo Industries catalog banner

## Known missing assets

Some arena, car-model, skybox, and menu-art URLs referenced by the official public build return 404 from the public origin. These are documented as unresolved payload artifacts. The localized app shell and available runtime assets are preserved; the missing 3D payload is not reconstructed.

## Verification

- The original external iframe was removed.
- The official public HTML and release payload were fetched and localized.
- GitHub Pages build output contains the local entry point and assets.
- Browser gameplay, save behavior, network dependencies, 60 FPS stability,
  and offline operation still require interactive verification.
