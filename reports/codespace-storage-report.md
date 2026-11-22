# Codespace Storage Report

Audit date: 2026-11-19  
Workspace: `/workspaces/OctoIndustries`

## Ranked storage

Sizes are rounded from `du`; tracked deliverables are identified so they are not mistaken for disposable caches.

| Rank | Directory | Size | Assessment |
|---:|---|---:|---|
| 1 | `.git/` | 2.7 GB | Git object pack about 1.9 GB; Git LFS objects about 851 MB. Preserved. |
| 2 | `Octo-Industries/` | 2.1 GB | Active game sources/assets, including about 1.4 GB of PvZ2 data. Preserved. |
| 3 | `offline_exports/` | 1.2 GB | 15 tracked standalone HTML exports; largest are PvZ2 (558 MB) and Angry Birds Epic (334 MB). Preserved. |
| 4 | `/home/codespace/.cache/` | 520 MB | Mostly Copilot-managed packages (~518 MB); not removed to avoid disrupting the Codespace tooling. |
| 5 | `.cloudflare-dist/` | 351 MB | 1,428 tracked files; generated/deployment copy of the site. Preserved. |
| 6 | `node_modules/` | 130 MB | Installed project dependencies, not disposable cache; preserved for builds. |
| 7 | npm cache | 58 MB before cleanup | Safe package-download cache; cleaned. |

The workspace itself is about 6.3 GB. Before cleanup the `/workspaces` filesystem had 12.08 GB available; the final reading was 12.98 GB available (about 13 GB free on a 32 GB filesystem, 60% used). The filesystem is shared with other Codespace data, so free-space readings can fluctuate.

## Largest files

| Approx. size | File | Assessment |
|---:|---|---|
| 1.90 GB | `.git/objects/pack/pack-34c5207da5b529e77d89f9d12392b8b60be26b98.pack` | Git history/object pack; retained. |
| 558 MB | `offline_exports/PvZ2.html` | Tracked generated export; retained. |
| 558 MB | `.git/lfs/objects/18/77/18775d311d82071c08a439c6c889513f5ce5715779687e057563f999d1a59d3c` | Git LFS object for the export; retained. |
| 334 MB | `offline_exports/Angry-Birds-Epic.html` | Tracked generated export; retained. |
| 334 MB | `.git/lfs/objects/d1/2a/d12a7ee137a821a6d0cc3e7cc359b7cdb844bf183274bd91980c38bd220f2` | Git LFS object; retained. |
| 94 MB | `Octo-Industries/Angry-Birds-Epic/Build/EpicWeb.data.gz.part1` | Active game build data; retained. |
| 64 MB | `offline_exports/Bloons-TD-5.html` | Tracked generated export; retained. |
| 34 MB | `Octo-Industries/PvZ2/docs/assets/resources/native/1a/1aae2f737.pvr` | Active game asset; retained. |

There are no disposable ZIP archives or obvious stale backup directories in the workspace. Large Unity/WebGL builds, PvZ2 media, offline exports, and the Cloudflare site copy are current tracked content, not safe cache cleanup.

## Duplicates and optimization opportunities

- An exact-content hash audit found 1,398 duplicate groups (2,185 redundant file copies; about 439 MB of working-tree duplication when measured outside Git history, node_modules, and offline exports). Much of this is the tracked Cloudflare output mirroring source assets and the Ruffle runtime repeated across four game folders.
- The Ruffle runtime appears in both source game folders and `.cloudflare-dist/`. Consider a shared runtime path only as a separate deployment change; do not deduplicate by deleting copies without updating and testing each launch path.
- The largest image/media assets are in active game content, especially PvZ2. Re-encoding or converting them requires visual/gameplay validation and is not part of safe cleanup.
- Avoid generating or retaining duplicate offline HTML bundles unless needed. The bundle generator supports an explicit `--output` destination; use a location with sufficient free space and review Git tracking/retention before importing large exports.

## Cleanup performed

- Cleaned the npm download cache and Python pip cache.
- Removed 1,109,069,824 bytes of abandoned `.git/lfs/tmp` download files after confirming no Git LFS process was running; the directory is now empty. Git history and LFS object storage were not altered.
- Removed the 2,144,350,997-byte `dist/` Pages build generated for verification after checking it. It is regenerable with `npm run pages:build`.
- The cache cleanup itself increased available space by 24,408,064 bytes (~23.3 MiB) in the immediate before/after measurement. Across cleanup actions, 3,277,828,885 bytes were removed; that gross figure includes the temporary build output and LFS downloads created during verification. The final filesystem reading was about 894 MB more free than the first reading; shared-filesystem usage can fluctuate.
- Preserved all tracked project files, `node_modules`, game assets, Supabase files, `.git`, and Git LFS content. No project content was removed.
- Added `npm run codespace:clean`, which defaults to a dry run and, with `-- --apply`, removes only eligible untracked root build/cache outputs plus npm's package cache. Tracked content is skipped.
- Added ignore rules for common future build/cache artifacts and documented a recurring maintenance checklist in the README.

## Maintenance checklist

- **Weekly:** run `npm run codespace:clean`; inspect `df -h .` and the largest directories before applying cleanup.
- **Monthly:** review file growth, npm/pip caches, and the duplicate/export footprint; retain only exports still needed.
- **Before major imports:** check free space, inspect archive contents and size, and avoid storing both a large archive and its extracted copy.
- **Before Codespace rebuilds:** push/back up intended work, preview safe cleanup, and remove only regenerable outputs. Do not prune/rewrite Git history or active game files.

## Verification

`npm test` passed all 27 tests. `npm run pages:build` succeeded. All 27 catalog launch targets were present in the generated site, and all 27 source launch pages returned HTTP 200 from a local static server. The generated `dist/` output was removed after those checks.
