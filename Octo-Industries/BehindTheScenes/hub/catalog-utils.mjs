export function gameCategories(games) {
  return [...new Set(games
    .map((game) => typeof game.category === 'string' ? game.category.trim() : '')
    .filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
}

export function mergeGameCatalog(generatedGames, publicGames) {
  const gamesById = new Map(generatedGames.map((game) => [game.id, game]));
  for (const game of publicGames) {
    gamesById.set(game.id, { ...gamesById.get(game.id), ...game });
  }
  return [...gamesById.values()];
}
