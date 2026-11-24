# Octo Industries Repository Audit

**Date:** 2026-11-23  
**Scope:** Repository-wide audit against `OctoVerso Master Game Extraction Prompt.txt`  
**Status:** Verified baseline; implementation authorized

## Executive summary

The repository is a static GitHub Pages game hub backed by Supabase Edge Functions. It already contains a substantial collection of locally stored game payloads, a generated catalog, shared branding overlays, a loading overlay, a public hub, an admin dashboard, acquisition reports, and automated tests.

The current implementation does not yet satisfy the master prompt as a complete system. The verified local and deployed baseline is 33 games. The largest gaps are centralized save management, game-specific Continue/New Game/Reset flows, Favorites, individual game information pages, durable game statistics, import queue/update workflows, collection-integrity evidence, and per-game acquisition/playability/persistence testing. Two registered entries are external-only wrappers and must not be classified as local acquisitions under the prompt.

No game payload was reconstructed or substituted during this audit.

## Existing architecture

| Area | Current implementation | Status |
| --- | --- | --- |
| Public entry point | Root `index.html` loads the shared CSS, runtime config, generated catalog, and `hub/app.js`. | Verified |
| Hub UI | `Octo-Industries/BehindTheScenes/hub/app.js` and `app.css` provide hash routing, search, category filtering, sorting, featured games, recently added, trending, news, roadmap, screenshot gallery, feedback, and ticket views. | Partially Verified |
| Game registry | `BehindTheScenes/scripts/sync-games.mjs` discovers `game.json` manifests, validates launch/assets, generates banners, injects branding, and writes `hub/catalog.js`. | Verified |
| Server catalog | Supabase `catalog` function returns published catalog rows; the hub merges that response with the generated local fallback catalog. | Partially Verified |
| Deployment | `scripts/build-pages-site.mjs` runs catalog sync, copies the static site to `dist`, injects deployment config, writes redirects/sitemap, and checks the 100 MB file limit. | Verified |
| Admin/import support | Admin functions support catalog edits, publishing, jobs, roadmap, proposals, feedback, and page builds. The existing jobs path is not a game acquisition queue with the prompt's required acquisition states and evidence. | Partially Verified |
| Branding | Shared `game-branding.css/js` injects the Home Button and watermark. `game-loader.js` provides a shared loader/Ruffle helper. Catalog sync injects missing branding references into HTML launch files. | Verified |
| Game payloads | 33 manifest-backed game directories are present beneath `Octo-Industries/`; the generated catalog contains 33 IDs. | Verified |

## Inventory findings

- The checked-out `main` branch was fast-forwarded to remote commit `122b9e3e9cac2e80d19eb833a6f87c874dedc4f8` before implementation. The prior checkout was stale at 28 games.
- The current repository has 33 top-level `game.json` manifests and 33 generated catalog entries.
- All 33 manifest IDs are unique, all 33 generated catalog IDs are unique, and every manifest launch path resolves to a repository file using the catalog sync resolver.
- The five games added by the current remote branch are `b-cubed`, `dr-driving`, `gta-3`, `gta-vice-city`, and `hill-climb-racing`.
- The manifest schema currently covers identity, title, description, category, tags, artwork, launch path, version, and selected platform/feature metadata. It has no standard engine, runtime, save-level, dependency, acquisition-evidence, or test-result schema.
- `sync-games.mjs` resolves launch files relative to the game directory, its collection, and repository root. The entries whose manifest launch path includes the game directory name are therefore valid under the existing resolver even though a naive `game-directory/launch` check reports them as missing.
- Existing reports document prior acquisition work for Head Soccer, Web Dashers, Stack Fall, and other operational issues. These reports are useful evidence but do not yet form a complete per-game report set required by the master prompt.
- `dist/`, `.cloudflare-dist/`, `offline_exports/`, and nested game build directories are generated or packaged artifacts. They are not authoritative registries and must not become competing sources of game identity.

## Four-source registry comparison

The comparison was performed after the fast-forward and before feature implementation.

| Source | Entries | Unique IDs | Launch/path result | Difference |
| --- | ---: | ---: | --- | --- |
| Repository manifests on `main` | 33 | 33 | 0 invalid | Authoritative local source |
| Generated `hub/catalog.js` | 33 | 33 | 0 invalid | Exact ID/version match with manifests |
| Supabase public catalog endpoint | 17 | 17 | Public endpoint returns published rows only | 16 local games are not publicly exposed; no public-only IDs were found |
| Deployed GitHub Pages catalog | 33 | 33 | 0 invalid | Exact ID/version match with generated catalog |

The Supabase public catalog is therefore a visibility subset, not a complete mirror of the local collection. Its 16 missing local IDs are: `angry-birds-epic`, `b-cubed`, `ballistic`, `bloons-td-5`, `dr-driving`, `drive-mad`, `eaglercraft-26-2`, `gta-3`, `gta-vice-city`, `head-soccer`, `hill-climb-racing`, `monkey-mart`, `pvz2-gardendless`, `ragdoll-drop`, `shadow-fight-2`, and `turball`. No extra game exists in the public database response that lacks a local payload.

The public response also reports versions for some shared entries where the local manifest is unset or has a different value: `baggio-magical-kicks`, `ragdoll-hit`, `subway-surfers-new-york`, `tiny-fishing`, and `turball`. These are catalog metadata discrepancies to reconcile through the existing admin/catalog workflow; no payload is being invented or removed.

## Persistence audit

### Existing persistence

- The hub stores recently played IDs and local play counts in `localStorage`.
- The hub stores anonymous ticket credentials in `localStorage`.
- The shared branding overlay stores the Home Button corner in `localStorage`.
- PvZ2 has a game-specific `docs/save-store.js` that mirrors selected localStorage keys into IndexedDB, restores them at boot, requests persistent storage, flushes on page hiding, and supports save export/import.
- Other games retain their own runtime storage behavior where present, but there is no centralized adapter contract or independent per-game save namespace managed by the hub.

### Missing or unverified persistence requirements

- No hub-level IndexedDB save database with game ID, slot, version, integrity, backup, migration, or recovery records.
- No standard adapter interface for checkpoint, level-completion, progression, or settings saves.
- No general Continue/New Game/Reset Save flow.
- No save-management UI for viewing, exporting, importing, restoring, deleting, or resetting a single game's saves.
- No save-level classification for all games.
- No cross-game save-isolation test.
- No evidence that each imported game's supported progress survives browser restart.

## Hub integration audit

The current hub has search, categories, navigation, recently added, featured/trending views, a screenshot gallery, and a basic local play count/recent list. The following prompt requirements are not implemented or not evidenced:

- Favorites and a persistent Favorites section.
- Individual game information pages with screenshots, statistics, Favorite, Play, and Continue controls.
- A single registry powering all collection surfaces without a second client-only source of truth.
- General progression summaries on cards and detail pages.
- Durable last-played, time-played, completion, and progress statistics.
- Correct Play versus Continue routing based on a validated save.
- Collection integrity reports comparing eligible registry entries with rendered entries.

Static inspection also found stale legacy references in `hub/app.js` (including an undeclared `currentPage` assignment in search handlers and older `setHubView`/home-element paths). The file passes syntax validation, but these paths require browser-level testing before shared routing/rendering changes are made.

## Acquisition and self-hosting audit

Most game directories contain substantial local payloads and local entry files. However, the following cases are not equivalent to fully self-hosted acquisition:

- `Tiny-Fishing` launches a third-party URL inside an iframe and is internet-required.
- `Turball` launches the official third-party service inside an iframe and is internet-required.
- `Eaglercraft-1-8-8` uses a local iframe wrapper around a local HTML payload; the wrapper is local, but its runtime independence and artifact provenance still need explicit verification.
- Several locally stored games retain external analytics, CDN, account, advertising, or online-feature references. These must be classified per game rather than treated as a collection-wide pass.
- Existing acquisition reports explicitly leave some browser, audio, save, backend, and 60 FPS requirements untested.

Under the master prompt, Tiny Fishing and Turball must remain classified as external access/dependency cases unless their actual playable payloads are legitimately acquired. They must not be reported as fully local acquisitions.

## Testing baseline

- `npm test`: passed.
- `node --check Octo-Industries/BehindTheScenes/hub/app.js`: passed.
- `node --check Octo-Industries/BehindTheScenes/scripts/sync-games.mjs`: passed.
- Four-source registry comparison: repository 33, generated catalog 33, Supabase public catalog 17, deployed Pages catalog 33.
- Catalog generation was not rerun during this audit because it can rewrite generated banners and inject branding into game launch files.
- No browser/iPad/Safari/Edge test was run in this audit.
- No per-game 60 FPS frame-time measurement was run in this audit.
- No full save/close/reopen/Continue test was run in this audit.

## Required implementation work

The work should be staged in this order:

1. Add a backward-compatible, centralized persistence module and explicit game adapter contract, preserving PvZ2's existing save behavior.
2. Extend registry metadata with acquisition/runtime/save/test classifications and keep generated catalog output authoritative.
3. Add hub persistence for favorites and statistics, then add game detail routes/pages and validated Play/Continue controls.
4. Add save-management UI and safe export/import/reset/backup behavior.
5. Add import-queue and update-state models through existing admin/job extension points, with evidence and approval states.
6. Audit each registered game, classify external dependencies, and generate the required technical reports without inventing unverified results.
7. Run browser/device tests and record unresolved limitations; do not mark unsupported requirements as passed.

## Implementation status

The user explicitly approved the seven implementation stages. The collection-integrity guard is the first implementation step and must preserve the 33 baseline IDs while allowing future additions; it must not hardcode 33 as a maximum.
