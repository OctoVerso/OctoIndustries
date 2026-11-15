export function gameCategories(games) {
  return [...new Set(games
    .map((game) => typeof game.category === 'string' ? game.category.trim() : '')
    .filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
}
