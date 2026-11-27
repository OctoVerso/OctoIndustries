import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['scripts/local-staging-preview.mjs', process.argv[2] || 'start'], {
  stdio: 'inherit',
  env: process.env,
});
child.once('error', (error) => {
  console.error(`Could not start isolated preview: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code) => { process.exitCode = code ?? 1; });
