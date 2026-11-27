# Engineering Handover - 2026-11-27

## Recovery state

The work was continued on `development/admin-overhaul-20261127` from `6b6b4ec`. The worktree had extensive pre-existing modified, deleted and untracked content, including new games and the dashboard redesign. Those changes were preserved. No reset, force operation, stash, destructive database command or production deployment was performed.

Existing documentation and reports contain an implementation checklist and repository audit, but do not contain a single original, numbered list of exactly 28 requirements. This handover therefore does not claim to recover or invent such a list; the requirements that could be traced from repository reports and this audit are documented below.

## Completed verification

- Backend unit suite: 44 passing.
- Frontend unit suite: 41 passing.
- Tooling suite: 2 passing.
- Current unit/tooling suites: 87 passing in total. After the final Codespaces/publication guards, the complete Playwright matrix passed 175/175 against the guarded current-source preview, and a focused regression run passed 55/55 across iPad Mini, iPad Air, iPad Pro Split View, Stage Manager and desktop profiles. A separate focused iPad-WebKit emulation pass passed 6 tests.
- Production Pages build and artifact scan passed before the final Codespaces/publication guards; rerun them in CI before merge.
- Source syntax and unique admin ID checks passed.
- Current worktree secret scan passed with zero findings. Historical scan still identifies previously committed server/admin authentication material; see `reports/final-release-readiness-20261127.md`.
- Git whitespace check passed.
- Catalog reads remain read-only and manual synchronization is explicitly confirmed.
- Existing catalog records are preserved and partial bulk operations report confirmed and failed rows.
- Session expiry tests pass across tablet and iPad profiles.
- iPad portrait, landscape and split-view layouts showed no document-level horizontal overflow.

## iPad-first implementation

The admin viewport includes the iPad-safe-area viewport setting, coarse-pointer touch target sizing, dynamic viewport heights, touch scrolling, Safari text-size adjustment, portrait drawer behavior, and tablet containment rules. Representative iPad and Stage Manager viewports are now explicit Playwright projects.

Playwright profiles are emulated browser tests. No physical iPadOS Safari, touch, virtual keyboard, external keyboard/trackpad, hardware audio, or GPU performance certification is claimed.

## Remaining release gates

1. The acquisition-queue migration `20261123000000_game_acquisition_queue.sql` remains unapplied until staging approval.
2. The registry-classification migration `20261123010000_game_registry_classifications.sql` remains unapplied until staging approval.
3. The catalog version migration `20261126000000_catalog_game_versions.sql` remains unapplied until staging approval.
4. Existing ticketing and edge-support migrations require verified staging application before release:
   - `20260101000000_edge_function_support.sql`
   - `20260102000000_inquiry_tickets.sql`
5. Live Supabase credentials and real browser sessions were not used for database mutations.
6. Per-game 60 FPS, real-device audio/input/save and Safari hardware behavior remain release verification tasks, not unit-test results.
7. Supabase secrets and GitHub Pages variables must be configured in the deployment environment; no secrets were added to client assets.

## Database policy

Apply migrations only in an explicitly approved backup/staging environment. Verify tables and constraints after each migration. The migrations add or preserve columns and use `if not exists` / conflict-safe patterns where applicable. Do not run them against production without approval.

## Deployment policy

No production deployment or merge was performed. The verified GitHub Pages build is available only locally in `dist/`. Supabase Edge Functions and migrations require the existing approval and deployment workflow.

## Final review correction - 2026-11-27

This handover described browser coverage as verified only where automated emulation could support it. Physical iPadOS Safari, physical touch, physical external keyboard/trackpad behavior, real GPU performance and real-device audio/save behavior remain unverified. See `reports/final-release-readiness-20261127.md` for the final checklist and manual release instructions.

## Pre-deployment handover

The guarded Codespaces preview and full commit/deployment plan are documented in `reports/final-predeployment-handover-20261127.md`. The preview intentionally disables API requests on forwarded Codespaces hosts unless staging configuration is explicitly approved. The original 28-item requirements source remains unavailable.
