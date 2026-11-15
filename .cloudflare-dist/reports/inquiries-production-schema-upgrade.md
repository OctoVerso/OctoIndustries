# Production Inquiries Schema Upgrade Report

**Date:** 2026-10-21  
**Outcome:** Blocked before production access or migration. No D1 query, export, migration, or record modification was performed.

## Executive status

The reported HTTP 503 is consistent with the application's schema guard and the reported missing ticket schema. The guard must remain enabled. This workspace has no Cloudflare API token variables and no Wrangler login configuration, so production cannot be inventoried or backed up from this session.

The reported missing schema is not an independently verified production inventory. Production counts, columns other than those reported missing, statuses, archived count, and note count remain unknown. `migrations/0003_ticketing.sql` is a one-time table-rebuild migration containing `DROP TABLE feedback_submissions`; it is not idempotent. It must not be run against production until the exact remote schema is read, a protected export is produced and verified, and the migration is rehearsed against a restored copy.

## Phase 1 — Database inventory

| Item | Finding |
| --- | --- |
| D1 target | `octo-industries-admin`, configured in `wrangler.toml` |
| Reported missing tables | `feedback_conversations`, `feedback_activity` |
| Reported missing columns | `ticket_number`, `access_token_hash`, `priority`, `archived_at`, `deleted_at` |
| Existing production tables | Unknown; no production access |
| Existing production columns | Unknown except for the missing columns reported above |
| Inquiry count | Unknown |
| Admin note count / non-empty note count | Unknown |
| Existing statuses and per-status counts | Unknown |
| Archived record count | Unknown |
| Read/write/export performed | None |

With authenticated Wrangler access configured, collect the inventory using read-only queries:

```sh
npx wrangler d1 execute octo-industries-admin --remote --command "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
npx wrangler d1 execute octo-industries-admin --remote --command "PRAGMA table_info(feedback_submissions)"
npx wrangler d1 execute octo-industries-admin --remote --command "SELECT COUNT(*) AS inquiry_count, SUM(CASE WHEN COALESCE(admin_notes, '') <> '' THEN 1 ELSE 0 END) AS nonempty_note_count FROM feedback_submissions"
npx wrangler d1 execute octo-industries-admin --remote --command "SELECT status, COUNT(*) AS record_count FROM feedback_submissions GROUP BY status ORDER BY status"
npx wrangler d1 execute octo-industries-admin --remote --command "SELECT COUNT(*) AS archived_count FROM feedback_submissions WHERE status = 'archived'"
```

If the inventory shows that the live schema differs from `migrations/0002_feedback.sql`, stop and reconcile the migration against that schema before proceeding.

## Phase 2 — Backup, rollback, and recovery gate

Cloudflare documents `wrangler d1 export <NAME> --remote --output <PATH>` for a remote SQL export and `wrangler d1 execute <DATABASE> --remote --file <PATH>` to execute a SQL file. Those documented commands are the intended export and import mechanisms; neither was run here.

1. Use a protected location outside the repository and export the entire database (schema and data):

   ```sh
   npx wrangler d1 export octo-industries-admin --remote --output /secure-backups/octo-industries-admin-before-0003-20261021.sql
   ```

2. Protect and verify the artifact locally. Do not commit it, upload it to an unapproved service, or paste its contents into chat. SQL exports contain inquiry text and private admin notes.

   ```sh
   chmod 600 /secure-backups/octo-industries-admin-before-0003-20261021.sql
   test -s /secure-backups/octo-industries-admin-before-0003-20261021.sql
   sha256sum /secure-backups/octo-industries-admin-before-0003-20261021.sql
   ```

   Record the export timestamp, size, and SHA-256 in the operator's protected incident record. Verify that the export contains both schema and data; do not use `--no-data` or `--no-schema`.

3. Verify recoverability before production migration by importing the export into a separate, isolated recovery D1 database, then compare table names, schema, inquiry counts, status counts, and non-empty note counts with the production inventory. Do not import the export over the live database as a test.

   ```sh
   npx wrangler d1 create octo-inquiries-recovery-check
   npx wrangler d1 execute octo-inquiries-recovery-check --remote --file /secure-backups/octo-industries-admin-before-0003-20261021.sql
   ```

4. Rollback is to restore the verified export into a separate replacement D1 database, verify it, then deliberately point the application binding/configuration back to that database. Do not run a blind SQL “down” script or overwrite the migrated live database. D1 time-travel restore may be an additional recovery option only after its availability and target timestamp have been verified; a time-travel restore rewinds database state and can discard subsequent writes.

**Gate result:** The procedure is documented, but backup strategy is not yet verified because no export or test restore exists. Production migration is blocked.

## Phase 3 — `0003_ticketing.sql` audit

### Data the SQL copies

The `INSERT ... SELECT` copies each source inquiry into the replacement table, retaining `id`, `type`, `game_id`, `message`, `device_info`, `admin_notes`, `created_at`, and `updated_at`. `ROW_NUMBER() OVER (ORDER BY created_at, id)` assigns deterministic ticket numbers beginning at 1001. Legacy statuses map as follows: `seen` → `under_review`, `working` → `in_progress`, `important` → `under_review` with `high` priority, and `archived` → `closed` with `archival` time set to the prior `updated_at`; other accepted statuses are copied. The new conversation/activity tables start empty because the legacy schema has no such per-ticket history tables. Legacy rows receive `NULL` access-token hashes and therefore do not gain anonymous portal access.

### Risks and safety limits

- The migration creates `feedback_submissions_new`, copies rows, then drops `feedback_submissions` and renames the replacement. This is destructive DDL and there is no down migration.
- It has no “already applied” guard and is not rerunnable. Do not apply it twice.
- The SQL file has no explicit transaction boundary. Verify the deployed Wrangler/D1 execution behavior using the isolated restore rehearsal before executing it against production.
- The migration assumes the exact legacy table and columns from `0002_feedback.sql`, valid legacy status/type values, and that `feedback_submissions_new` does not already exist.
- SQL inspection supports preservation of the listed fields for valid rows matching that schema, but does not prove the actual production table matches those assumptions.
- No production row count, status distribution, note count, device metadata, or timestamp has been inspected in this session.
- A verified export plus a successful restore/rehearsal against a copy is required before the destructive table replacement can be approved.

**Audit conclusion:** Preservation intent is visible in the SQL, but production safety is **not confirmed** until the live inventory and a restore rehearsal pass. Do not execute yet.

## Phases 4–7 — Execution and recovery

Not performed. No migration, backup, D1 write, deployment, or API request was made. Consequently:

- Tables created: none.
- Columns added: none.
- Records preserved/migrated/recovered: unknown; no records were accessed.
- `GET /api/admin/feedback` HTTP 200: not verified.
- Ticket list/search/filters/status/archive actions: not verified against production.

After the prior gates pass, apply the migration once through an explicitly operator-run command (never through runtime requests):

```sh
npx wrangler d1 execute octo-industries-admin --remote --file migrations/0003_ticketing.sql
```

Then repeat the table/column/count/status/note inventory, compare before/after inquiry counts and preserved fields, and test the admin API and inbox actions. Do not report recovery complete until those checks succeed. If any result differs unexpectedly, stop writes and activate the separate-database restore procedure.

## Remaining issues

- Production schema and historical records remain unverified.
- The migration cannot safely be applied from this session without authenticated access, a verified backup, and a successful restore rehearsal.
- The inaccurate `README.md` statement that the Render service auto-upgrades the old schema has been corrected: runtime paths validate schema only and do not migrate.

## References

- Migration: [`migrations/0003_ticketing.sql`](../migrations/0003_ticketing.sql)
- Legacy schema: [`migrations/0002_feedback.sql`](../migrations/0002_feedback.sql)
- D1 configuration: [`wrangler.toml`](../wrangler.toml)
- D1 Wrangler command documentation: <https://developers.cloudflare.com/d1/wrangler-commands/>
