export function gameCategories(games) {
  return [...new Set(games
    .map((game) => typeof game.category === 'string' ? game.category.trim() : '')
    .filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
}

export function mergeGameCatalog(generatedGames, publicGames) {
  const generatedById = new Map(generatedGames.map((game) => [game.id, game]));
  return publicGames.map((game) => ({ ...generatedById.get(game.id), ...game }));
}

export function normalizePlayCounts(playCounts) {
  if (!playCounts || typeof playCounts !== 'object' || Array.isArray(playCounts)) return {};
  const normalized = {};
  for (const [gameId, value] of Object.entries(playCounts)) {
    if (typeof gameId !== 'string' || !gameId) continue;
    const count = typeof value === 'number'
      ? value
      : value && typeof value === 'object'
        ? value.count
        : 0;
    const finiteCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
    if (!finiteCount) continue;
    const lastPlayedAt = value && typeof value === 'object'
      ? Date.parse(value.lastPlayedAt || '') || 0
      : 0;
    normalized[gameId] = { count: finiteCount, lastPlayedAt };
  }
  return normalized;
}

export function rankTrendingGames(games, playCounts, limit = Infinity) {
  if (!Array.isArray(games)) return [];
  const counts = normalizePlayCounts(playCounts);
  const gamesById = new Map(games.filter((game) => game && typeof game.id === 'string').map((game) => [game.id, game]));
  return Object.entries(counts)
    .filter(([gameId, entry]) => entry.count > 0 && gamesById.has(gameId))
    .map(([gameId, entry]) => ({
      game: gamesById.get(gameId),
      playCount: entry.count,
      lastPlayedAt: entry.lastPlayedAt,
    }))
    .sort((first, second) =>
      second.playCount - first.playCount
      || second.lastPlayedAt - first.lastPlayedAt
      || first.game.title.localeCompare(second.game.title, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, Number.isFinite(limit) ? Math.max(0, limit) : undefined)
    .map((entry) => ({ ...entry.game, playCount: entry.playCount }));
}
