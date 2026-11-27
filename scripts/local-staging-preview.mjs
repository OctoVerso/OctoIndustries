import { pbkdf2Sync, randomBytes, createHmac, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, 'supabase/.env.preview.local');
const databaseContainer = 'octo-preview-db';
const postgrestContainer = 'octo-preview-rest';
const networkName = 'octo-preview';
const volumeName = 'octo-preview-db-data';
const sampleTicketToken = 'octo-preview-ticket-access-v1';
const sampleTicketHash = createHash('sha256').update(sampleTicketToken).digest('hex');
const migrationsDir = resolve(root, 'supabase/migrations');
const baseSchemaPath = resolve(root, 'supabase/preview/base-schema.sql');

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')]));
}

function serializeEnv(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
}

function makeServiceToken(secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ role: 'service_role', iss: 'octo-local-preview', iat: 1, exp: 4102444800 });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function generatedConfig() {
  const password = `Octo-Preview-${randomBytes(12).toString('base64url')}!`;
  const salt = randomBytes(16).toString('hex');
  const passwordHash = pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  const jwtSecret = randomBytes(48).toString('hex');
  return {
    POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
    POSTGREST_AUTHENTICATOR_PASSWORD: randomBytes(32).toString('hex'),
    POSTGREST_JWT_SECRET: jwtSecret,
    SUPABASE_URL: 'http://127.0.0.1:54322',
    SUPABASE_SERVICE_ROLE_KEY: makeServiceToken(jwtSecret),
    ADMIN_SESSION_SECRET: randomBytes(48).toString('hex'),
    OCTO_ADMIN_PASSWORD_HASH: `pbkdf2$120000$${salt}$${passwordHash}`,
    OCTO_PREVIEW_PASSWORD: password,
    SITE_URL: 'http://127.0.0.1:8080',
    ALLOWED_ORIGIN: 'http://127.0.0.1:8080',
  };
}

function docker(args, { input, stdio = 'inherit' } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', args, { cwd: root, stdio: input === undefined ? stdio : ['pipe', stdio === 'inherit' ? 'inherit' : 'ignore', 'inherit'] });
    if (input !== undefined) child.stdin.end(input);
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`docker ${args[0]} exited with status ${code ?? 'unknown'}`)));
  });
}

function dockerSync(args) {
  return spawnSync('docker', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function containerExists(name) {
  return dockerSync(['container', 'inspect', name]).status === 0;
}

function runPsql(config, sql) {
  return docker(['exec', '-i', databaseContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql });
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function sqlArray(values = []) {
  return `array[${values.map(sqlText).join(',')}]::text[]`;
}

async function loadCatalogSql() {
  const catalogPath = resolve(root, 'Octo-Industries/BehindTheScenes/hub/catalog.js');
  const source = await readFile(catalogPath, 'utf8');
  const match = /^window\.OCTO_GAMES\s*=\s*Object\.freeze\(([\s\S]*)\);\s*$/.exec(source);
  if (!match) throw new Error('Could not parse the generated game catalog for local sample data.');
  const games = JSON.parse(match[1]);
  if (games.length !== 36) throw new Error(`Expected 36 generated catalog entries; found ${games.length}.`);
  const values = games.map((game) => `(
    ${sqlText(game.id)},
    ${sqlText(game.title)},
    ${sqlText(game.description || '')},
    ${sqlText(game.version || '1.0.0')},
    ${sqlText(game.category || 'Other')},
    ${sqlArray(game.tags)},
    ${game.featured === true},
    ${sqlText(game.launch)},
    ${sqlText(game.thumbnail || '')},
    ${game.accent ? sqlText(game.accent) : 'null'},
    ${sqlText(game.banner || game.thumbnail || '')},
    ${sqlText(game.bannerFit || 'cover')},
    ${sqlArray(game.screenshots)},
    ${game.offlineReady === true},
    ${sqlText('published')},
    ${sqlText(game.addedAt || new Date().toISOString())},
    now(),
    ${sqlText(game.acquisitionStatus || 'unverified')},
    ${sqlText(game.runtimeStatus || 'unverified')},
    ${sqlText(game.networkDependency || 'unverified')},
    ${game.saveLevel === null || game.saveLevel === undefined ? 'null' : Number(game.saveLevel)},
    ${sqlText(game.saveStatus || 'unverified')},
    ${sqlText(game.testStatus || 'unverified')},
    ${sqlJson(game.acquisitionEvidence || [])}
  )`).join(',\n');
  return `insert into public.games
    (id,title,description,version,category,tags,featured,launch,thumbnail,accent,banner_source,banner_fit,screenshots,offline_ready,status,created_at,updated_at,acquisition_status,runtime_status,network_dependency,save_level,save_status,test_status,acquisition_evidence)
    values ${values}
    on conflict (id) do nothing;
`;
}

function sampleDataSql() {
  return `
insert into public.feedback
  (id,type,game_id,message,device_info,status,priority,admin_notes,folder,is_read,is_pinned,is_starred,created_at,updated_at,access_token_hash)
values
  ('a1111111111111111111111111111111','bug','8-ball-pool-online','Preview sample: the sound toggle should remain selected after changing views.',${sqlJson({ device: 'iPad Air', browser: 'Safari', screenResolution: '1180 × 820', octoVersion: 'Local preview' })},'new','high','','inbox',false,true,false,now()-interval '2 hours',now()-interval '2 hours',null),
  ('a2222222222222222222222222222222','suggestion','drive-mad','Preview sample: add a compact portrait layout option.',${sqlJson({ device: 'iPad Mini', browser: 'Safari', screenResolution: '744 × 1133', octoVersion: 'Local preview' })},'in_progress','medium','Sample-only note','inbox',true,false,true,now()-interval '1 day',now()-interval '4 hours',${sqlText(sampleTicketHash)}),
  ('a3333333333333333333333333333333','question','b-cubed','Preview sample: where are local saves stored?',${sqlJson({ device: 'Desktop', browser: 'Chromium', octoVersion: 'Local preview' })},'resolved','low','','resolved',true,false,false,now()-interval '4 days',now()-interval '3 days',null)
on conflict (id) do nothing;

update public.feedback
set access_token_hash = ${sqlText(sampleTicketHash)}
where id = 'a2222222222222222222222222222222' and access_token_hash is null;

insert into public.feedback_conversations (feedback_id,author_type,message,created_at)
select 'a2222222222222222222222222222222','admin','Sample response: the dashboard layout is being reviewed. No external message was sent.',now()-interval '3 hours'
where not exists (
  select 1 from public.feedback_conversations
  where feedback_id = 'a2222222222222222222222222222222'
    and message = 'Sample response: the dashboard layout is being reviewed. No external message was sent.'
);

insert into public.feedback_activity (feedback_id,action,actor_type,created_at)
select 'a2222222222222222222222222222222','status_in_progress','admin',now()-interval '4 hours'
where not exists (
  select 1 from public.feedback_activity
  where feedback_id = 'a2222222222222222222222222222222' and action = 'status_in_progress'
);

insert into public.roadmap (id,title,description,status,category,priority,internal_notes)
values
  ('preview-tablet-layout','Tablet layout review','Review touch targets and navigation at common iPad widths.','in_progress','admin','high','Local preview sample.'),
  ('preview-save-audit','Save behavior verification','Document save persistence findings for the local catalog.','planned','quality','medium','Local preview sample.')
on conflict (id) do nothing;

update public.game_acquisition_queue
set id = 'f0000000000000000001'
where id = 'preview-acq-0001';

insert into public.game_acquisition_queue
  (id,game_id,title,action,state,approval_state,source_url,requested_version,acquisition_status,evidence,notes)
values
  ('f0000000000000000001','drive-mad','Drive Mad local metadata review','update','awaiting-evidence','not-requested',null,'1.0.0','local-payload',${sqlJson([{ kind: 'local', label: 'Existing local launch path', url: '/Octo-Industries/Drive-Mad/index.html' }])},'Sample queue entry. No game files are modified by this request.')
on conflict (id) do nothing;

insert into public.jobs (id,type,game_id,status,message,logs,result,created_at)
values
  ('preview-job-health-001','health','8-ball-pool-online','completed','Preview sample health check: metadata available.',${sqlJson(['Local sample job; no gameplay or external network checks were run.'])},${sqlJson({ checks: [{ name: 'Metadata complete', passed: true }] })},now()-interval '1 hour')
on conflict (id) do nothing;

update public.proposals
set id = 'c1111111111111111111111111111111'
where id in ('preview-proposal-001','b00000000000000000000000000000001');

insert into public.proposals (id,kind,title,summary,status,diff,manifest_path,manifest,created_at)
values
  ('c1111111111111111111111111111111','catalog','Preview-only sample proposal','Sample for checking review and dismissal controls.','pending','Local sample only; no files or pull requests are created.','',${sqlJson({ previewOnly: true })},now()-interval '30 minutes')
on conflict (id) do nothing;

insert into public.activity (message,created_at)
select 'Local staging preview initialized with sample records.',now()
where not exists (select 1 from public.activity where message = 'Local staging preview initialized with sample records.');

insert into public.activity (message,created_at)
select 'Sample proposal added for review-flow testing.',now()-interval '30 minutes'
where not exists (select 1 from public.activity where message = 'Sample proposal added for review-flow testing.');
`;
}

async function readOrCreateConfig() {
  if (existsSync(envPath)) {
    const current = parseEnv(await readFile(envPath, 'utf8'));
    if (current.SUPABASE_URL !== 'http://127.0.0.1:54322'
      || !current.POSTGRES_PASSWORD || !current.POSTGREST_AUTHENTICATOR_PASSWORD
      || !current.POSTGREST_JWT_SECRET || !current.SUPABASE_SERVICE_ROLE_KEY
      || !current.ADMIN_SESSION_SECRET || !current.OCTO_ADMIN_PASSWORD_HASH
      || !current.OCTO_PREVIEW_PASSWORD) {
      throw new Error('The ignored local preview configuration is invalid. No remote database was contacted.');
    }
    return current;
  }
  if (containerExists(databaseContainer) || containerExists(postgrestContainer)) {
    throw new Error('A local preview database exists but its private configuration is missing. Preserve it and restore supabase/.env.preview.local, or explicitly run npm run dev:preview:reset to erase only the local preview database.');
  }
  const config = generatedConfig();
  await mkdir(dirname(envPath), { recursive: true });
  await writeFile(envPath, serializeEnv(config), { mode: 0o600, flag: 'wx' });
  return config;
}

async function ensureInfrastructure(config) {
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('Docker is required to start the isolated local staging database.');
  }
  if (dockerSync(['network', 'inspect', networkName]).status !== 0) {
    await docker(['network', 'create', networkName], { stdio: 'ignore' });
  }
  if (!containerExists(databaseContainer)) {
    await docker([
      'run', '--detach', '--name', databaseContainer, '--network', networkName,
      '--network-alias', databaseContainer, '--volume', `${volumeName}:/var/lib/postgresql/data`,
      '--env', `POSTGRES_PASSWORD=${config.POSTGRES_PASSWORD}`,
      '--env', 'POSTGRES_DB=postgres', 'postgres:16',
    ], { stdio: 'ignore' });
  } else if (dockerSync(['container', 'inspect', '--format', '{{.State.Running}}', databaseContainer]).stdout.trim() !== 'true') {
    await docker(['start', databaseContainer], { stdio: 'ignore' });
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (dockerSync(['exec', databaseContainer, 'pg_isready', '-U', 'postgres']).status === 0) {
      ready = true;
      break;
    }
    await delay(500);
  }
  if (!ready) throw new Error('The isolated preview database did not become ready.');

  const baseSchema = (await readFile(baseSchemaPath, 'utf8'))
    .replace('__AUTHENTICATOR_PASSWORD__', config.POSTGREST_AUTHENTICATOR_PASSWORD);
  await runPsql(config, baseSchema);
  const migrationNames = (await (await import('node:fs/promises')).readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql')).sort();
  for (const migrationName of migrationNames) {
    const migration = await readFile(resolve(migrationsDir, migrationName), 'utf8');
    await runPsql(config, migration);
  }
  await runPsql(config, await loadCatalogSql());
  await runPsql(config, sampleDataSql());

  if (!containerExists(postgrestContainer)) {
    await docker([
      'run', '--detach', '--name', postgrestContainer, '--network', networkName,
      '--publish', '127.0.0.1:54323:3000',
      '--env', `PGRST_DB_URI=postgres://authenticator:${config.POSTGREST_AUTHENTICATOR_PASSWORD}@${databaseContainer}:5432/postgres`,
      '--env', 'PGRST_DB_SCHEMAS=public',
      '--env', 'PGRST_DB_ANON_ROLE=anon',
      '--env', `PGRST_JWT_SECRET=${config.POSTGREST_JWT_SECRET}`,
      '--env', 'PGRST_SERVER_PORT=3000',
      'postgrest/postgrest:v12.2.12',
    ], { stdio: 'ignore' });
  } else if (dockerSync(['container', 'inspect', '--format', '{{.State.Running}}', postgrestContainer]).stdout.trim() !== 'true') {
    await docker(['start', postgrestContainer], { stdio: 'ignore' });
  }
  let restReady = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:54323/', { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) { restReady = true; break; }
    } catch {}
    await delay(500);
  }
  if (!restReady) throw new Error('The local database REST service did not become ready.');
}

function checkPort(port) {
  const result = spawnSync(process.execPath, ['-e', `
    const net=require('node:net'); const s=net.connect(${port},'127.0.0.1');
    s.once('connect',()=>{s.destroy();process.exit(0)});s.once('error',()=>process.exit(1));
    setTimeout(()=>process.exit(1),250).unref();
  `], { stdio: 'ignore' });
  return result.status === 0;
}

async function printCredentials() {
  if (!existsSync(envPath)) throw new Error('Start the isolated preview once before requesting its local test credential.');
  const config = parseEnv(await readFile(envPath, 'utf8'));
  console.log(`Local-only admin password: ${config.OCTO_PREVIEW_PASSWORD}`);
  console.log(`Local-only sample ticket access token: ${sampleTicketToken}`);
  console.log('Use these only at the private Codespaces port-8080 preview. No production account or database is involved.');
}

async function resetPreview() {
  for (const container of [postgrestContainer, databaseContainer]) {
    if (containerExists(container)) await docker(['rm', '--force', container]);
  }
  if (dockerSync(['volume', 'inspect', volumeName]).status === 0) await docker(['volume', 'rm', volumeName]);
  if (dockerSync(['network', 'inspect', networkName]).status === 0) await docker(['network', 'rm', networkName]);
  const { unlink } = await import('node:fs/promises');
  if (existsSync(envPath)) await unlink(envPath);
  console.log('Removed only the named local preview containers, network, volume, and ignored preview configuration.');
}

async function startPreview() {
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('Docker is required to start the isolated local staging database.');
  }
  const config = await readOrCreateConfig();
  if (checkPort(8080)) throw new Error('Port 8080 is already in use. Stop the existing listener before starting the isolated preview; no existing process was changed.');
  if (checkPort(54322) && !containerExists(postgrestContainer)) throw new Error('Port 54322 is already in use by another process; refusing to bind the local preview database API.');
  if (checkPort(54323) && !containerExists(postgrestContainer)) throw new Error('Port 54323 is already in use by another process; refusing to bind the local PostgREST service.');
  await ensureInfrastructure(config);
  console.log('Local isolated database ready: Postgres 16 + PostgREST, bound to loopback only.');
  console.log('Sample records: 36 catalog entries, feedback tickets, roadmap items, acquisition queue, jobs, and a pending proposal.');
  console.log('Use `npm run dev:preview:credentials` in another terminal for the local-only test password.');
  const env = {
    ...process.env,
    OCTO_ENV_FILE: envPath,
    OCTO_LOCAL_STAGING: '1',
    OCTO_PREVIEW_API_PROXY: '1',
    PORT: '8080',
  };
  if (checkPort(54321)) throw new Error('Port 54321 is already in use; refusing to replace the existing local function service.');
  const children = [];
  let stopping = false;
  const stop = (signal = 'SIGTERM') => {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill(signal);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
  const launch = (script) => {
    const child = spawn(process.execPath, [script, ...(script === 'scripts/serve-static.mjs' ? ['.'] : [])], { cwd: root, env, stdio: 'inherit' });
    children.push(child);
    child.on('error', (error) => { console.error(`Could not start ${child.spawnfile}: ${error.message}`); stop(); });
    child.on('exit', (code) => {
      if (!stopping) {
        console.error(`Preview service exited with status ${code ?? 'unknown'}.`);
        stop();
      }
    });
    return child;
  };
  const waitForPort = async (port) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (stopping || children.some((child) => child.exitCode !== null)) throw new Error('A local preview service exited during startup.');
      if (checkPort(port)) return;
      await delay(100);
    }
    throw new Error(`Local preview service did not open port ${port}.`);
  };
  launch('scripts/local-postgrest-proxy.mjs');
  await waitForPort(54322);
  launch('scripts/local-functions-server.mjs');
  await waitForPort(54321);
  launch('scripts/serve-static.mjs');
  await waitForPort(8080);
  console.log('Open the forwarded port-8080 dashboard at /Octo-Industries/BehindTheScenes/admin/.');
  await new Promise((resolvePromise) => {
    const timer = setInterval(() => {
      if (stopping || children.some((child) => child.exitCode !== null)) {
        clearInterval(timer);
        resolvePromise();
      }
    }, 250);
  });
}

const command = process.argv[2] || 'start';
if (command === 'start') await startPreview();
else if (command === 'credentials') await printCredentials();
else if (command === 'reset') await resetPreview();
else throw new Error('Supported commands are start, credentials, and reset.');
