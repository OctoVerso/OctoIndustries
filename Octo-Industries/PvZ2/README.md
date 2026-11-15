<div align="center">

<img width=20% src="https://pvzge.com/pvz_logo-round.webp" alt="">

# PvZ2 Gardendless

**An endless garden requires an endless defense!**

Thanks to everyone who has supported this project!

![](https://img.shields.io/badge/author-Gaozih-%2366ccff)
![](https://img.shields.io/github/license/Gzh0821/pvzge_web)
![](https://img.shields.io/docker/pulls/gaozih/pvzge)
![](https://img.shields.io/discord/1265377295846346803?label=discord)
![](https://img.shields.io/github/stars/Gzh0821/pvzge_web)
</div>

### Info

This is the open source repo of the web version of "PvZ2 Gardendless".

"PvZ2 Gardendless" is a rewritten "Plants vs Zombies 2" entirely using only Web technologies(including the cocos engine)!

Visit our [website](https://pvzge.com/en/) for download links, game guides and more. You can also report bugs, make comments and suggestions in the feedback module of the website or in the issues and discussions of this project!

## Web Play

Try PvZ2 Gardendless online in [here](https://play.pvzge.com/) !

- Note: The version for online play may not be the latest version and may load slowly. For more related issues, please refer to the relevant instructions on the official website

## Source checkout

Install Git LFS before cloning this repository. After pulling updates, run `git lfs pull` to download large game assets before serving `docs/` or building a Docker image.

## GitHub Pages Lite build

The complete, original game remains in `docs/`. Docker and source checkouts continue to use it. The Pages workflow builds an independent Lite artifact and uploads only that artifact; converted resources are never committed back to `docs/`.

The build uses Node.js 24, libavif 1.4.2, WebP 1.6.0, and FFmpeg. The Linux image tools are downloaded from their official releases with SHA-256 verification. The self-contained conversion tools live in `scripts/` and are versioned with this repository.

```bash
node --test tests/web-lite.test.mjs tests/pages-lite.test.mjs
node scripts/build-web-lite.mjs --input docs --output /tmp/pvzge-web-lite

# Pages layout: original files stay unchanged; output parent must already exist.
GITHUB_SHA="$(git rev-parse HEAD)" node scripts/build-pages-lite.mjs --input docs --output /tmp/pvzge-pages-lite
```

Output directories must not already exist. Pages serves assets under `/releases/<commit>/` so a freshly loaded page cannot mix a new Lite resource manifest with old browser/CDN resource caches. The root HTML keeps the public URL unchanged through a base URL; `CNAME`, `ads.txt`, and `.nojekyll` stay at the site root. `build-info.json` identifies the deployed revision.

After deployment, refresh the Cloudflare cache for `play.pvzge.com` if it caches the root HTML, then verify the root `build-info.json`, menu, Play button, first level, and cold/warm loading. Manual workflow runs on non-master branches build and validate the artifact without deploying it. A successful Actions job alone does not verify the public domain. Existing browser copies of the old root HTML may require a reload.

## Using Docker

Deploy the game locally by using [Docker image](https://hub.docker.com/r/gaozih/pvzge)

