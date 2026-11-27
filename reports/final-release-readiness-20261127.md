# Final Release Readiness and Security Audit - 2026-11-27

## Executive result

The repository is technically ready for release-candidate review, but it is not yet production-ready by physical-device or live-infrastructure evidence. No production deployment, credential rotation, merge or database migration was performed.

## Security audit

### Verified

- Current repository secret scan: 0 findings.
- Built GitHub Pages artifact secret scan: 0 findings.
- Environment examples now contain placeholders only.
- The artifact does not contain environment files or backend source.
- Publication policy and static preview deny server-source paths and repository secrets.
- Secret scanning no longer exempts entire public game or config files.
- Browser-public Google/Firebase API-key values are allowed only by exact SHA-256 fingerprints.

### Historical exposure

History contains old credential-bearing environment examples. The history scan identified these credential classes; treat their historical values as compromised if they were ever active:

| Credential class | Evidence | Required action |
|---|---|---|
| Supabase service-role/server key | Earlier `supabase/.env.local.example` history blob | Rotate/revoke if active; update Edge Function runtime |
| Admin session-signing secret | Earlier `supabase/.env.local.example` history blob | Replace; existing signed sessions will expire |
| Admin password hash | Earlier `supabase/.env.local.example` history blob | Change underlying password and regenerate the PBKDF2 hash |

Browser-public Firebase/Supabase configuration values are not treated as server credentials.
The history scan did not identify embedded Gemini, GitHub token, or database-password values. The workflow's references to GitHub secret names are configuration, not evidence that the secret values were committed. Confirm those values' scope/age in provider dashboards without copying them into logs.

Rotation and history rewriting require repository-owner authorization. Deleting this credential history is not possible safely by ordinary worktree changes and must not be done with `git reset`, force-push or destructive history operations.

### Manual instructions

1. Export or document current live secret names only through the Supabase and GitHub dashboards.
2. Revoke exposed keys in their provider dashboards.
3. Generate replacements outside the repository.
4. Set replacements as Supabase Edge Function secrets or GitHub Actions secrets only.
5. Update the Pages `SUPABASE_FUNCTIONS_URL` repository variable if the project reference changed.
6. Re-run repository and artifact secret scans.
7. If organizational policy requires removing credentials from reachable history, use an approved secret-history cleanup plan and force-push only with repository-owner authorization.

## Database staging validation

The following migrations were applied twice in an isolated disposable PostgreSQL 16 container with Supabase role names, representative existing games and feedback records:

- `20260101000000_edge_function_support.sql`
- `20260102000000_inquiry_tickets.sql`
- `20261123000000_game_acquisition_queue.sql`
- `20261123010000_game_registry_classifications.sql`
- `20261126000000_catalog_game_versions.sql`

Verified results:

- Both passes completed successfully.
- Existing game ID, title and published status were preserved.
- Existing ticket ID, message and status were preserved.
- Ticket numbers and medium priority defaults were added.
- Existing games received default `1.0.0` version and unverified registry classifications.
- The acquisition queue table was created and accepted a sample queue record.
- Reapplying the migrations did not duplicate or replace the preserved records.

The Drive Mad seed migration (`20261116000000_register_drive_mad.sql`) was not included in that disposable migration test. None of these tests used the live Supabase project.
Staging authority and production migration approval remain blocked. Supabase workflow deployments are now manual and migrations are opt-in; no migration is applied unless `apply_migrations=true` is selected in the `supabase-production` approved environment.

Before production migration:

1. Create a dated backup/snapshot.
2. Apply migrations to an approved staging Supabase project.
3. Run live schema/constraint queries and a row-count preservation report.
4. Confirm `anon`, `authenticated`, and `service_role` role grants exist.
5. Set the GitHub `supabase-production` environment and required secrets/variables.
6. Run the workflow manually with migrations disabled first, verify functions, then use a second approved run with migrations enabled.

## iPad and browser compatibility

### Verified by emulated automation

- iPad Mini portrait.
- iPad Air landscape.
- iPad Pro Split View-sized width.
- Stage Manager-sized viewport.
- Touch-size CSS under coarse-pointer mode.
- Portrait and landscape overflow containment.
- Dynamic viewport and safe-area CSS.
- External-keyboard command search.
- Session expiry recovery.
- Theme, personalization and draft behavior.
- WebKit iPad profile layout and session recovery.
- Firefox and WebKit engines receive cross-browser configuration through the verify workflow.

These are Playwright emulations and must not be described as physical iPadOS evidence.

### Physical-device manual gates

- Native iPadOS Safari portrait and landscape.
- iPad Mini, iPad, iPad Air and iPad Pro hardware.
- Split View and Stage Manager resizing.
- Physical touch targets and gestures.
- Virtual keyboard resize and focus behavior.
- Apple external keyboard shortcuts and text editing.
- Trackpad hover-free navigation and two-finger scrolling.
- Hardware WebGL and Web Audio behavior.
- Real save browser-close/reopen and restore behavior.
- Device-specific 60 FPS frame-time evidence.

## Game and content integrity

- Generated catalog count: 36.
- Duplicate catalog IDs: 0.
- Catalog launch files missing from the repository: 0.
- Generated catalog launch paths returning HTTP success: 36/36.
- Existing game directories and metadata were not deleted.
- Public catalog is generated from the existing registry and no game payload was replaced.

Audio, save and performance remain partially verified by automated MIME/content checks and unit tests. Physical playback and 60 FPS measurements are unverified.

## GitHub Pages and Supabase configuration

- GitHub Pages build completed successfully before the final Codespaces/publication-policy guards.
- The earlier published Pages artifact secret scan reported 0 findings; rerun both build and artifact scan after the final guards.
- Pages workflow uses a repository variable for the Supabase functions URL.
- Supabase function workflow no longer deploys automatically on `main`.
- Supabase migrations now require explicit workflow input and approved `supabase-production` environment.
- Supabase access token, database password and project reference remain external GitHub secrets/variables.
- Supabase service-role credentials remain server-side only.
- Codespaces forwarded hosts disable API routing unless an explicit staging override is present; static preview does not call production admin APIs.

## Original requirements

The repository does not contain the original numbered 28 engineering requirements as a recovered, complete artifact. Repository reports contain implementation stages and acquisition/persistence audits, but no source was found that proves an exact original 28-item list. Requirement 29 iPad-first compatibility is now implemented and emulated but not physically certified.

## Release readiness checklist

| Area | Status |
|---|---|
| Backend unit behavior | Verified |
| Frontend/unit behavior | Verified |
| Publication/tooling tests | Verified |
| Chromium/mobile/tablet/iPad desktop-profile browser matrix | Verified |
| WebKit iPad profile layout/session/keyboard | Verified by emulation |
| Firefox/WebKit CI installation configuration | Verified |
| Pages build and secret artifact scan | Passed before final guard changes; rerun required |
| Catalog launch and integrity checks | Verified |
| Migration SQL against isolated PostgreSQL | Verified; staging Supabase pending |
| Backward-compatible catalog/ticket data | Verified in isolation |
| Production credential rotation | Blocked; manual owner action |
| Production migration approval | Blocked |
| Production Supabase deployment configuration | Blocked until secrets/variables/environment are confirmed |
| Physical iPad/Safari compatibility | Unverified |
| Physical touch, keyboard and trackpad behavior | Unverified |
| Real audio/save/performance verification | Unverified |
| Production readiness | Blocked |

## Pre-deployment review delta

- Current worktree secret scan: 0 findings; historical scan still flags old Supabase/admin authentication material described above.
- The static Codespaces preview at port 8080 denies `.env`, backend source, `.git`, and internal report paths.
- Current Pages build should be rerun by CI after the final Codespaces routing/publication-policy guard changes; the earlier successful Pages artifact predates those small guard changes.
- After those changes, source checks passed; 87 unit/tooling tests passed; the repository scan found 0 potential credentials; and the full 175-test browser matrix passed against the guarded current-source preview. A post-guard Pages build, built-artifact browser run and artifact scan remain pre-merge gates.
- Full commit, iPad manual QA, credential rotation and deployment sequencing are in `reports/final-predeployment-handover-20261127.md`.
