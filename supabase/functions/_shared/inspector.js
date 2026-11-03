import { httpError } from './http.js';

const maxBytes = 1024 * 1024;
const maxRedirects = 3;

function ipv4Public(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c <= 2)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113));
}

export function isPublicAddress(address) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return ipv4Public(value);
  if (!value.includes(':')) return false;
  const mapped = /^(?:0{0,4}:){1,5}(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return ipv4Public(mapped[1]);
  const hexMapped = /^(?:0{0,4}:){1,5}ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(value);
  if (hexMapped) {
    const high = Number.parseInt(hexMapped[1], 16);
    const low = Number.parseInt(hexMapped[2], 16);
    return ipv4Public(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
  }
  const first = Number.parseInt(value.split(':')[0] || '0', 16);
  const second = Number.parseInt(value.split(':')[1] || '0', 16);
  return first >= 0x2000 && first <= 0x3fff
    && !(first === 0x2001 && (second <= 0x0002 || second === 0x0db8))
    && first !== 0x2002;
}

async function defaultResolve(hostname) {
  const deno = globalThis.Deno;
  if (!deno?.resolveDns) throw httpError('DNS resolution is unavailable, so the host cannot be verified as public.', 503);
  const addresses = [];
  for (const type of ['A', 'AAAA']) {
    try { addresses.push(...await deno.resolveDns(hostname, type)); } catch { /* no records of this type */ }
  }
  return addresses;
}

async function assertSafeUrl(url, resolve) {
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw httpError('Enter a public HTTP or HTTPS game page URL without embedded credentials.', 400);
  }
  if (url.port && url.port !== (url.protocol === 'http:' ? '80' : '443')) throw httpError('Only standard HTTP and HTTPS ports are allowed.', 400);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw httpError('Local network addresses are not allowed.', 400);
  }
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (!isPublicAddress(host)) throw httpError('Private or reserved network addresses are not allowed.', 400);
    return;
  }
  const addresses = await resolve(host);
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw httpError('The host resolves to a private or reserved network address.', 400);
  }
}

async function readLimited(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw httpError('The game page exceeds the 1 MB analysis limit.', 422);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function fetchGamePage(input, { resolve = defaultResolve, fetcher = fetch } = {}) {
  let url;
  try { url = new URL(input); } catch { throw httpError('Enter a valid game page URL.', 400); }
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    await assertSafeUrl(url, resolve);
    let response;
    try {
      response = await fetcher(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Octo-Industries-Admin/1.0', Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw httpError('The game page could not be reached or timed out.', 422);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (redirects === maxRedirects || !location) throw httpError('The game page redirected too many times.', 422);
      url = new URL(location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel();
      throw httpError(`The game page returned HTTP ${response.status}.`, 422);
    }
    if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel();
      throw httpError('The URL did not return an HTML game page.', 422);
    }
    return { url, html: await readLimited(response) };
  }
  throw httpError('Unable to inspect the game page.', 422);
}

export function inspectHtml(html, pageUrl) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]*>/g, '').replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim() || '';
  const resources = [];
  const tags = /<(script|iframe|img|audio|video|source|link|embed|object)\b([^>]*)>/gi;
  let match;
  while ((match = tags.exec(html)) && resources.length < 150) {
    const source = match[2].match(/\b(?:src|href|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!source) continue;
    const path = source[1] || source[2] || source[3];
    if (!path || path.startsWith('data:') || path.startsWith('javascript:')) continue;
    try {
      const url = new URL(path, pageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      resources.push({ type: match[1].toLowerCase(), url: url.href, external: url.origin !== pageUrl.origin });
    } catch {
      continue;
    }
  }
  const lower = html.toLowerCase();
  const engine = /unityweb|unityloader|unityinstance/.test(lower) ? 'Unity WebGL'
    : /godot|\.pck/.test(lower) ? 'Godot'
      : /unreal|ue4/.test(lower) ? 'Unreal Engine'
        : /phaser/.test(lower) ? 'Phaser'
          : /construct/.test(lower) ? 'Construct'
            : 'Unknown';
  return {
    title,
    engine,
    entry: pageUrl.href,
    resourceCount: resources.length,
    externalCount: resources.filter((resource) => resource.external).length,
    resources,
    note: 'This is a page-source scan only. It does not download game files, prove authorization, test gameplay, or verify offline operation.',
  };
}

export async function inspectGame(url, options) {
  const page = await fetchGamePage(url, options);
  return inspectHtml(page.html, page.url);
}
