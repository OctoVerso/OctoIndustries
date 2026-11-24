# Game acquisition and runtime status

**Date:** 2026-11-23  
**Registry source:** `Octo-Industries/BehindTheScenes/hub/catalog.js` after the 33-entry catalog sync  
**Evidence rule:** Unknown, untested, or partially inspected behavior remains `unverified`; this report does not turn source URLs or manifest metadata into proof of a local acquisition.

## Explicit classifications

| Game | Acquisition | Runtime/network | Save | Test status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Plants vs. Zombies 2: Gardendless | `local-payload` | `local` / `not-required` | Level 3, `game-managed` | `partial` | `PvZ2/docs/save-store.js`, `PvZ2/docs/INSTALL.md` |
| Eaglercraft 26.2 | `local-wrapper` | `unverified` / `unverified` | Unclassified | `not-run` | `Eaglercraft-1-8-8/ARTIFACT-VERIFICATION.md` |
| Tiny Fishing | `external-only` | `external-required` / `required` | Level 0, `unsupported` | `not-run` | `Tiny-Fishing/index.html` loads a third-party URL |
| Turball | `external-only` | `external-required` / `required` | Level 0, `unsupported` | `not-run` | `Turball/README.md`, `Turball/index.html` |

The following manifest entries carry a save-level classification, but do not yet carry hub adapter or test evidence: B-Cubed (3), Dr. Driving (3), Grand Theft Auto III (1), Grand Theft Auto: Vice City (1), and Hill Climb Racing (3). Their save status remains `unverified`.

All other registered games currently emit `unverified` for acquisition, runtime dependency, save, and test fields. They remain visible in the hub because registry presence is not the same as a completed acquisition audit.

## Queue and approval workflow

Acquisition and update requests are represented by the `game_acquisition_queue` table and the admin jobs endpoints:

- `POST /api/admin/jobs/acquisitions` creates a `proposed` request.
- `PATCH /api/admin/jobs/acquisitions/:id` advances it through source review, acquisition, evidence, approval, import, and update states.
- Approval requires at least one evidence record and rejects `external-only` items.
- Queue records do not create, replace, or publish a game payload by themselves.

The queue model and database migration are in `supabase/functions/_shared/acquisition-queue.js` and `supabase/migrations/20261123000000_game_acquisition_queue.sql`. Server catalog sync preserves the classification fields through `supabase/migrations/20261123010000_game_registry_classifications.sql`.

## Still unverified

No claim is made here that every game passes browser, Safari/iPad, Edge, audio, offline, 60 FPS, restart persistence, or cross-game save-isolation testing. Those results require the browser/device test pass and per-game evidence to be attached to the queue or a game-specific report.
