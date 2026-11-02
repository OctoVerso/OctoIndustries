import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const sourceRoots = [
  'Octo-Industries/BehindTheScenes/admin',
  'Octo-Industries/BehindTheScenes/hub',
  'Octo-Industries/BehindTheScenes/scripts',
  'Octo-Industries',
];
const preferredFiles = [
  'index.html',
  'Octo-Industries/BehindTheScenes/admin/admin.js',
  'Octo-Industries/BehindTheScenes/admin/admin.css',
  'Octo-Industries/BehindTheScenes/admin/index.html',
  'Octo-Industries/BehindTheScenes/admin/server.mjs',
  'Octo-Industries/BehindTheScenes/hub/app.js',
  'Octo-Industries/BehindTheScenes/hub/app.css',
  'Octo-Industries/BehindTheScenes/scripts/sync-games.mjs',
];
const supportedExtensions = new Set(['.css', '.html', '.js', '.mjs']);
const excludedSegments = new Set(['Build', 'dist', 'node_modules', 'vendor', 'www']);
const protectedPaths = new Set([
  'Octo-Industries/BehindTheScenes/admin/server.mjs',
  'Octo-Industries/BehindTheScenes/admin/change-proposals.mjs',
]);
const maximumFileBytes = 256 * 1024;
const maximumContextBytes = 180 * 1024;

function repositoryPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/')) {
    throw new Error('The proposed change contains an invalid repository path.');
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error('The proposed change contains an unsafe repository path.');
  }
  return segments.join('/');
}

export function isAllowedCodePath(value) {
  let path;
  try {
    path = repositoryPath(value);
  } catch {
    return false;
  }
  const segments = path.split('/');
  if (segments.some((segment) => excludedSegments.has(segment))) return false;
  if (protectedPaths.has(path) || path.startsWith('Octo-Industries/BehindTheScenes/scripts/')) return false;
  if (segments.some((segment) => /(?:min|bundle|vendor)\.js$/i.test(segment))) return false;
  if (!supportedExtensions.has(path.slice(path.lastIndexOf('.')))) return false;
  if (path === 'index.html') return true;
  if (path.startsWith('Octo-Industries/BehindTheScenes/admin/')
    || path.startsWith('Octo-Industries/BehindTheScenes/hub/')
    || path.startsWith('Octo-Industries/BehindTheScenes/scripts/')) return true;
  return /^Octo-Industries\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:css|html|js|mjs)$/.test(path);
}

export async function readCodeContext(root) {
  const paths = new Set(preferredFiles);
  for (const rootPath of sourceRoots) {
    const absoluteRoot = resolve(root, rootPath);
    const rootInfo = await stat(absoluteRoot).catch(() => null);
    if (!rootInfo?.isDirectory()) continue;
    const pending = [absoluteRoot];
    while (pending.length && paths.size < 200) {
      const directory = pending.pop();
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = resolve(directory, entry.name);
        const relativePath = relative(root, absolute).split(sep).join('/');
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (!excludedSegments.has(entry.name) && !entry.name.startsWith('.')) pending.push(absolute);
        } else if (entry.isFile() && isAllowedCodePath(relativePath)) {
          paths.add(relativePath);
        }
      }
    }
  }

  const files = [];
  let total = 0;
  for (const path of [...paths]) {
    if (!isAllowedCodePath(path)) continue;
    const absolute = resolve(root, path);
    if (!absolute.startsWith(`${resolve(root)}${sep}`) && path !== 'index.html') continue;
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile() || info.size > maximumFileBytes || total + info.size > maximumContextBytes) continue;
    const content = await readFile(absolute, 'utf8');
    files.push({ path, content });
    total += info.size;
  }
  return files;
}

function parseDiffFiles(diff) {
  if (typeof diff !== 'string' || !diff.trim() || diff.length > 64 * 1024) {
    throw new Error('The proposed code diff is empty or too large.');
  }
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  const files = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].startsWith('--- ')) {
      if (!lines[index].trim() || lines[index].startsWith('diff --git ')
        || lines[index].startsWith('index ') || lines[index].startsWith('```')) {
        index += 1;
        continue;
      }
      throw new Error('The AI returned a diff in an unsupported format.');
    }
    const oldPath = lines[index++].slice(4);
    const newHeader = lines[index++];
    if (!oldPath.startsWith('a/') || !newHeader?.startsWith('+++ b/')) {
      throw new Error('Code proposals may edit existing files only.');
    }
    const path = repositoryPath(oldPath.slice(2));
    if (path !== repositoryPath(newHeader.slice(6)) || !isAllowedCodePath(path)) {
      throw new Error(`The AI proposed a file that cannot be changed: ${path}`);
    }
    const hunks = [];
    let hasChange = false;
    while (index < lines.length && !lines[index].startsWith('--- ')) {
      const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[index]);
      if (!header) {
        if (!lines[index].trim() || lines[index].startsWith('\\ No newline at end of file')
          || lines[index].startsWith('diff --git ') || lines[index].startsWith('index ')) {
          index += 1;
          continue;
        }
        throw new Error(`The AI returned an invalid patch hunk for ${path}.`);
      }
      const hunk = {
        oldStart: Number(header[1]),
        oldCount: Number(header[2] ?? 1),
        newStart: Number(header[3]),
        newCount: Number(header[4] ?? 1),
        lines: [],
      };
      index += 1;
      let oldCount = 0;
      let newCount = 0;
      while (index < lines.length && !lines[index].startsWith('@@ ')
        && !lines[index].startsWith('--- ')) {
        const line = lines[index++];
        if (line.startsWith('\\ No newline at end of file')) continue;
        if (line.startsWith(' ')) {
          oldCount += 1;
          newCount += 1;
        } else if (line.startsWith('-')) {
          oldCount += 1;
          hasChange = true;
        } else if (line.startsWith('+')) {
          newCount += 1;
          hasChange = true;
        } else {
          throw new Error(`The AI returned an invalid patch line for ${path}.`);
        }
        hunk.lines.push(line);
      }
      if (oldCount !== hunk.oldCount || newCount !== hunk.newCount) {
        throw new Error(`The AI returned inconsistent patch line counts for ${path}.`);
      }
      hunks.push(hunk);
    }
    if (!hunks.length || !hasChange) throw new Error(`The proposed patch for ${path} does not change any code.`);
    files.push({ path, hunks });
  }
  if (files.length !== 1) throw new Error('A proposal must update exactly one existing code file.');
  if (new Set(files.map(({ path }) => path)).size !== files.length) throw new Error('The diff repeats a file path.');
  return files;
}

export function applyUnifiedDiff(original, diff) {
  const originalLines = original.replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let originalIndex = 0;
  const files = parseDiffFiles(diff);
  if (files.length !== 1) throw new Error('Review and approve code fixes one file at a time.');
  for (const { hunks } of files) {
    for (const hunk of hunks) {
      const target = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
      if (target < originalIndex || target > originalLines.length) throw new Error('The patch has overlapping or invalid line numbers.');
      output.push(...originalLines.slice(originalIndex, target));
      originalIndex = target;
      for (const line of hunk.lines) {
        const marker = line[0];
        const content = line.slice(1);
        if (marker === '+') {
          output.push(content);
        } else {
          if (originalLines[originalIndex] !== content) {
            throw new Error(`Patch context no longer matches ${files[0].path} at line ${originalIndex + 1}. Generate a fresh proposal.`);
          }
          if (marker === ' ') output.push(originalLines[originalIndex]);
          originalIndex += 1;
        }
      }
    }
  }
  output.push(...originalLines.slice(originalIndex));
  const updated = output.join('\n');
  if (updated.length > maximumFileBytes) throw new Error('The proposed file would exceed the safe size limit.');
  return { path: files[0].path, content: updated };
}

export function validateProposalTitle(title) {
  if (typeof title !== 'string' || title.trim().length < 4 || title.trim().length > 100) {
    throw new Error('The proposal needs a clear title between 4 and 100 characters.');
  }
  return title.trim();
}

export function validateProposalSummary(summary) {
  if (typeof summary !== 'string' || summary.trim().length < 8 || summary.trim().length > 500) {
    throw new Error('The proposal needs a clear summary between 8 and 500 characters.');
  }
  return summary.trim();
}

function githubPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function githubRequest(fetchImpl, token, url, options = {}) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`GitHub returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`GitHub rejected the approved change (HTTP ${response.status}): ${String(result.message || 'request failed').slice(0, 240)}`);
  }
  return result;
}

export async function createGitHubPullRequest({
  proposal,
  token,
  repository = 'nv24191/Personal',
  fetchImpl = fetch,
}) {
  if (!token) throw new Error('GitHub PR access is not configured. Add the GITHUB_TOKEN secret in Render.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must use owner/repository format.');
  const [owner, repo] = repository.split('/');
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const repoInfo = await githubRequest(fetchImpl, token, api);
  const base = repoInfo.default_branch || 'main';
  const baseRef = await githubRequest(fetchImpl, token, `${api}/git/ref/heads/${encodeURIComponent(base)}`);
  const baseSha = baseRef.object?.sha;
  if (!baseSha) throw new Error('GitHub did not return the base branch commit.');
  const baseCommit = await githubRequest(fetchImpl, token, `${api}/git/commits/${encodeURIComponent(baseSha)}`);
  const baseTreeSha = baseCommit.tree?.sha;
  if (!baseTreeSha) throw new Error('GitHub did not return the base commit tree.');

  let changes;
  if (proposal.kind === 'code') {
    const parsed = parseDiffFiles(proposal.diff);
    changes = [];
    for (const file of parsed) {
      const source = await githubRequest(fetchImpl, token, `${api}/contents/${githubPath(file.path)}?ref=${encodeURIComponent(base)}`);
      if (source.type !== 'file' || typeof source.content !== 'string') throw new Error(`GitHub could not load ${file.path}.`);
      const current = Buffer.from(source.content.replace(/\n/g, ''), 'base64').toString('utf8');
      changes.push(applyUnifiedDiff(current, proposal.diff));
    }
  } else if (proposal.kind === 'game') {
    const path = repositoryPath(proposal.manifestPath);
    if (!/^Octo-Industries\/[A-Za-z0-9_-]+\/game\.json$/.test(path)) throw new Error('Game proposals may only add a game.json directly inside a game folder.');
    if (!proposal.manifest || typeof proposal.manifest.launch !== 'string') throw new Error('The game proposal has no valid launch file.');
    const gameDirectory = path.slice(0, -'/game.json'.length);
    const existing = await fetchImpl(`${api}/contents/${githubPath(path)}?ref=${encodeURIComponent(base)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (existing.status !== 404) {
      if (!existing.ok) throw new Error(`GitHub could not check ${path} (HTTP ${existing.status}).`);
      throw new Error(`A game manifest already exists at ${path}.`);
    }
    const launch = repositoryPath(proposal.manifest.launch);
    if (!launch.startsWith(`${gameDirectory}/`)) throw new Error('The game launch file must be inside its game folder.');
    const launchResponse = await fetchImpl(`${api}/contents/${githubPath(launch)}?ref=${encodeURIComponent(base)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(20_000),
    });
    let launchFile;
    try {
      launchFile = await launchResponse.json();
    } catch {
      throw new Error(`GitHub returned an unreadable response while checking ${launch}.`);
    }
    if (!launchResponse.ok || launchFile.type !== 'file') {
      throw new Error(`The proposed launch file does not exist in the GitHub repository: ${launch}.`);
    }
    changes = [{ path, content: `${JSON.stringify(proposal.manifest, null, 2)}\n` }];
  } else {
    throw new Error('Unknown proposal type.');
  }

  const branch = `octo-ai/${proposal.id}`;
  const branchRef = await githubRequest(fetchImpl, token, `${api}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  const branchSha = branchRef.object?.sha || baseSha;
  const tree = [];
  for (const change of changes) {
    const blob = await githubRequest(fetchImpl, token, `${api}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: change.content, encoding: 'utf-8' }),
    });
    tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await githubRequest(fetchImpl, token, `${api}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });
  const commit = await githubRequest(fetchImpl, token, `${api}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: proposal.title,
      tree: newTree.sha,
      parents: [branchSha],
    }),
  });
  await githubRequest(fetchImpl, token, `${api}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  const pullRequest = await githubRequest(fetchImpl, token, `${api}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: proposal.title,
      head: branch,
      base,
      body: `## Octo AI proposal\n\n${proposal.summary}\n\nThis change was prepared by Octo AI and explicitly approved in the admin dashboard. Review the file diff and tests before merging.`,
      draft: false,
    }),
  });
  let pullRequestUrl;
  try {
    pullRequestUrl = new URL(pullRequest.html_url);
  } catch {
    throw new Error('GitHub returned an invalid pull request URL.');
  }
  if (pullRequestUrl.protocol !== 'https:' || pullRequestUrl.hostname !== 'github.com'
    || !Number.isInteger(pullRequest.number)) {
    throw new Error('GitHub returned an invalid pull request reference.');
  }
  return { url: pullRequestUrl.href, number: pullRequest.number, branch };
}
