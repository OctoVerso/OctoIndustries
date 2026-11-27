# Administration platform audit and implementation plan

Audit date: 2026-11-27. Baseline commit: `6b6b4ec` on `main`.

## Scope and recovery boundary

This work preserves GitHub Pages, the public website design, game assets, Supabase, Gemini, and GitHub proposal integrations. No production deployment or database mutation is authorized by this report. The working tree already contains substantial user changes, deletions, and untracked games. These must not be reverted or attributed to this overhaul. Working copies of affected files were saved under `/tmp/vscode-agent-codex-sandbox-gQIXLS/octo-baseline/`; this temporary local checkpoint is not a durable backup. Preserve the working tree and review a selective patch before committing. Do not reset to HEAD to roll back this work.

## Architecture and existing behavior

| Area | Implementation and responsibilities |
| --- | --- |
| Public site | Root HTML plus `BehindTheScenes/hub/`; static catalog, local games, feedback tickets, persistence and hash routing. Preserve presentation. |
| Administration | Vanilla JS, HTML, CSS under `BehindTheScenes/admin/`; overview, game metadata/publishing, roadmap CRUD, inquiry status/priority/notes/conversations/archive/soft-delete/bulk, jobs, acquisition queue, page inspection, Gemini chat and proposals. |
| API | Six Supabase Edge Functions share handlers, validators, signed-session authentication and database access. Browser logical `/api` paths map to functions. |
| Database | Service-role access from functions; RLS denies direct browser access. Migrations for session/rate-limit support, tickets, acquisition queue, classifications and versions. Base schema predates these migrations. |
| Integrations | Gemini receives library context and chat; GitHub token creates reviewed proposal PRs; inspector fetches approved HTTP resources with SSRF checks; static build runs catalog sync. |
| Deployment | Pages workflow builds `dist`; separate Supabase workflow deploys migrations and functions on main. No workflows triggered during this work. |
| Legacy material | `functions/`, `migrations/`, offline exports and legacy output directories exist. Preserve historical recovery material; exclude it from Pages artifacts. |

## Initial findings and priority

1. **High — catalog writes during dashboard reads.** Initialization imports missing games automatically; upsert can reset existing publication and metadata if concurrent syncs overlap. Require explicit preview/confirmation and insert-only conflict handling.
2. **High — misleading mutation results.** Bulk feedback returns requested ID count even if records do not exist. Follow-on audit failures can turn committed actions into apparent failures. Report actual rows and separate audit warnings.
3. **High — implicit ticket transitions.** Opening details/conversations changes new tickets to under review. Reads and diagnostics must leave operational status unchanged.
4. **High — public build boundary.** Copy filter includes backup, test and potentially secret/config files nested in the game tree. Add an explicit publication policy and artifact checks. A local preview serves the repository root and must not expose dotfiles or backend source.
5. **Medium — dashboard usability.** Desktop navigation becomes icon-only below 1400px; tiny table text, dense cards, nested scrolling, no light theme, command palette, notifications or widget preferences.
6. **Medium — refresh and concurrency.** Background re-renders can discard reply/note drafts. Requests lack a client timeout and action coordination. Authentication expiry must invalidate in-flight responses and clear sensitive memory.
7. **Medium — metrics scope.** Recent jobs/activity are limited snapshots; labels must disclose scope and unavailable data must not become zero.
8. **Medium — QA baseline.** Backend baseline passes; frontend baseline has a legacy redirect test failure. Catalog E2E currently expects implicit writes and a hardcoded catalog size.
9. **Medium — production schema drift.** Read-only live metadata shows 11 public tables, all with RLS enabled. Acquisition queue is absent. Do not claim that workflow is operational until its existing migration is separately approved, backed up and tested.

## Live security evidence

Supabase security advisor: 11 informational RLS-without-policy notices, consistent with the intentional service-role-only architecture; one warning for leaked-password protection in Supabase Auth. That setting does not protect this custom admin password system. No direct public policies should be added to silence these notices. Live schema/configuration and stored records are separate from repository migration intent.

## Implementation stages

1. Preserve baseline, inventory integrations and risks, run existing tests; collect metadata only from production.
2. Introduce admin-only semantic design tokens, responsive labeled navigation, theme and accessible dialogs. Keep current endpoint contracts and useful controls.
3. Add command navigation/search, snapshot-based notification center, locally saved widget visibility/order, labeled real-data charts and read-only operational diagnostics.
4. Fix catalog/ticket/bulk/concurrency behavior and backend validation with regression tests. No database migration required for these fixes.
5. Harden static publishing/preview, add non-deploying CI checks, scan tracked files/history without printing secret values, document deployment and recovery.
6. Exercise functional and failure cases in available browser engines; inspect responsive layouts and production artifact. Report executed results, environment limits and remaining release gates.

## Approval boundaries

Backend replacement, authentication redesign, database migrations, credential rotation, infrastructure changes, important deletion and production deployment remain separate approval steps. Safe alternative: preserve existing architecture and provide a locally tested patch plus exact release checks. Never use the attached local environment file in a browser or build artifact; do not print its values.
