# iPad, saves, offline & cloud sync – what this fork adds

## What's included
- **iPad layout**: full screen in landscape, safe areas respected, pinch/double-tap zoom blocked, "Rotate your iPad" screen in portrait, sound unlocked on first tap.
- **Durable saves**: every `PvZ2_*` save key (`PvZ2_PlayerProperties`, `PvZ2_Settings`, `PvZ2_GitHubLevels`, `PvZ2_GitHubLevels_Sha`) is mirrored into IndexedDB and restored automatically if Safari wipes localStorage. Export/Import save as a file from the ⚙ pill.
- **Offline play**: the service worker downloads the whole game in the background (small level data first, music last; a gentle trickle during levels) – progress in ⚙ → Offline pack, "Download all for offline" runs it at full speed. On every deploy the new release carries over unchanged files by content hash (`asset-list.json`) and only takes over once its start-up files are cached, so an update can never break offline play.
- **Cloud sync (Firebase)**: saves made offline upload when the iPad is back online. Off until `docs/sync/firebase-config.js` has real values. Uses `initializeAuth` (no apis.google.com script, which school networks often block).
- **Screen shapes**: on screens narrower than 16:10 (an iPad in full screen is ~4:3) the game is letterboxed with thin bars top and bottom so the whole lawn, the pause button and incoming zombies stay visible; wider screens fill edge to edge.
- **Graphics resets**: if iPadOS takes the game's graphics away when memory runs low (frozen or black picture, engine error 16321), the game saves, reloads itself and steps Graphics down one level (at most 2 automatic reloads per 5 minutes).
- **Sound on iPad**: music goes through Web Audio gain nodes (iPadOS ignores `<audio>` volume, so fades, the music slider and muting one track under another didn't work); music that tries to start before the first tap starts on that tap; all short sound effects (~7 MB) are preloaded into memory after start-up and decoded at their own sample rate, so cues aren't late. ⚙ → Device shows a "Sound:" line for troubleshooting.
- **Exporting profiles**: on iPad, the game's Export (and ⚙ → Export) opens the Share sheet → "Save to Files"; if sharing or downloads are blocked (managed/school iPads), a sheet offers Download or Copy as text.

## Playing on iPad
- **Tap** = click (tap a seed, then a square). **Drag** a seed/shovel/Plant Food onto the lawn and let go to drop it. **Sweep** over sun to collect.
- **Two-finger tap** = right click (cancel seed, Zen Garden water). **Two-finger swipe / pinch** = mouse wheel.
- Left-edge buttons: **⛶** full screen, **⚙** settings (saves, offline, **Graphics**: Smoothest / Balanced / Sharpest — Balanced is the default on touch screens; lower it if the iPad gets hot or laggy).

## Game tweaks
- **Level of the Day (Piñatas)** refreshes every hour instead of once a day (edit in `docs/assets/main/index.js`, LevelOfTheDayDisplayer).
- The shop's costume stock already refreshes daily (game default).

## Turning on cloud sync (5 minutes, needs your Google account)
1. console.firebase.google.com → **Add project**.
2. Click the **</>** icon to add a web app; copy the `firebaseConfig` values into `docs/sync/firebase-config.js`.
3. **Authentication → Sign-in method → Anonymous → Enable.**
4. **Firestore Database → Create database** (production mode).
5. Firestore **Rules** tab → paste `firestore.rules` → **Publish**.
6. **Authentication → Settings → Authorized domains** → add `<your-user>.github.io`.

The web config is public by design (it ships to every player); the rules keep each player's save private.

## Deploying (GitHub Pages)
- Repo **Settings → Pages → Source: GitHub Actions**. On a fork, also **Actions → enable workflows**.
- Every push to `master` builds the Lite edition and deploys it. The site works at `https://<your-user>.github.io/<repo>/` (asset paths are relative now) or on a custom domain via a `docs/CNAME` file.

## On the iPad
1. Open the site in Safari → Share → **Add to Home Screen** → always launch from that icon (prevents Safari's storage cleanup).
2. ⚙ → **Download all for offline** once, on Wi-Fi.

## Other hosting (Docker / local)
Run `node gen-asset-list.js docs` for the offline pack, serve `docs/` over HTTPS (or localhost), and bump `CACHE_VERSION` in `docs/sw.js` on each game update.

## Notes
- Anonymous sign-in = one cloud save per device/browser (a backup, not cross-device sharing).
- The ⚙ pill sits top-centre; move it via `#pvz-hud` in `docs/ipad.css`.
- Firebase SDK is pinned to 10.14.1 in `docs/sync/cloud-sync.js` and `docs/sw.js`.
