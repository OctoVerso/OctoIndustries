#!/usr/bin/env node
/*
 * Writes <dir>/asset-list.json listing every file the game needs offline.
 * Usage:  node gen-asset-list.js docs
 * Re-run after every game update (and bump CACHE_VERSION in sw.js).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(process.argv[2] || 'docs');
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Folder not found: ${root}`);
  process.exit(1);
}

const EXCLUDE = new Set([
  'sw.js', 'asset-list.json', 'CNAME', '.nojekyll',
  'sync/firebase-config.example.js'
]);
const EXCLUDE_EXT = new Set(['.map', '.md']);

const files = [];
let bytes = 0;

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (entry.isDirectory()) { walk(abs); continue; }
    if (!entry.isFile() || EXCLUDE.has(rel) || EXCLUDE_EXT.has(path.extname(entry.name))) continue;
    const data = fs.readFileSync(abs);
    files.push({
      p: rel.split('/').map(encodeURIComponent).join('/'),
      h: crypto.createHash('sha1').update(data).digest('hex').slice(0, 16),
      s: data.length
    });
    bytes += data.length;
  }
})(root);

files.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
const out = { generatedAt: new Date().toISOString(), count: files.length, bytes, files };
fs.writeFileSync(path.join(root, 'asset-list.json'), JSON.stringify(out));
console.log(`asset-list.json: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
