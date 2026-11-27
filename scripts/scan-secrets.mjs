import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
const history = process.argv.includes('--history');
const publicArtifact = process.argv.includes('--artifact');
const { createHash } = await import('node:crypto');
// SHA-256 fingerprints allow only these exact browser-public API-key values.
// They are not secrets and no key value is stored in this repository.
const publicGoogleKeyFingerprints = new Set([
  '51291b4f5361c56c83d4f27daa2de184bd0d7ef2549c4d3cbce1af5e4a158fb2',
  '692557bb1809478b9bd36b55200f0993fe18c2d1f2a20d71f999ab3a71029470',
]);
const patterns = [
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/],
];
// Exact local secrets are compared in memory, never printed or included in output.
let secrets = [];
try { secrets = readFileSync('supabase/.env.local', 'utf8').split(/\r?\n/).flatMap((line) => {
  const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (!match || !/SECRET|PASSWORD|TOKEN|SERVICE_ROLE|API_KEY/.test(match[1])) return [];
  const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
  return value.length >= 20 && !value.startsWith('replace-') ? [[match[1], value]] : [];
}); } catch { /* CI does not need local secrets. */ }
let count = 0; const findings = [];
function inspect(bytes, file) {
  const text = bytes.toString('utf8'); if (text.includes('\0')) return; count++;
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(ADMIN_SESSION_SECRET|OCTO_ADMIN_PASSWORD_HASH|SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|GEMINI_API_KEY|OCTO_GEMINI_API_KEY)\s*=(.*)$/.exec(line);
    if (!match) continue;
    const [, name, rawValue] = match;
    const value = rawValue
      .replace(/\s+#.*$/, '')
      .replace(/^(['"])(.*)\1$/, '$2')
      .trim();
    if (value.length >= 20 && !/^replace(?:-|$)/i.test(value) && !/^your-/i.test(value)) {
      findings.push({ file, service: `environment secret assignment (${name})` });
    }
  }
  for (const [service, pattern] of patterns) {
    for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
      if (service === 'Google API key') {
        const fingerprint = createHash('sha256').update(match[0]).digest('hex');
        if (publicGoogleKeyFingerprints.has(fingerprint)) continue;
      }
      findings.push({ file, service });
    }
  }
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url')).role === 'service_role') findings.push({ file, service: 'Supabase service-role JWT' }); } catch { /* Not a JWT. */ }
  }
  for (const [name, value] of secrets) if (text.includes(value)) findings.push({ file, service: `local ${name}` });
}
if (history) {
  const list = execFileSync('git', ['rev-list', '--objects', '--all'], { maxBuffer: 64 * 1024 * 1024 }).toString().trim().split('\n');
  const refs = list.map((line) => line.split(' ')[0]); const paths = new Map(list.map((line) => [line.split(' ')[0], line.slice(line.indexOf(' ') + 1)]));
  const meta = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { input: refs.join('\n'), maxBuffer: 64 * 1024 * 1024 }).toString().trim().split('\n');
  const selected = meta.filter((line) => { const [, type, size] = line.split(' '); return type === 'blob' && Number(size) <= 2 * 1024 * 1024; }).map((line) => line.split(' ')[0]);
  const proc = spawn('git', ['cat-file', '--batch']); let buffer = Buffer.alloc(0), expected = null, id;
  proc.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (expected === null) { const end = buffer.indexOf(10); if (end < 0) break; const header = buffer.subarray(0,end).toString().split(' '); id = header[0]; expected = Number(header[2]); buffer = buffer.subarray(end + 1); }
      if (buffer.length < expected + 1) break;
      inspect(buffer.subarray(0,expected), `${paths.get(id)} @ ${id.slice(0,12)}`); buffer = buffer.subarray(expected + 1); expected = null;
    }
  });
  proc.stdin.end(selected.join('\n') + '\n'); await new Promise((resolve, reject) => { proc.on('error',reject); proc.on('exit',(code) => code ? reject(new Error('History scan failed')) : resolve()); });
} else {
  const files = publicArtifact ? execFileSync('find', ['dist', '-type', 'f', '-size', '-2M', '-print0'], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\0') : execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\0');
  for (const file of files.filter(Boolean)) { try { if (statSync(file).size <= 2 * 1024 * 1024) inspect(readFileSync(file), file); } catch { /* Existing deletions are preserved. */ } }
}
for (const finding of findings) console.error(`${finding.service}: ${finding.file} (value redacted)`);
console.log(`Scanned ${count} text blobs up to 2 MiB; ${findings.length} potential credential findings. Large/binary objects excluded.`);
if (findings.length) process.exitCode = 1;
