# Final Pre-deployment Handover

## Status and boundaries

- Current branch: `development/admin-overhaul-20261127`.
- No files are staged; no commit, merge, production deployment, credential rotation, or production migration was performed.
- Worktree includes the completed implementation plus intentional game/catalog changes and deletions. Do not reset, clean, or bulk-revert it.
- The original 28-item requirement list is not present in the repository or supplied in the handover materials. Those requirements cannot be individually checked until the authoritative list is provided. Requirement 29 (iPad-first) is documented below with physical-device verification still outstanding.

## Live Codespaces preview

A guarded static preview is running on port 8080. Open the **Ports** panel in VS Code/Codespaces, find port `8080`, keep its visibility **Private**, and use **Open in Browser**. For an iPad, copy the forwarded HTTPS address and open:

`https://<CODESPACE_NAME>-8080.app.github.dev/Octo-Industries/BehindTheScenes/admin/`

The public hub is at the forwarded base URL. The preview serves the worktree using `scripts/serve-static.mjs`, not Python's unrestricted `http.server`. Verified HTTP responses: root and admin return 200; `.env.local`, `.env.local.example`, Supabase function source, `.git/config`, and internal reports return 404.

**Preview limitation:** Codespaces-hosted pages deliberately disable API requests unless an explicit staging API override is supplied. This prevents login or dashboard actions from falling through to production Supabase. The static admin login page is available, but authenticated workflows are not testable through this static-only preview. Do not enable a production API URL for convenience. For full workflow testing, prepare an approved staging-backed preview with a staging-only admin account and an origin explicitly allowed by staging CORS; do not use production credentials or data.

To restart the static preview in this Codespace, stop the existing port-8080 process first, then run:

```sh
PORT=8080 node scripts/serve-static.mjs .
```

Keep the port private. Do not use `python3 -m http.server` from the repository root.

## Worktree and commit hygiene

Current audit found:

- `supabase/.env.local` is ignored and not tracked.
- `.env.example` and `supabase/.env.local.example` contain placeholders, not actual values.
- Current repository secret scan: zero findings.
- Historical scan still identifies a committed Supabase service-role key and admin authentication material in an earlier `supabase/.env.local.example` blob. Treat the key and corresponding admin authentication secrets as compromised if they were ever active; details and rotation procedure are in `final-release-readiness-20261127.md`.
- The publication policy denies secrets, `.log`/`.map`, tests, backend source, and environment files. A stray Iron Snout crash log and source-map stub are ignored and excluded from publication.
- No `dist/`, browser report, or Playwright output directory is intended for commit.
- The complete diff deletes four root-level image files (`IMG_1757.png`, `IMG_1758.png`, `Screenshot 2026-11-17 081722.png`, and `outodatef error.PNG`); confirm those removals are intentional before staging. The Ragdoll Hit compatibility shim was moved to the shared local branding path and is referenced by both its page and service worker.
- New game source/assets are intentionally untracked, not temporary build output. Confirm redistribution rights before release, particularly for the Brotato game payload; its bundled MIT notice covers the cross-origin-isolation helper, not demonstrably the underlying game.

### Suggested commit sequence (plan only; nothing is staged)

1. **Admin/API safety:** dashboard structure/styles/scripts, workspace behavior, API read/write safeguards, catalog sync, backend/frontend regression tests, and `hub/config.js` Codespaces production-fallback guard.
2. **Publication and CI:** publication/preview/scan scripts and tests, build enforcement, Pages workflow checks, and manual/opt-in Supabase deployment workflow.
3. **Schema and registry:** all Supabase migrations, catalog/version/classification sync, migration documentation. Keep schema changes separate from production deployment approval.
4. **Game runtime/content:** game manifest/runtime changes, locally available game payloads, banners/licenses, and related generated catalog. Include intentional old-file deletions only after confirming replacements and game permissions.
5. **Handover/docs:** README and reports, sanitized environment example, final pre-deployment handover.

Stage and inspect each group separately. Do not use `git add -A` without checking ignored/untracked output and the staged diff. Preserve the existing deletions; verify they are intentional replacements/removals before staging. Use normal commits on this branch; no history rewriting.

## Catalog and data preservation

Current catalog compared with `HEAD`:

- Baseline: 33 game IDs; current: 36.
- Missing baseline IDs: 0; duplicate IDs: 0.
- Added IDs: `brotato`, `iron-snout`, `krillion`.
- All 36 launch paths returned HTTP success from the guarded preview and resolve to local repository launch files.
- Baseline metadata changes are limited to added version metadata for five existing entries, explicit external/unavailable classification for Tiny Fishing, and acquisition/runtime metadata for Turball. No existing game ID was silently dropped.
- Supabase record preservation was tested with sample data in isolated PostgreSQL, not against live Supabase.

Do not treat this as proof of rights to redistribute every game payload. Confirm source licensing/permission before publishing new or previously imported payloads.

## Manual iPad QA checklist

Run on physical iPadOS Safari, not only Playwright emulation. Use a staging-backed account and staging database. Test iPad Mini, standard iPad, iPad Air, and iPad Pro; capture OS/Safari versions, viewport, screenshots, and outcomes.

### Authentication and workspace

- Sign in, wrong password, loading/error states, sign out, expired session, and recovery after refresh.
- Verify no stale private ticket/chat content remains after sign-out/expiry.
- Dashboard cards, counts, empty states, loading/error/retry paths, and refresh.
- Light/dark theme switch and persistence after refresh.
- Widget visibility/order/reset and persistence.
- Notifications filtering/read state.
- Command search keyboard shortcut; arrow/return/escape; touch selection.

### Catalog and operations

- Game search, category/status filters, sorting, and clear filters.
- Edit valid/invalid metadata; cancel and save; verify conflict/error handling.
- Registry classifications: filter/search status; inspect the evidence and classification; change only to a supported, evidence-backed value; verify save, conflict and API-failure behavior without marking unverified games as playable.
- Publish/unpublish confirmation; verify displayed state after API response.
- Catalog sync preview, review and confirmation; verify existing metadata is not overwritten.
- Standalone hub build action and download result.
- Jobs search/details/retry where available; diagnostics refresh and database/API failure states.
- Acquisition queue load/create, evidence validation, approval/rejection states, and unavailable-schema state.
- Source inspector validation, progress, unsafe URL rejection and error display.

### Inbox and roadmap

- Search, status/priority filters, sorting and pagination/scrolling.
- Open details/conversations (confirm this is read-only); edit notes/reply drafts; refresh and ensure drafts recover.
- Send a reply; edit status/priority; archive, restore, trash and recover.
- Bulk actions with all-success, partial-success and total-failure responses; verify selections and confirmation text.
- Roadmap create/edit/archive, filters/search, bulk selection/update, validation and API failure.

### AI, touch and responsive behavior

- AI prompt submission, streaming/loading or disabled state, safe rendered response, API failure.
- Test external keyboard typing, shortcuts, tab order, focus visibility, enter/escape and text editing.
- Trackpad pointer, hover-free operation, two-finger scroll, nested table scroll, dialogs.
- Test virtual keyboard opening/closing while editing and searching; verify focused controls remain visible.
- Portrait, landscape, Split View, Stage Manager resize; no horizontal page overflow or overlapping content.
- Confirm touch controls are at least 44 CSS px where applicable; test dialogs and table affordances by touch.
- Confirm audio/load/save workflows only for games selected for device QA; test save after browser close/reopen and document frame-time/performance rather than infer it.

Automated Playwright profiles are emulated desktop Chromium/WebKit, not physical iPad hardware. Following the final Codespaces/publication guards, the complete matrix passed 175/175 against the guarded current-source preview; 55 focused admin regressions also passed across five profiles, and focused WebKit iPad emulation previously passed 6/6. The default built-`dist` e2e path was not available because no post-guard Pages build was produced. Physical Safari, touch, virtual keyboard, Apple keyboard/trackpad, audio, save durability, and GPU performance remain unverified.

## Credential rotation procedure

History evidence names the committed credential classes without reproducing values:

1. Supabase service-role/server key.
2. Admin session-signing secret.
3. Admin password hash, and therefore the underlying admin password.

Treat these as compromised if active. The history scan did not identify committed live Gemini or GitHub token values; the presence of corresponding secret names in configuration is not proof of exposure.

For safe rotation without unnecessary downtime:

1. Arrange a maintenance window. Record active secret *names and provider status only*; never paste values into chat, terminal logs, issues, or reports.
2. In Supabase project settings, identify whether the service-role credential is a legacy JWT-derived key or a newer project secret key. Follow the provider's rotation path for that key type. If overlap is supported, create a replacement, update the Edge Function runtime, deploy and smoke-test, then revoke the old key. If rotation invalidates all project JWTs immediately, schedule it as a breaking change and update all consumers together.
3. Set a new random `ADMIN_SESSION_SECRET` (at least 40 random characters for this local setup) in Supabase Function secrets. Expect existing admin sessions to expire; verify new login before closing the maintenance window.
4. Change the admin password; generate a new PBKDF2 hash using `npm --prefix Octo-Industries/BehindTheScenes run admin:hash` locally. Transfer the resulting hash directly into the Supabase secret UI or another approved secret channel, not into source control.
5. Verify the admin login, catalog read, feedback read, one reversible staging mutation, AI/GitHub integrations if configured, then revoke old credentials.
6. Confirm `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, GitHub token, and Gemini API key in GitHub/Supabase are scoped, current and not equal to any exposed value. Rotate them only if provider audit confirms exposure or policy requires it; no values were identified in the scanned history.
7. Re-run `npm run security:scan` and the built-artifact scan.

## Database migration plan

Repository migrations, in timestamp order:

1. `20260101000000_edge_function_support.sql`
2. `20260102000000_inquiry_tickets.sql`
3. `20261116000000_register_drive_mad.sql`
4. `20261123000000_game_acquisition_queue.sql`
5. `20261123010000_game_registry_classifications.sql`
6. `20261126000000_catalog_game_versions.sql`

All six were not all previously staged against a real Supabase project. The five support/ticket/acquisition/classification/version migrations were run twice against disposable PostgreSQL 16 with Supabase-like roles and representative base tables; existing sample game and feedback rows survived. The Drive Mad seed migration was not included in that disposable migration test. A real Supabase staging project, its schema drift, RLS/grants, and existing records still require verification.

Before any staging or production run:

1. Take a Supabase backup/snapshot and record row counts for `games`, `feedback`, `roadmap`, and other affected tables.
2. Confirm base tables/columns exist; inspect existing classification values for constraint compatibility; confirm required roles and RLS.
3. Apply migrations in order to staging, one migration at a time where operationally possible; capture migration output and schema diffs.
4. Re-run migrations only after confirming idempotence; test catalog reads/sync, feedback ticket reads/replies, acquisition-queue operations, registry classifications, and version writes.
5. Compare row counts, game IDs/URLs/metadata, feedback status/message/ticket numbers, and RLS/security settings before/after.
6. There are no guaranteed automatic down migrations. For a failed additive migration, stop and inspect before proceeding. For data corruption, restore the approved snapshot/PITR under the database recovery plan; do not improvise destructive SQL.
7. Production remains a separate approved execution. The Supabase GitHub workflow is manual; `apply_migrations` defaults false. It targets the `supabase-production` GitHub environment, so configure required reviewers and secrets before use.

## Deployment and approval checklist

### Before merging

- Provide the original 28 engineering requirements and verify them one-by-one; the repository contains no complete authoritative list.
- Complete source/game redistribution-rights review, especially new payloads.
- Complete physical iPad QA and staging Supabase migration/function verification.
- Review every staged file and deletion; verify no env/local secret, `.log`, `.map`, `dist`, Playwright output or backup is staged.
- Run `npm run check`, `npm run test:all`, `npm run pages:build`, built-artifact `npm run test:e2e`, `npm run security:scan`, and `node scripts/scan-secrets.mjs --artifact`. After the final guard changes, source checks, 87 unit/tooling tests, `npm run security:scan` (0 findings), and the complete 175-test browser matrix against the guarded source preview have passed. The post-guard Pages build, built-artifact browser run and artifact scan remain required before merge.
- Confirm branch protections, reviewer approvals, GitHub Pages Actions source and Pages environment.

### GitHub Pages

- Set repository variable `SUPABASE_FUNCTIONS_URL` to the approved production Edge Functions base URL.
- Pages workflow builds `dist`, scans the artifact, runs unit/browser verification and deploys on a push to `main`.
- Confirm the artifact contains local launch paths, no secrets/backend files, and no game assets requiring third-party CDNs.

### Supabase

- Configure the GitHub `supabase-production` environment with required reviewers.
- Set Actions secret `SUPABASE_ACCESS_TOKEN`, secret `SUPABASE_DB_PASSWORD`, and variable `SUPABASE_PROJECT_REF`.
- Verify Supabase Edge Function secrets for service key, admin session secret, password hash, and optional Gemini/GitHub integrations.
- Deploy functions manually with migrations disabled first. Validate health and authentication.
- Only after separate approval and backup, run a second manual workflow with `apply_migrations=true`; review output and verify schema/data.

### Controlled merge and release

1. Keep changes on `development/admin-overhaul-20261127`; create commits per the plan above after staging review.
2. Push this development branch and open a PR to `main`; do not push directly to `main`.
3. Require CI, security scan, Pages build, browser matrix, staging migration evidence, physical iPad sign-off, and owner approvals.
4. Merge only after approval. The Pages workflow will deploy from `main`; verify deployment URL, catalog, local game launches, and secret scan.
5. Deploy Supabase functions manually; migrations remain disabled unless the approved migration change window is active.
6. Monitor error logs and admin access. Have the prior Pages artifact and Supabase backup/PITR reference ready for recovery.

## Remaining verification

- Original engineering requirements 1–28: unavailable; source must be supplied.
- Requirement 29 physical iPadOS Safari across requested hardware: unverified.
- Real staging Supabase migrations and schema/data preservation: pending.
- Live credential rotation/revocation: owner action required.
- Game payload rights for every existing/new game: not established by automated tests; owner/legal review required.
- Real game audio, save persistence after browser restart and 60 FPS performance: not comprehensively verified.
- Production deployment/configuration and release readiness: blocked until approval gates above are closed.
