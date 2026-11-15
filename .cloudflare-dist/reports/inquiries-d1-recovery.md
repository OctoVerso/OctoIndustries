# Inquiries D1 Incident And Recovery Report

## Current Finding

- Reported symptom: authenticated `GET /api/admin/feedback` returns HTTP 500 with a generic Cloudflare D1 error.
- Confirmed failing implementation: the Render Node admin service in `Octo-Industries/BehindTheScenes/admin/server.mjs`, which calls the Cloudflare D1 REST `/query` endpoint.
- The Pages Functions implementation is a separate path using the native `ADMIN_DB` binding.
- Configured D1 identity: account `f302bb52008546bfbd9b3d66d6f9e444`, database `30379fff-1967-4f33-85d3-7df2627fe833` (`octo-industries-admin`). The account/database IDs match `render.yaml` and `wrangler.toml`.
- `CF_D1_API_TOKEN` is a Render `sync: false` secret. Its production presence, scope, and validity cannot be inspected from this workspace. No Cloudflare credentials are present locally.
- Authenticated Render admin errors now include the Cloudflare HTTP status, error code/message, `cf-ray`, and application request ID. Corresponding service logs retain the provider details for request correlation without logging the API token.

## Audit Results

- Authentication: the admin API requires the existing session; non-GET admin actions additionally require same-origin and CSRF validation.
- D1 routes: Cloudflare Pages uses `env.ADMIN_DB`; the Render service uses `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and `CF_D1_API_TOKEN` for REST queries.
- Schema: `0001_admin.sql` creates admin state/session tables; `0002_feedback.sql` creates the legacy feedback tables; `0003_ticketing.sql` copies legacy inquiry content/notes/device data into the ticket schema and creates ticket history tables.
- Both runtime D1 paths previously attempted to upgrade/create ticket tables during requests. Runtime schema writes have now been removed: the Worker and Render service perform read-only checks and return an actionable schema-not-ready error. The checked-in `0003_ticketing.sql` remains an explicit, operator-run migration; no migration was run during this audit.
- Data locations: no local `.octo-data`, database file, JSON export, SQL backup, or backup script was found. `wrangler.toml` declares D1 only; no KV or R2 binding is configured. Historical inquiries are therefore expected in the configured D1 database unless an external operator backup exists.
- Recovery performed: none. Production rows were not read, changed, or deleted. Records recovered: 0. Records missing: unknown, not established.

## Root Cause Status

The exact provider-side root cause is **not yet confirmed**. The leading configuration failure mode is a missing or invalid `CF_D1_API_TOKEN`: the Render blueprint deliberately does not populate this secret, while account and database IDs alone enable the REST path. A missing/incorrect schema or a rejected legacy-upgrade query can produce the same generic response. Do not label any one of these as confirmed until the Render log's provider status/code is checked.

## Code Change

`Octo-Industries/BehindTheScenes/admin/server.mjs` names missing D1 environment variables in its fail-fast startup diagnostic and includes provider HTTP status/error code/message, `cf-ray`, and the application request ID in authenticated admin diagnostics. Both D1 runtime paths now verify required tables and columns without creating or migrating schema. No SQL or data mutation was made. Targeted tests validate that legacy-schema requests fail safely without running DDL.

## Safe Recovery Sequence

1. In Render's environment for `octo-industries-hub-web`, verify that `CF_ACCOUNT_ID` and `CF_D1_DATABASE_ID` match the IDs above and that `CF_D1_API_TOKEN` is set with the required D1 database permissions. Do not paste the token into chat or logs.
2. In Render logs, find the failed request by its `X-Request-Id` and record the Cloudflare error code/message and `cf-ray`. This identifies whether the failure is authorization, wrong database/account, or SQL/schema.
3. Before applying migrations, export the remote database to a protected local file:

   ```sh
   npx wrangler d1 export octo-industries-admin --remote --output ./octo-industries-admin-before-recovery.sql
   ```

4. Inspect schema and counts read-only:

   ```sh
   npx wrangler d1 execute octo-industries-admin --remote --command "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE '%feedback%' ORDER BY name"
   npx wrangler d1 execute octo-industries-admin --remote --command "PRAGMA table_info(feedback_submissions)"
   npx wrangler d1 execute octo-industries-admin --remote --command "SELECT COUNT(*) AS inquiry_count FROM feedback_submissions"
   ```

5. Only after the export and schema inspection, apply the pending D1 migration using the repository migration workflow. Then compare inquiry counts and sample-preserving fields (`id`, `message`, `device_info`, `admin_notes`, `created_at`, `updated_at`) before and after. Do not manually drop, clear, or overwrite tables.

## Status

- Latest user-reported state (2026-10-21): the schema guard returns HTTP 503 and reports missing ticketing tables/columns. This production state was not independently queried from this workspace; see [`inquiries-production-schema-upgrade.md`](./inquiries-production-schema-upgrade.md) for the gated recovery plan.
- Root cause found: **pending provider error details**.
- Files modified: `Octo-Industries/BehindTheScenes/admin/server.mjs`.
- SQL queries/migrations applied: none.
- Records recovered: 0; records missing: unknown.
- Database status: unverified remotely; configured D1 identity is consistent across local deployment files.
- API status: reported HTTP 500; local error diagnostics improved.
- Inbox status: user reports ticket schema validation failure; production API recovery is not independently verified.
- Validation: `npm --prefix Octo-Industries/BehindTheScenes test` passed (13 tests); Worker admin/feedback/roadmap tests passed (11 tests).