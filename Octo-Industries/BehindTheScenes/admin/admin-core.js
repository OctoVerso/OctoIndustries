// Small, dependency-free primitives shared by the dashboard and regression tests.
globalThis.OctoAdminCore = Object.freeze({
  summarizeBulk(result, requested) {
    if (!Number.isInteger(result?.updated) || result.updated < 0 || result.updated > requested.length) {
      throw new Error('The server did not confirm the update count. Refresh before retrying.');
    }
    const updatedIds = Array.isArray(result.updatedIds) ? result.updatedIds.filter((id) => requested.includes(id)) : [];
    return { updated: result.updated, failed: requested.length - result.updated,
      remaining: updatedIds.length === result.updated ? requested.filter((id) => !updatedIds.includes(id)) : result.updated === requested.length ? [] : requested };
  },
  trend(entries, days, now = Date.now()) {
    const end = new Date(now); end.setUTCHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(end.getTime() - (days - index - 1) * 86400000).toISOString().slice(0, 10);
      return { date, count: entries.filter((entry) => typeof entry.createdAt === 'string' && entry.createdAt.slice(0, 10) === date).length };
    });
  },
  safeAsset(path, siteRoot) {
    try {
      const root = new URL(siteRoot);
      const url = new URL(String(path || '').replace(/^\/+/, ''), root);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === root.origin && url.pathname.startsWith(root.pathname) ? url.href : '';
    } catch { return ''; }
  },
});
