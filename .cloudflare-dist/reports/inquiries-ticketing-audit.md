# Inquiries and Ticketing Audit

Audited and continued on 2026-10-14. This is an extension of the existing anonymous feedback inbox, not a replacement. Legacy rows retain their messages, device metadata, and private notes; existing deployments must apply migration `0003_ticketing.sql` before deploying the new API.

## Feature Checklist

| Requirement | State | Findings and related files |
| --- | --- | --- |
| Bahrain timezone | ✅ Completed | Admin dates, ticket dates, and the daily activity boundary use `Asia/Bahrain`. `Octo-Industries/BehindTheScenes/admin/admin.js`, `Octo-Industries/BehindTheScenes/hub/app.js` |
| Device detection | ✅ Completed | Adds device name/type, browser and version, OS and version, language, local timezone, and screen resolution. Full user-agent strings remain unstored. `Octo-Industries/BehindTheScenes/hub/app.js`, `functions/_lib/feedback.js`, `Octo-Industries/BehindTheScenes/admin/admin.js` |
| Ticket IDs | ✅ Completed | New and migrated records receive sequential `#1001+` numbers. `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, `migrations/0003_ticketing.sql` |
| Conversations and attachments | ⚠️ Partially implemented | User/admin text replies, history, and per-ticket activity are implemented. Attachments have no upload UI or storage provider/binding. `functions/_lib/admin.js`, `functions/api/tickets/[[path]].js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, `Octo-Industries/BehindTheScenes/hub/app.js`, `Octo-Industries/BehindTheScenes/admin/admin.js`, related tests |
| User-facing My Tickets | ✅ Completed | New tickets are stored in browser local storage with a high-entropy access token; user can view status/history and reply. Clearing browser site data loses this anonymous access; legacy records have no owner token. `index.html`, `Octo-Industries/BehindTheScenes/hub/app.js`, `functions/api/tickets/[[path]].js` |
| Ticket statuses | ✅ Completed | New workflow states and legacy state mapping are in schema, APIs, and controls. `functions/_lib/feedback.js`, `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, `Octo-Industries/BehindTheScenes/admin/index.html`, `Octo-Industries/BehindTheScenes/admin/admin.js`, `migrations/0003_ticketing.sql` |
| User-visible status | ✅ Completed | The token-protected portal returns only public status, priority, timestamps, and conversation content. `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, `Octo-Industries/BehindTheScenes/hub/app.js` |
| Priority | ✅ Completed | Low, Medium, High, and Critical are persisted and editable/filterable. `functions/_lib/feedback.js`, `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, admin UI files, `migrations/0003_ticketing.sql` |
| Internal notes | ✅ Completed | Existing private notes remain admin-only. `functions/_lib/feedback.js`, `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, `Octo-Industries/BehindTheScenes/admin/admin.js` |
| Delete | ⚠️ Partially implemented | Admin delete is a soft-delete that hides a ticket and revokes owner access; there is no trash/recovery view. `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, admin UI files, `migrations/0003_ticketing.sql` |
| Archive | ✅ Completed | Independent archive metadata, filtering, and restore action. `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, admin UI files, `migrations/0003_ticketing.sql` |
| Activity logs | ✅ Completed | Creation, individual and bulk status, priority, note, reply, archive, and delete events are stored and rendered per ticket. `functions/_lib/admin.js`, `functions/_lib/admin.test.mjs`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, `Octo-Industries/BehindTheScenes/admin/server.test.mjs`, `Octo-Industries/BehindTheScenes/admin/admin.js`, `migrations/0003_ticketing.sql` |
| Advanced search/filtering | ⚠️ Partially implemented | Search covers ticket ID, message, game, device and diagnostic fields; filters cover type, status, priority, game, and Bahrain-local date range, with sorting. No activity filters or assignee filter for future multi-admin use. `Octo-Industries/BehindTheScenes/admin/index.html`, `Octo-Industries/BehindTheScenes/admin/admin.js`, `Octo-Industries/BehindTheScenes/admin/admin.css` |
| Analytics dashboard | ⚠️ Partially implemented | Existing admin metrics count open/new tickets; no ticket volume, resolution-time, priority, or status analytics view. `functions/_lib/admin.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs`, `Octo-Industries/BehindTheScenes/admin/admin.js` |
| Email notifications | ❌ Not started | No mail provider, configuration, send path, or delivery tests exist. |
| Mobile/iPad optimization | ⚠️ Partially implemented | Portal and inbox controls use responsive layouts and touch-sized controls. Safari/Edge on iPad has not received real-device or automated browser QA. `index.html`, `Octo-Industries/BehindTheScenes/hub/app.css`, `Octo-Industries/BehindTheScenes/admin/admin.css` |
| Ticket card layout | ✅ Completed | Cards now surface ID, issue type, game, status, priority, diagnostics, history, and actions. Admin UI files |
| Database migrations | ✅ Completed | `0003_ticketing.sql` transforms existing rows and creates sequence, conversation, and activity tables. Must be applied to D1 before rollout. `migrations/0001_admin.sql`, `migrations/0002_feedback.sql`, `migrations/0003_ticketing.sql`, `README.md`, `wrangler.toml` |
| Backwards compatibility | ✅ Completed | Migration preserves existing content/notes, maps old states, and assigns IDs; local JSON state backfills IDs on use. `migrations/0003_ticketing.sql`, `functions/_lib/feedback.js`, `Octo-Industries/BehindTheScenes/admin/server.mjs` |

## Existing Work Preserved

The prior implementation already had anonymous public intake, same-origin checks, rate limiting, private admin authentication/CSRF protection, admin search/type/status/game filters, sorting, bulk status changes, internal notes, device metadata, dashboard counts, and legacy migration `0002_feedback.sql`. The changes above extend those paths and keep both Cloudflare Pages and the Node service in sync.

## Verification

- Feedback model and hosted D1-mock integration tests pass.
- Node admin service integration tests pass, including user/admin replies, priority, archive/unarchive, delete, and access revocation.
- Migration `0003_ticketing.sql` was applied to an in-memory SQLite database with legacy rows; messages, notes, mapped statuses, archive timestamps, and next ticket number were verified.
- JavaScript syntax and CSS diagnostics pass. Real Safari/Edge iPad testing, attachments, email delivery, and richer resolution/trend analytics remain outstanding.

## Feature File Inventory

- Public intake and portal: `index.html`, `Octo-Industries/BehindTheScenes/hub/app.js`, `Octo-Industries/BehindTheScenes/hub/app.css`
- Hosted API and data model: `functions/api/feedback.js`, `functions/api/tickets/[[path]].js`, `functions/api/admin/[[path]].js`, `functions/_lib/admin.js`, `functions/_lib/feedback.js`
- Local service: `Octo-Industries/BehindTheScenes/admin/server.mjs`
- Admin UI: `Octo-Industries/BehindTheScenes/admin/index.html`, `Octo-Industries/BehindTheScenes/admin/admin.js`, `Octo-Industries/BehindTheScenes/admin/admin.css`
- Tests: `functions/_lib/admin.test.mjs`, `functions/_lib/feedback.test.mjs`, `Octo-Industries/BehindTheScenes/admin/server.test.mjs`
- Schema and rollout: `migrations/0001_admin.sql`, `migrations/0002_feedback.sql`, `migrations/0003_ticketing.sql`, `README.md`, `wrangler.toml`, `render.yaml`, `scripts/build-cloudflare-site.mjs`