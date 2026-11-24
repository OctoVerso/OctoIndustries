
![Octo Industries](./Octo-Industries/branding/horizontal-logo.png)

# Octo Industries™ Game Hub

Octo Industries is a touch-friendly game launcher hosted as a static site on **GitHub Pages**. Data (games, jobs, activity, roadmap, feedback, proposals) lives in **Supabase Postgres**, and the admin/feedback/catalog APIs run as **Supabase Edge Functions**. The repository-root `index.html` is the public homepage; the generated catalog at `Octo-Industries/BehindTheScenes/hub/catalog.js` is only an offline fallback.

## Run the hub

```sh
npm --prefix Octo-Industries/BehindTheScenes run sync   # regenerate the fallback catalog
python3 -m http.server 8080                             # preview at http://localhost:8080/
```

The PvZ iPad game source is kept in the sibling `pvz-ipad/` checkout; the Pages workflow builds its optimized local copy into the site. For local preview, clone it with `git clone https://github.com/fakedummyfortestingthings-web/pvz-ipad.git pvz-ipad`. The preview calls the live Supabase Edge Functions configured in `Octo-Industries/BehindTheScenes/hub/config.js`; production and `http://localhost:8080` are allowed by default. Set the `ALLOWED_ORIGIN` function secret to customize the allowed browser origins. Admin lives at `Octo-Industries/BehindTheScenes/admin/` (`/admin/` on the deployed site). Run the function tests with `npm test`.

## Codespaces storage maintenance

Run `npm run codespace:clean` weekly to preview cleanup candidates. Add `-- --apply` to remove only untracked, regenerable build outputs and the npm download cache; tracked files and game assets are always retained. The root `dist/` can be recreated with `npm run pages:build`.

Maintenance checklist:

- **Weekly:** run the cleanup preview; apply it when the listed generated outputs are no longer needed. Check `df -h` and `du -sh .git Octo-Industries offline_exports .cloudflare-dist`.
- **Monthly:** review the largest files and caches; use `npm cache clean --force` (included by `--apply`) and `python3 -m pip cache purge` if Python downloads are taking space. Do not remove `.git`, Git LFS objects, or active game directories.
- **Before major imports:** check free space first (`df -h .`) and inspect the incoming archive before extracting; avoid keeping both the archive and extracted copy.
- **Before a Codespace rebuild:** push or back up intended changes, then run the cleanup preview and remove only regenerable outputs. Reinstall dependencies from the lockfile if you choose to remove `node_modules`.

`offline_exports/` and `.cloudflare-dist/` are currently tracked and together use about 1.5 GB. They are intentionally excluded from the automated cleanup because they may be used as deliverables; review their hosting and retention needs before changing their Git tracking. Never delete or rewrite Git history as a disk-cleanup measure.

## Discover and add games

`npm --prefix Octo-Industries/BehindTheScenes run sync` reads `game.json` metadata when available and automatically detects top-level game folders with an `index.html`. It validates launch paths and regenerates `Octo-Industries/BehindTheScenes/hub/catalog.js`. Manifest metadata supplies its title, description, category, tags, thumbnail, launch path, optional featured status, and optional screenshot list. If `screenshots` is omitted, supported image files in the game's `screenshots/` folder are added to its hub gallery automatically. Invalid launch or screenshot paths stop the sync with an error.

Add a game directory directly beneath `Octo-Industries/` with an `index.html`; the catalog sync automatically creates a title from the directory name, an `Other` category, basic tags, and a description. Every registered game must declare `bannerSource` in `game.json`, pointing to authentic artwork from that game or its logo. The sync rejects missing or invalid banner art before catalog generation. Use `bannerFit: "contain"` for logos; the default cover fit fills the shared 16:9 banner. The hub provides a browsable screenshot gallery when local screenshots are available. Generated `hub-banner.svg` files embed their source art, so they load offline at a consistent aspect ratio.

## Game projects

- `Octo-Industries/Monkey-Mart/` — locally hosted supermarket management game.
- `Octo-Industries/Ballistic/` — locally hosted PixiJS browser game with its runtime, image atlases, fonts, and sound assets.
- `Octo-Industries/Block-Blast/` — Unity WebGL puzzle game.
- `Octo-Industries/Head-Soccer/` — locally hosted Head Soccer 2023 Construct game.
- `Octo-Industries/PvZ2/` — locally hosted PvZ2 Gardendless web game, with persistent saves and offline support.
- `Octo-Industries/Endless-Siege/` — HTML5 tower defense game.
- `Octo-Industries/Idle-Mining-Empire/` — locally hosted original HTML5 idle-mining game.
- `Octo-Industries/Red-Ball-4/` — locally hosted original Unity WebGL platform game, with offline caching and a local screenshot gallery.
- `Octo-Industries/Subway-Surfers/` — locally hosted original Subway Surfers: New York browser game, with locally stored assets and offline caching.
- `Octo-Industries/Ragdoll-Archers/` — Unity WebGL archery game.
- `Octo-Industries/Ragdoll-Drop/` — locally hosted original Unity WebGL physics game.
- `Octo-Industries/Stickman-Hook/` — browser-based swinging platform game.
- `Octo-Industries/Tiny-Fishing/` — hub wrapper for the online game at `tiny-fishing.bitbucket.io`; an internet connection is required.
- `Octo-Industries/Toss-The-Turtle/` — Flash game launched locally by the bundled Ruffle player.
- `Octo-Industries/GTA-3/` — locally hosted Grand Theft Auto III WebAssembly port.
- `Octo-Industries/GTA-Vice-City/` — locally hosted Grand Theft Auto: Vice City WebAssembly port.
- `Octo-Industries/Dr-Driving/` — locally hosted Dr. Driving WebAssembly port.
- `Octo-Industries/Hill-Climb-Racing/` — locally hosted Hill Climb Racing WebAssembly port.

The existing `Octo-Industries/BehindTheScenes/` folder contains the hub, scripts, and project configuration alongside the game folders. The playable project folders above are the current copies used by the hub.

Every Play link opens the launch path from the generated catalog as a regular static route. The hub stores recently played game IDs in local browser storage; it does not require an account or send play history to a server.

## Admin panel

The admin dashboard talks to the `admin`, `jobs`, `roadmap` and `proposals` Edge Functions. Login uses a PBKDF2 challenge/proof (the password never leaves the browser) and returns an 8-hour HMAC-signed bearer token kept in `sessionStorage`; login attempts, challenges and admin requests are rate limited in Postgres. On dashboard load and refresh, it compares the generated game catalog with Supabase and adds missing games as published without overwriting existing records. Admin actions edit game metadata, publish/unpublish games, run launch-file/metadata checks (needs `SITE_URL`), manage feedback and the roadmap, review proposals and generate a hub HTML build. Every action is written to the `activity` table (kept to the latest 100 rows).

The dashboard includes the **Octo AI Game Agent**, powered by Google Gemini (`OCTO_GEMINI_MODEL`, default `gemini-3.1-flash-lite`). It is read-only; it cannot create proposals. Do not send secrets or sensitive personal information. Proposals can be approved to open a GitHub pull request when `GITHUB_TOKEN` is set. External page scanning is disabled.

The standalone hub embeds the current published catalog and is generated in the browser from the admin dashboard ("Download hub HTML"); it still loads the site's static CSS, JavaScript and game files from GitHub Pages.

## Suggestions and issues

The public hub footer and navigation include a no-account feedback form. Users can send a suggestion or issue without providing identifying details; issue reports may optionally select a published game. Feedback records contain the message, optional game ID, coarse device/browser/OS/screen/build metadata, status, private admin notes, and a server-generated UTC timestamp. No name, email, full user agent, or raw IP address is stored. Submissions are rate-limited and visible only in the authenticated admin inbox, where they can be searched, filtered, sorted, marked seen, assigned a workflow status, privately annotated, or archived. Feedback is stored in the Supabase `feedback` table by the `feedback` Edge Function (rate limited to 5 submissions per hour per connection).

## Hosting (GitHub Pages + Supabase)

1. **Database**: apply `supabase/migrations/20260101000000_edge_function_support.sql` (rate-limit/session tables, the rate-limit RPC and RLS) to the Supabase project that already holds the `games`, `jobs`, `activity`, `roadmap`, `feedback` and `proposals` tables. Then apply `supabase/migrations/20260102000000_inquiry_tickets.sql` (additive: ticket numbers, access-token hashes, priority/archive/soft-delete columns, `feedback_conversations`, `feedback_activity`, relaxed status checks) with `supabase db push --project-ref <ref>` or by pasting it into the SQL editor; it is idempotent. Verify with `select ticket_number, priority from public.feedback limit 1; select count(*) from public.feedback_conversations, public.feedback_activity;`. Until it is applied, new submissions are stored without ticket credentials. The Game Inspector (`POST /admin/analyze`) fetches the submitted public HTTP(S) page from the Edge Function (SSRF-guarded, 1 MB cap, 3 redirects) and needs no extra secret.
2. **Secrets**: copy `.env.example` to `.env`, fill it in and run `supabase secrets set --env-file .env --project-ref <ref>`. Generate the admin hash with `npm --prefix Octo-Industries/BehindTheScenes run admin:hash`. Never expose the service-role key in the browser or git.
3. **Functions**: `supabase functions deploy --project-ref <ref> --no-verify-jwt` (or push to `main`; `.github/workflows/supabase-functions.yml` deploys them using the `SUPABASE_ACCESS_TOKEN` secret and `SUPABASE_PROJECT_REF` variable).
4. **Pages**: in the repository's **Settings → Pages**, set the source to **GitHub Actions**, and add the Actions variable `SUPABASE_FUNCTIONS_URL` (`https://<ref>.supabase.co/functions/v1`). `.github/workflows/pages.yml` runs `npm run pages:build` and publishes `dist/`.

Limits: GitHub Pages cannot set per-file response headers, so games that require `Content-Encoding` on pre-compressed files (e.g. Unity `.unityweb` builds) may need uncompressed assets, and files over 100 MB are rejected by the build.

## Branding assets

The existing artwork in `Octo-Industries/branding/octo-industries-logo-source.jpg` remains the source of truth. The transparent, color-preserving octopus cutout powers the complete logo system:

- `primary-logo.svg` / `.png` — stacked octopus and wordmark for splash screens and branding.
- `horizontal-logo.svg` / `.png` — octopus plus wordmark for hub headers and navigation.
- `home-button.svg` / `.png` — circular, text-free, clickable in-game home mark.
- `icon-only.svg` / `.png` — octopus-only icon for app marks, badges, and metadata.
- `watermark-logo.svg` / `.png` — transparent, text-free watermark artwork.
- `favicon.svg`, `favicon.png`, and `favicon.ico` — browser and app icon sizes, including `apple-touch-icon.png`.

Game pages use the circular home button, linking back to the hub, and a non-interactive icon-only watermark at 15% opacity. The shared corner defaults are configured in `game-branding.js` through `window.OCTO_GAME_BRANDING_CONFIG` (`hubButtonPosition` and `watermarkPosition`); changing them updates every game that loads the shared overlay. Players can still drag the home button to any corner; that personal preference is saved and shared between games. Keyboard users can focus the button and use the arrow keys to change corners. The shared overlay is maintained by `game-branding.css` and `game-branding.js`. Keep the branding directory with the game projects when hosting or packaging the site.

| Logo variant | Preview |
| --- | --- |
| Primary | <img src="./Octo-Industries/branding/primary-logo.png" width="90" alt="Primary Octo Industries logo"> |
| Circular home button | <img src="./Octo-Industries/branding/home-button.png" width="64" alt="Circular Octo Industries home button"> |
| Icon only | <img src="./Octo-Industries/branding/icon-only.png" width="64" alt="Octo Industries icon"> |
| Watermark | <img src="./Octo-Industries/branding/watermark-logo.png" width="64" alt="Octo Industries watermark"> |
| Horizontal hub logo | <img src="./Octo-Industries/branding/horizontal-logo.png" width="160" alt="Horizontal Octo Industries logo"> |
