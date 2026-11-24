# Hub persistence and game adapter contract

`persistence.mjs` is the shared persistence boundary for hub state and opt-in game saves.

The hub state is stored in IndexedDB when available and mirrored to localStorage for immediate startup and backward compatibility. The existing keys `octo-industries.recent`, `octo-industries.play-counts`, and `octo-industries.tickets` are still written, so older hub builds and existing ticket access continue to work.

Games opt in by registering an adapter with `createGameAdapter()`:

- `version`: positive integer for the game save schema.
- `saveLevel`: `0` none, `1` settings, `2` checkpoint, or `3` progression.
- `capture()`: returns a JSON-serializable snapshot.
- `restore(payload)`: applies a snapshot when Continue is selected.
- `migrate(payload, fromVersion)`: optional migration for older snapshots.
- `reset()`: optional game-specific reset hook.
- `progress(payload)`: optional summary for cards and detail pages.

Every hub save is scoped by `gameId` and `slotId`, checksummed, backed up before replacement, and validated during Continue/import. PvZ2's existing `docs/save-store.js` remains the authoritative in-game save bridge; this module does not replace or hook its localStorage mirroring.
