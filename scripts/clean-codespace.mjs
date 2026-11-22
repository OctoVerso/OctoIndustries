import { lstat, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const allowedArguments = new Set(['--apply']);
const unexpectedArguments = process.argv.slice(2).filter((argument) => !allowedArguments.has(argument));
if (unexpectedArguments.length) {
  throw new Error(`Unknown argument(s): ${unexpectedArguments.join(', ')}. Use --apply to delete safe cleanup candidates.`);
}

const candidates = ['dist', 'coverage', '.next', '.turbo', '.vite', 'node_modules/.cache'];

async function sizeOf(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) return info.size;
  const children = await readdir(path);
  let total = 0;
  for (const child of children) total += await sizeOf(join(path, child));
  return total;
}

function trackedFiles(path) {
  const result = spawnSync('git', ['ls-files', '-z', '--', path], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not check Git tracking for ${path}: ${result.stderr.trim()}`);
  return result.stdout.length > 0;
}

let plannedBytes = 0;
for (const candidate of candidates) {
  const path = resolve(root, candidate);
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`Cleanup path escapes the repository: ${candidate}`);

  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    console.log(`Skipping non-directory or symlink: ${candidate}`);
    continue;
  }
  if (trackedFiles(candidate)) {
    console.log(`Skipping tracked project files: ${candidate}`);
    continue;
  }

  const bytes = await sizeOf(path);
  plannedBytes += bytes;
  console.log(`${apply ? 'Removing' : 'Would remove'} ${candidate} (${bytes} bytes)`);
  if (apply) await rm(path, { recursive: true, force: true });
}

if (apply) {
  const result = spawnSync('npm', ['cache', 'clean', '--force'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('npm cache cleanup failed.');
  console.log(`Cleanup complete. Workspace candidates removed: ${plannedBytes} bytes.`);
} else {
  console.log(`Dry run only. ${plannedBytes} bytes of workspace outputs are eligible; npm cache cleanup will also run with --apply.`);
}
