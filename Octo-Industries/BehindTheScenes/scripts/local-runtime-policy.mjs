const remoteUrlPattern = /^(?:https?:)?\/\//i;

export function externalRuntimeAssetSources(html) {
  const sources = [];
  for (const match of html.matchAll(/<\s*([a-z][\w:-]*)\b[^>]*>/gi)) {
    const tagName = match[1].toLowerCase();
    const tag = match[0];
    const attribute = ['iframe', 'frame', 'script', 'img', 'audio', 'video', 'source', 'embed'].includes(tagName)
      ? 'src'
      : tagName === 'object'
        ? 'data'
        : tagName === 'link' && /\brel\s*=\s*(["'])[^"']*(?:stylesheet|preload|icon|manifest)[^"']*\1/i.test(tag)
          ? 'href'
          : '';
    if (!attribute) continue;
    const source = new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2]?.trim();
    if (source && remoteUrlPattern.test(source)) sources.push(source);
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    sources.push(...externalCssAssetSources(match[1]));
  }
  for (const match of html.matchAll(/\bstyle\s*=\s*(["'])(.*?)\1/gi)) {
    sources.push(...externalCssAssetSources(match[2]));
  }
  return [...new Set(sources)];
}

export function externalCssAssetSources(css) {
  const sources = [];
  for (const match of css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)) {
    const url = match[2].trim();
    if (remoteUrlPattern.test(url)) sources.push(url);
  }
  for (const match of css.matchAll(/@import\s*(?:url\(\s*)?(["'])(.*?)\1\s*\)?/gi)) {
    const url = match[2].trim();
    if (remoteUrlPattern.test(url)) sources.push(url);
  }
  return [...new Set(sources)];
}

export function assertNoExternalRuntimeAssets(html, sourceFile) {
  const sources = sourceFile.toLowerCase().endsWith('.css')
    ? externalCssAssetSources(html)
    : externalRuntimeAssetSources(html);
  if (sources.length) {
    throw new Error(`${sourceFile} loads externally hosted runtime assets: ${sources.join(', ')}`);
  }
}
