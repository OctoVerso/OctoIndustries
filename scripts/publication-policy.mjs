// Shared by Pages packaging and local previews; the repository itself is not a web root.
export function isPublicPath(path) {
  const normalized = String(path).replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.' || (part.startsWith('.') && part !== '.nojekyll'))) return false;
  if (parts.some((part) => ['node_modules', '__pycache__', 'tests', 'test-results'].includes(part))) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]s$|\.backup(?:\.|$)|\.(?:env|pem|key|sql|zip|log|map)$/i.test(normalized)) return false;
  if (/(?:^|\/)(?:package(?:-lock)?\.json|AGENTS\.md|SKILL\.md|deno\.lock)$/i.test(normalized)) return false;
  if (normalized.startsWith('Octo-Industries/BehindTheScenes/scripts')) return false;
  if (normalized.includes('legacy-domain-redirect.')) return false;
  return !parts.length || ['index.html', '404.html', 'robots.txt', 'sitemap.xml', '.nojekyll', 'admin'].includes(parts[0]) || parts[0] === 'Octo-Industries';
}
