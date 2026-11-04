import { readFileSync } from 'node:fs';

// Reads the generated value from stdin and reports its shape. Secret content is never printed.
const raw = readFileSync(0, 'utf8');
const hidden = [...raw].filter((character) => character < ' ' || character > '~');
const parts = raw.split('$');
const describe = (text) => `${text.length} (${[...text].filter((character) => !/[a-f\d]/.test(character)).length} non-lowercase-hex)`;

console.log(`total length:        ${raw.length}`);
console.log(`"$" parts:           ${parts.length} (expected 4)`);
console.log(`starts with NAME=:   ${/^\s*OCTO_ADMIN_PASSWORD_HASH\s*=/.test(raw)}`);
console.log(`uppercase letters:    ${/[A-Z]/.test(raw)}`);
console.log(`quotes present:      ${/['"]/.test(raw)}`);
console.log(`hidden/control chars: ${hidden.length}${hidden.length ? ` (codes: ${hidden.map((c) => c.codePointAt(0).toString(16)).join(', ')})` : ''}`);
if (parts.length === 4) {
  console.log(`scheme:              ${parts[0] === 'pbkdf2' ? 'pbkdf2 (ok)' : `wrong, length ${parts[0].length}`}`);
  console.log(`iterations length:   ${parts[1].length} (expected 5-7 digits)`);
  console.log(`salt length:         ${describe(parts[2])} (expected 32)`);
  console.log(`hash length:         ${describe(parts[3])} (expected 128)`);
}

const ok = /^pbkdf2\$\d{5,7}\$[a-f\d]{32}\$[a-f\d]{128}$/.test(raw);
console.log(ok ? '\nVALID' : '\nINVALID');
process.exitCode = ok ? 0 : 1;
