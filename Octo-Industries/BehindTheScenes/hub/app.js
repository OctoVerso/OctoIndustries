import { getRouteTitle, normalizeHubRoute } from './route-utils.js';
import { gameCategories, mergeGameCatalog, rankTrendingGames } from './catalog-utils.mjs';
import { createPersistence } from './persistence.mjs';
import { compareRegistryIntegrity } from './registry-integrity.mjs';

const normalizeGame = (game) => ({
  ...game,
  launch: window.OCTO_CONFIG.assetUrl(game.launch),
  thumbnail: window.OCTO_CONFIG.assetUrl(game.thumbnail),
  screenshots: Array.isArray(game.screenshots) ? game.screenshots.map(window.OCTO_CONFIG.assetUrl) : game.screenshots,
});

const generatedCatalog = Array.isArray(window.OCTO_GAMES) ? window.OCTO_GAMES : [];
let games = generatedCatalog.map(normalizeGame);
const hubPersistence = createPersistence({ windowRef: window });
console.info('[Octo Industries] Generated catalog loaded.', { totalGames: games.length });
if (!games.length) console.error('[Octo Industries] The generated catalog is missing or empty.');
let byId = new Map(games.map((game) => [game.id, game]));
const grid = document.querySelector('#game-grid');
const searchInput = document.querySelector('#game-search');
const homeSearchInput = document.querySelector('#home-game-search');
const filterCategoryOptions = document.querySelector('#filter-category-options');
const resultSummary = document.querySelector('#results-summary');
const emptyState = document.querySelector('#empty-state');
const continueList = document.querySelector('#continue-list');
const recentlyAddedList = document.querySelector('#dashboard-recently-added-list');
const trendingList = document.querySelector('#trending-list');
const comingGrid = document.querySelector('#coming-grid');
const newsGrid = document.querySelector('#news-grid');
let roadmapItems = [];
let featuredGames = games.filter((game) => game.featured);
let slides = featuredGames.length ? featuredGames : games;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let activeCategory = 'All';
let slideIndex = 0;
let searchTimer;
let activeGallery;
let galleryIndex = 0;
let galleryTrigger = null;
let gameInteractionsBound = false;
let detailRenderToken = 0;
const octoConfig = window.OCTO_CONFIG;
const fallbackBannerUrl = octoConfig.assetUrl('Octo-Industries/branding/fallback-banner.svg?v=1');

// GitHub Pages cannot serve clean URLs, so pages are addressed with hash routes such as #/trending.
function currentRoute() {
  return normalizeHubRoute(window.location.hash.replace(/^#/, '') || '/');
}

function pushRoute(route) {
  const target = normalizeHubRoute(route);
  if (currentRoute() !== target) window.history.pushState({}, '', `#${target}`);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function readRecent() {
  return hubPersistence.getRecent().filter((id) => byId.has(id));
}

function readPlayCounts() {
  return hubPersistence.getPlayCounts();
}

function markPlayed(game) {
  try {
    hubPersistence.markPlayed(game.id);
    refreshTrendingDisplays();
  } catch {
    return;
  }
}

function imageMarkup(game, className, contain = false) {
  if (!game.thumbnail) return '';
  return `<img class="${className}" data-game-id="${escapeHtml(game.id)}" data-source-file="${escapeHtml(game.sourceFile || '')}" src="${escapeHtml(game.thumbnail)}" alt="" loading="${className === 'featured-image' ? 'eager' : 'lazy'}" decoding="async"${contain ? ' data-contain="true"' : ''}>`;
}

function updateFilterButtonLabel() {
  const filterButton = document.querySelector('#filter-games');
  if (!filterButton) return;
  const count = activeCategory === 'All' ? 0 : 1;
  const label = filterButton.querySelector('.filter-button-text');
  if (label) {
    label.textContent = count ? `Filter by (${count})` : 'Filter by';
  }
  filterButton.setAttribute('aria-label', count ? `Filter games, ${count} active` : 'Filter games');
}

function categories() {
  if (activeCategory !== 'All' && !gameCategories(games).includes(activeCategory)) activeCategory = 'All';
  if (filterCategoryOptions) {
    filterCategoryOptions.innerHTML = ['All', ...gameCategories(games)].map((category) => `
      <button type="button" class="filter-option${activeCategory === category ? ' is-active' : ''}"
        data-category="${escapeHtml(category)}" aria-pressed="${activeCategory === category}">
        ${category === 'All' ? 'All Games' : escapeHtml(category)}
      </button>`).join('');
  }
  updateFilterButtonLabel();
}

function gameCard(game, index, localPlayCount = null) {
  const tags = [game.category, ...(game.tags || [])].filter((tag, position, list) => list.indexOf(tag) === position).slice(0, 2);
  const hasThumbnail = Boolean(game.thumbnail);
  const galleryControl = Array.isArray(game.screenshots) && game.screenshots.length
    ? `<button class="gallery-link" type="button" data-gallery-id="${escapeHtml(game.id)}" aria-label="Open screenshots for ${escapeHtml(game.title)}">GALLERY</button>`
    : '';
  const detailRoute = `/games/${encodeURIComponent(game.id)}`;
  return `
    <article class="game-card" style="animation-delay:${Math.min(index * 45, 225)}ms" data-game-id="${escapeHtml(game.id)}">
      <a class="game-art" data-category="${escapeHtml(game.category)}" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}" aria-label="Play ${escapeHtml(game.title)}">
        ${hasThumbnail ? imageMarkup(game, 'game-image') : `<span class="art-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>`}
        ${localPlayCount !== null ? `<span class="trend-indicator">${localPlayCount} local plays</span>` : ''}
        <span class="art-live"><i></i> READY TO PLAY</span><span class="art-category">${escapeHtml(game.category.toUpperCase())}</span>
      </a>
      <div class="game-card-copy">
        <div><div class="game-heading-line"><h3><a class="game-title-link" href="#${escapeHtml(detailRoute)}" data-route="${escapeHtml(detailRoute)}" aria-label="Details for ${escapeHtml(game.title)}">${escapeHtml(game.title)}</a></h3><span class="category-label">${escapeHtml(game.category.toUpperCase())}</span></div><p class="game-description">${escapeHtml(game.description)}</p></div>
        <div class="game-card-foot"><div class="game-tags">${tags.map((tag) => `<span class="game-tag">#${escapeHtml(tag.toLowerCase())}</span>`).join('')}</div><div class="game-card-actions">${galleryControl}<a class="play-link" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}"><span aria-hidden="true">▶</span> PLAY</a></div></div>
      </div>
    </article>`;
}

function checkRenderedCollection(expectedGames, container, label = 'collection') {
  if (!container) return;
  const actualIds = [...container.querySelectorAll('.game-card[data-game-id]')].map((element) => element.dataset.gameId);
  const result = compareRegistryIntegrity(expectedGames, actualIds);
  if (!result.ok) {
    console.error(`[Octo Industries] ${label} integrity check failed.`, result);
  }
}

function renderGalleryImage() {
  if (!activeGallery) return;
  const image = document.querySelector('#gallery-image');
  const screenshot = activeGallery.screenshots[galleryIndex];
  image.dataset.fallbackAttempted = 'false';
  image.src = screenshot;
  image.alt = `${activeGallery.title} gameplay screenshot ${galleryIndex + 1}`;
  document.querySelector('#gallery-caption').textContent = `Screenshot ${galleryIndex + 1} of ${activeGallery.screenshots.length}`;
  document.querySelector('#gallery-count').textContent = `${String(galleryIndex + 1).padStart(2, '0')} / ${String(activeGallery.screenshots.length).padStart(2, '0')}`;
  document.querySelectorAll('#gallery-thumbnails [data-gallery-index]').forEach((button, index) => {
    button.setAttribute('aria-pressed', String(index === galleryIndex));
  });
  document.querySelector('#gallery-previous').disabled = activeGallery.screenshots.length < 2;
  document.querySelector('#gallery-next').disabled = activeGallery.screenshots.length < 2;
}

function openGallery(game) {
  if (!Array.isArray(game.screenshots) || !game.screenshots.length) return;
  activeGallery = game;
  galleryIndex = 0;
  galleryTrigger = document.activeElement;
  document.querySelector('#gallery-title').textContent = game.title;
  document.querySelector('#gallery-thumbnails').innerHTML = game.screenshots.map((screenshot, index) => `
    <button type="button" data-gallery-index="${index}" aria-label="Show screenshot ${index + 1}" aria-pressed="${index === 0}">
      <img src="${escapeHtml(screenshot)}" alt="" loading="lazy">
    </button>`).join('');
  renderGalleryImage();
  document.querySelector('#screenshot-gallery').showModal();
  document.querySelector('#gallery-close').focus();
}

function getMatches() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  return games.filter((game) => {
    const categoryMatch = activeCategory === 'All' || game.category === activeCategory;
    const searchIndex = [game.title, game.category, game.description, ...(game.tags || [])].join(' ').toLocaleLowerCase();
    return categoryMatch && (!query || searchIndex.includes(query));
  });
}

function renderGames() {
  const matches = getMatches();
  const sorting = document.querySelector('#game-sort').value;
  matches.sort((first, second) => {
    if (sorting === 'title-desc') return second.title.localeCompare(first.title);
    if (sorting === 'category') return first.category.localeCompare(second.category) || first.title.localeCompare(second.title);
    if (sorting === 'recent') return (Date.parse(second.addedAt || '') || 0) - (Date.parse(first.addedAt || '') || 0) || first.title.localeCompare(second.title);
    return first.title.localeCompare(second.title);
  });

  grid.innerHTML = matches.map((game, index) => gameCard(game, index)).join('');
  checkRenderedCollection(matches, grid, 'Games view');
  grid.hidden = matches.length === 0;
  emptyState.hidden = matches.length > 0;
  grid.setAttribute('aria-busy', 'false');
  resultSummary.textContent = matches.length === games.length && activeCategory === 'All' && !searchInput.value.trim()
    ? `${games.length} games, all ready to play`
    : `${matches.length} ${matches.length === 1 ? 'game' : 'games'} found`;
  document.querySelector('#search-clear').hidden = !searchInput.value;
  updateFilterButtonLabel();
}

function renderDashboardOverview() {
  const currentGames = Array.isArray(games) ? games : [];
  const recent = readRecent().map((id) => byId.get(id)).filter(Boolean);
  const trendingEntries = rankTrendingGames(currentGames, readPlayCounts());
  const overviewTotal = document.querySelector('#overview-total');
  const overviewCategories = document.querySelector('#overview-categories');
  const overviewTrending = document.querySelector('#overview-trending');
  const overviewContinue = document.querySelector('#overview-continue');
  const welcomeCopy = document.querySelector('#welcome-copy');

  if (overviewTotal) overviewTotal.textContent = String(currentGames.length || 0);
  if (overviewCategories) overviewCategories.textContent = String(new Set(currentGames.map((game) => game.category)).size || 0);
  if (overviewTrending) overviewTrending.textContent = String(trendingEntries.length || 0);
  if (overviewContinue) overviewContinue.textContent = String(recent.length || 0);
  if (welcomeCopy) welcomeCopy.textContent = `${String(currentGames.length || 0)} Games Ready to Play`;
}

function renderGameCollection() {
  if (!games.length) {
    grid.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector('h3').textContent = 'The collection is offline.';
    emptyState.querySelector('p').textContent = 'Run npm --prefix Octo-Industries/BehindTheScenes run sync to discover games and build the local catalog.';
    resultSummary.textContent = 'No game catalog found';
    return;
  }

  document.querySelector('#header-count').textContent = String(games.length).padStart(2, '0');
  document.querySelector('#library-count').innerHTML = `${String(games.length).padStart(2, '0')} GAMES IN THE COLLECTION <span>↘</span>`;
  categories();
  renderFeatured();
  renderGames();
  renderRecent();
  renderTrending();
  renderFavoriteDisplays();
  renderRecentlyAdded();
  renderHomeRoutes();
  if (!gameInteractionsBound) {
    bindEvents();
    drawAmbient();
    gameInteractionsBound = true;
  }
}

function updateFeedbackGameOptions() {
  const gameSelect = document.querySelector('#feedback-game');
  if (!gameSelect) return;
  const selectedGame = gameSelect.value;
  gameSelect.replaceChildren(...games.map((game) => new Option(game.title, game.id)));
  if (games.some((game) => game.id === selectedGame)) gameSelect.value = selectedGame;
}

function getUpcomingRoadmapItems() {
  return [...roadmapItems]
    .filter((item) => !['released', 'archived'].includes(item.status))
    .sort((first, second) => Date.parse(second.updatedAt || 0) - Date.parse(first.updatedAt || 0));
}

function getLatestNewsItems() {
  const releasedGames = [...games]
    .filter((game) => gameAddedDate(game) > 0)
    .sort((first, second) => gameAddedDate(second) - gameAddedDate(first));

  if (releasedGames.length) return releasedGames;

  return [...roadmapItems]
    .filter((item) => item.status === 'released')
    .sort((first, second) => Date.parse(second.updatedAt || 0) - Date.parse(first.updatedAt || 0));
}

function renderHomeNews() {
  const container = document.querySelector('#home-news-preview');
  if (!container) return;
  const candidate = getLatestNewsItems()[0] || null;

  if (!candidate) {
    container.innerHTML = '<p class="empty-mini-state">No released content has been published yet.</p>';
    return;
  }

  const title = candidate.title || candidate.name || 'New release';
  const description = candidate.description || 'New released content is now available.';
  const category = candidate.category || 'Released';
  const timestamp = candidate.updatedAt || candidate.addedAt || Date.now();

  container.innerHTML = `
    <div class="news-mini-card">
      <p class="news-kicker">${escapeHtml(category)}</p>
      <h3>${escapeHtml(title)}</h3>
      <p class="news-summary">${escapeHtml(description)}</p>
      <time>${escapeHtml(new Date(timestamp).toLocaleDateString())}</time>
      <button class="mini-link" type="button" data-route="/news">View All</button>
    </div>`;
}

function renderHomeComingSoon() {
  const container = document.querySelector('#home-coming-preview');
  if (!container) return;
  const candidate = getUpcomingRoadmapItems().sort((first, second) => {
    const priority = { 'in-progress': 0, testing: 1, planned: 2, idea: 3, 'on-hold': 4 };
    return (priority[first.status] ?? 99) - (priority[second.status] ?? 99) || Date.parse(second.updatedAt || 0) - Date.parse(first.updatedAt || 0);
  })[0] || null;

  if (!candidate) {
    container.innerHTML = '<p class="empty-mini-state">New updates are being planned.</p>';
    return;
  }

  container.innerHTML = `
    <div class="news-mini-card">
      <p class="news-kicker">${escapeHtml((candidate.status || 'Planned').replace(/-/g, ' '))}</p>
      <h3>${escapeHtml(candidate.title)}</h3>
      <p class="news-summary">${escapeHtml(candidate.description || 'Platform update')}</p>
      <time>${escapeHtml(new Date(candidate.updatedAt || Date.now()).toLocaleDateString())}</time>
      <button class="mini-link" type="button" data-route="/coming-soon">View Roadmap</button>
    </div>`;
}

function renderHomeRoutes() {
  renderHomeNews();
  renderHomeComingSoon();
  renderTrendingPage();
  renderRecentlyAddedPage();
  renderNewsPage();
}

function renderNewsPage() {
  const content = document.querySelector('#news-page-content');
  if (!content) return;
  const latest = getLatestNewsItems();
  if (!latest.length) {
    content.innerHTML = '<p class="empty-mini-state">No released content has been published yet.</p>';
    return;
  }

  content.innerHTML = latest.slice(0, 6).map((entry) => {
    const title = entry.title || entry.name || 'New release';
    const description = entry.description || 'Newly released content is now available.';
    const category = entry.category || 'Release';
    const timestamp = entry.updatedAt || entry.addedAt || Date.now();
    return `
      <article class="news-story">
        <p class="news-kicker">${escapeHtml(category)}</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="news-meta"><time>${escapeHtml(new Date(timestamp).toLocaleDateString())}</time></p>
        <p>${escapeHtml(description)}</p>
      </article>`;
  }).join('') + '<div class="news-page-actions"><a class="button button-secondary" href="/games" data-route="/games">Browse all games</a></div>';
}

function renderTrendingPage() {
  const list = document.querySelector('#trending-page-grid');
  if (!list) return;
  const items = rankTrendingGames(games, readPlayCounts(), 6);
  list.innerHTML = items.length ? items.map((game) => `
    <article class="game-card">
      <a class="game-art" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}" aria-label="Play ${escapeHtml(game.title)}">
        ${game.thumbnail ? imageMarkup(game, 'game-image') : `<span class="art-index">${escapeHtml(game.title.slice(0, 1).toUpperCase())}</span>`}
        <span class="art-live"><i></i> POPULAR</span>
        <span class="art-category">${escapeHtml(game.category.toUpperCase())}</span>
      </a>
      <div class="game-card-copy">
        <div><div class="game-heading-line"><h3>${escapeHtml(game.title)}</h3><span class="category-label">${escapeHtml(game.category.toUpperCase())}</span></div><p class="game-description">${escapeHtml(game.description)}</p></div>
        <div class="game-card-foot"><div class="game-tags"></div><a class="play-link" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}"><span aria-hidden="true">▶</span> PLAY</a></div>
      </div>
    </article>`).join('') : '<p class="empty-mini-state" role="status">No games have recorded plays yet. Trending will appear after games are played.</p>';
}

function renderRecentlyAddedPage() {
  const list = document.querySelector('#recently-added-page-grid');
  if (!list) return;
  const items = games.filter((game) => gameAddedDate(game) > 0)
    .sort((first, second) => gameAddedDate(second) - gameAddedDate(first))
    .slice(0, 8);
  list.innerHTML = items.length ? items.map((game) => `
    <article class="game-card">
      <a class="game-art" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}" aria-label="Play ${escapeHtml(game.title)}">
        ${game.thumbnail ? imageMarkup(game, 'game-image') : `<span class="art-index">${escapeHtml(game.title.slice(0, 1).toUpperCase())}</span>`}
        <span class="art-live"><i></i> NEW</span>
        <span class="art-category">${escapeHtml(game.category.toUpperCase())}</span>
      </a>
      <div class="game-card-copy">
        <div><div class="game-heading-line"><h3>${escapeHtml(game.title)}</h3><span class="category-label">${escapeHtml(game.category.toUpperCase())}</span></div><p class="game-description">${escapeHtml(game.description)}</p></div>
        <div class="game-card-foot"><div class="game-tags"><span class="game-tag">Added ${escapeHtml(new Date(gameAddedDate(game)).toLocaleDateString())}</span></div><a class="play-link" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}"><span aria-hidden="true">▶</span> PLAY</a></div>
      </div>
    </article>`).join('') : '<p class="empty-mini-state">No recently added games are available yet.</p>';
}

function renderRecent() {
  const recent = readRecent().map((id) => byId.get(id)).filter(Boolean).slice(0, 3);

  if (!continueList) return;
  if (!recent.length) {
    continueList.innerHTML = `
      <p class="empty-mini-state">No recently played games yet.</p>
      <button class="mini-action" type="button" data-route="/games">Browse Games</button>`;
  } else {
    continueList.innerHTML = recent.map((game) => `
      <a class="mini-game-item" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}">
        <span class="mini-thumb">${game.thumbnail ? imageMarkup(game, 'recent-image') : escapeHtml(game.title.slice(0, 1))}</span>
        <span class="mini-copy"><strong>${escapeHtml(game.title)}</strong><small>${escapeHtml(game.category)}</small></span>
        <span class="mini-go" aria-hidden="true">↗</span>
      </a>`).join('');
  }

}

function favoriteGames() {
  return hubPersistence.getFavorites().map((id) => byId.get(id)).filter(Boolean);
}

function renderFavoritesPage() {
  const grid = document.querySelector('#favorites-grid');
  const empty = document.querySelector('#favorites-empty');
  if (!grid || !empty) return;
  const favorites = favoriteGames();
  grid.innerHTML = favorites.map((game, index) => gameCard(game, index)).join('');
  checkRenderedCollection(favorites, grid, 'Favorites view');
  grid.hidden = !favorites.length;
  empty.hidden = favorites.length > 0;
}

function renderFavoriteDisplays() {
  renderFavoritesPage();
}

function formatPlayTime(durationMs) {
  const totalMinutes = Math.max(0, Math.floor(Number(durationMs) || 0) / 60000);
  if (totalMinutes < 1) return 'Not recorded';
  if (totalMinutes < 60) return `${Math.floor(totalMinutes)} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

async function renderGameDetail(gameId, { focusHeading = false } = {}) {
  const container = document.querySelector('#game-detail-content');
  if (!container) return;
  const token = ++detailRenderToken;
  const game = byId.get(gameId);
  if (!game) {
    container.innerHTML = '<div class="detail-empty"><h1 id="game-detail-heading">Game not found</h1><p>This game is not in the current collection registry.</p><a class="button button-secondary" href="#/games" data-route="/games">Back to Games</a></div>';
    return;
  }

  container.innerHTML = '<p class="empty-mini-state">Loading game details…</p>';
  await hubPersistence.ready;
  const stats = hubPersistence.getStats(game.id);
  const save = await hubPersistence.getSave(game.id);
  if (token !== detailRenderToken) return;
  const adapter = hubPersistence.getAdapter(game.id);
  const validSave = save?.integrity === 'valid';
  const canContinue = validSave && Boolean(adapter?.restore);
  const favorite = hubPersistence.isFavorite(game.id);
  const screenshots = Array.isArray(game.screenshots) ? game.screenshots : [];
  const screenshotMarkup = screenshots.length
    ? screenshots.map((screenshot, index) => `<button class="detail-screenshot" type="button" data-gallery-id="${escapeHtml(game.id)}" data-detail-gallery-index="${index}" aria-label="Open screenshot ${index + 1} for ${escapeHtml(game.title)}"><img src="${escapeHtml(screenshot)}" alt="${escapeHtml(game.title)} screenshot ${index + 1}" loading="lazy"></button>`).join('')
    : '<p class="empty-mini-state">No screenshots have been registered for this game.</p>';
  const saveStatus = validSave
    ? canContinue ? 'Validated save ready to continue' : 'Validated hub save stored; this game has no restore adapter yet'
    : 'No validated hub save available';

  container.innerHTML = `
    <a class="detail-back" href="#/games" data-route="/games">← Back to Games</a>
    <div class="game-detail-hero">
      <div class="game-detail-art">${game.thumbnail ? imageMarkup(game, 'detail-image') : `<span class="art-index" aria-hidden="true">${escapeHtml(game.title.slice(0, 1))}</span>`}</div>
      <div class="game-detail-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span> ${escapeHtml(game.category.toUpperCase())}</p>
        <h1 id="game-detail-heading">${escapeHtml(game.title)}</h1>
        <p class="game-detail-description">${escapeHtml(game.description)}</p>
        <div class="detail-actions">
          <a class="button button-primary" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}"><span aria-hidden="true">▶</span> Play</a>
          ${canContinue ? `<a class="button button-secondary" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}" data-continue-id="${escapeHtml(game.id)}">Continue</a>` : ''}
          <button class="button button-secondary favorite-detail-button${favorite ? ' is-favorite' : ''}" type="button" data-favorite-id="${escapeHtml(game.id)}" aria-pressed="${favorite}">${favorite ? '★ Favorited' : '☆ Favorite'}</button>
        </div>
        <p class="detail-save-status" role="status">${escapeHtml(saveStatus)}</p>
      </div>
    </div>
    <div class="game-detail-grid">
      <section class="detail-module" aria-labelledby="detail-stats-heading"><h2 id="detail-stats-heading">Your statistics</h2><dl class="detail-stats"><div><dt>Plays</dt><dd>${stats.playCount}</dd></div><div><dt>Time played</dt><dd>${escapeHtml(formatPlayTime(stats.totalTimeMs))}</dd></div><div><dt>Progress</dt><dd>${stats.completed ? 'Complete' : stats.progress ? 'In progress' : 'Not recorded'}</dd></div><div><dt>Version</dt><dd>${escapeHtml(game.version || 'Unspecified')}</dd></div></dl></section>
      <section class="detail-module" aria-labelledby="detail-save-heading"><h2 id="detail-save-heading">Save management</h2><p>${adapter ? 'This game is connected to the hub save adapter.' : 'This game has not registered a hub save adapter yet. Its own runtime storage is left untouched.'}</p><div class="detail-save-actions">${validSave ? `<button class="button button-secondary" type="button" data-reset-save-id="${escapeHtml(game.id)}">Reset hub save</button>` : ''}<button class="button button-secondary" type="button" data-export-save-id="${escapeHtml(game.id)}" ${validSave ? '' : 'disabled'}>Export</button><button class="button button-secondary" type="button" data-import-save-id="${escapeHtml(game.id)}">Import</button><input class="detail-save-file" type="file" accept="application/json,.json" data-save-file-id="${escapeHtml(game.id)}" hidden></div><p class="detail-save-status" data-detail-save-status role="status"></p></section>
    </div>
    <section class="detail-module detail-screenshots" aria-labelledby="detail-screenshots-heading"><div class="section-heading"><div><p class="eyebrow"><span class="eyebrow-line"></span> LOOK CLOSER</p><h2 id="detail-screenshots-heading">Screenshots</h2></div></div><div class="detail-screenshot-grid">${screenshotMarkup}</div></section>`;
  if (focusHeading) focusPageHeading();
}

function gamePreviewRow(game, detail) {
  return `<a class="home-game-row" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}" aria-label="Play ${escapeHtml(game.title)}">
    <span class="home-game-thumb">${game.thumbnail ? imageMarkup(game, 'recent-image') : escapeHtml(game.title.slice(0, 1))}</span>
    <span class="home-game-copy"><b>${escapeHtml(game.title)}</b><span>${escapeHtml(detail)}</span></span>
    <span class="home-game-action" aria-hidden="true">PLAY</span>
  </a>`;
}

function gameAddedDate(game) {
  for (const value of [game.addedAt, game.publishedAt, game.createdAt]) {
    const timestamp = Date.parse(value || '');
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function renderTrending() {
  const list = rankTrendingGames(games, readPlayCounts(), 4);

  if (trendingList) {
    trendingList.innerHTML = list.length
      ? list.map((game) => `
          <div class="trending-item">
            <span class="trending-thumb">${game.thumbnail ? imageMarkup(game, 'mini-trending-image') : escapeHtml(game.title.slice(0, 1))}</span>
            <div class="trending-copy">
              <strong>${escapeHtml(game.title)}</strong>
              <small>${escapeHtml(game.category)}</small>
            </div>
            <a class="trending-play" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}">Play</a>
          </div>
        `).join('')
      : '<p class="empty-mini-state">No trending games right now.</p>';
  }
}

function refreshTrendingDisplays() {
  renderTrending();
  renderTrendingPage();
  renderDashboardOverview();
  renderRecent();
  renderFavoriteDisplays();
}

function renderRecentlyAdded() {
  const recentGames = games.filter((game) => gameAddedDate(game) > 0)
    .sort((first, second) => gameAddedDate(second) - gameAddedDate(first))
    .slice(0, 3);
  if (!recentlyAddedList) return;
  recentlyAddedList.innerHTML = recentGames.length ? recentGames.map((game) => `
    <a class="recent-item" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}">
      <span class="recent-thumb">${game.thumbnail ? imageMarkup(game, 'recent-image') : escapeHtml(game.title.slice(0, 1))}</span>
      <span class="recent-copy"><b>${escapeHtml(game.title)}</b><span>${escapeHtml(game.category)} · Added ${escapeHtml(new Date(gameAddedDate(game)).toLocaleDateString())}</span></span>
      <span class="recent-go" aria-hidden="true">↗</span>
    </a>`).join('') : '<p class="empty-mini-state">No recent additions yet.</p>';
}

const roadmapStatusLabels = {
  idea: 'Idea', planned: 'Planned', 'in-progress': 'In Progress', testing: 'Testing', 'on-hold': 'On Hold',
};

function roadmapCard(item) {
  return `<article class="coming-card">
    <div class="coming-card-top"><span class="roadmap-status-badge" data-status="${escapeHtml(item.status)}">${escapeHtml(roadmapStatusLabels[item.status] || item.status)}</span><span class="coming-category">${escapeHtml(item.category)}</span></div>
    <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
    <time datetime="${escapeHtml(item.updatedAt)}">Updated ${escapeHtml(new Date(item.updatedAt).toLocaleDateString())}</time>
  </article>`;
}

function roadmapPreviewRow(item) {
  return `<article class="home-roadmap-row"><span class="roadmap-status-badge" data-status="${escapeHtml(item.status)}">${escapeHtml(roadmapStatusLabels[item.status] || item.status)}</span><b>${escapeHtml(item.title)}</b><time datetime="${escapeHtml(item.updatedAt)}">${escapeHtml(new Date(item.updatedAt).toLocaleDateString())}</time></article>`;
}

function renderRoadmapViews() {
  const activeItems = getUpcomingRoadmapItems();
  const comingItems = activeItems.filter((item) => item.category !== 'content');
  if (comingGrid) comingGrid.innerHTML = comingItems.length ? comingItems.map(roadmapCard).join('') : '<p class="view-empty">No upcoming items right now.</p>';
  renderHomeNews();
  renderHomeComingSoon();
  renderNewsPage();
}

function renderFeatured() {
  if (!slides.length) return;
  const game = slides[slideIndex];
  const featureArt = document.querySelector('#featured-art');
  featureArt.innerHTML = `${game.thumbnail ? imageMarkup(game, 'featured-image') : '<span class="feature-orbit"></span><span class="feature-spark"></span>'}`;
  featureArt.dataset.category = game.category;
  document.querySelector('#featured-title').textContent = game.title;
  document.querySelector('#featured-description').textContent = game.description;
  document.querySelector('#featured-category').textContent = `${game.category.toUpperCase()} / FEATURED GAME`;
  document.querySelector('#feature-count').innerHTML = `${String(slideIndex + 1).padStart(2, '0')} <b>/ ${String(slides.length).padStart(2, '0')}</b>`;
  document.querySelector('#feature-index').textContent = String(slideIndex + 1).padStart(2, '0');
  document.querySelector('#featured-play').href = game.launch;
  document.querySelector('#featured-play').dataset.launchId = game.id;
  document.querySelector('#featured-play').removeAttribute('data-route');
  document.querySelector('#featured-play').setAttribute('aria-label', `Play featured game: ${game.title}`);
  document.querySelector('#feature-progress').innerHTML = slides.map((_, index) => `<i class="${index === slideIndex ? 'is-active' : ''}"></i>`).join('');
}

function showSlide(offset) {
  slideIndex = (slideIndex + offset + slides.length) % slides.length;
  renderFeatured();
}

function closeNavigation(restoreFocus = false) {
  const menuToggle = document.querySelector('#menu-toggle');
  document.querySelector('#primary-nav').classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation menu');
  document.body.classList.remove('nav-open');
  document.querySelector('#nav-backdrop').hidden = true;
  if (restoreFocus) menuToggle.focus({ preventScroll: true });
}

function gameIdFromRoute(pathname) {
  const match = normalizeHubRoute(pathname).match(/^\/games\/([^/]+)$/i);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return ''; }
}

function focusPageHeading() {
  const heading = document.querySelector('[data-page]:not([hidden]) h1, [data-page]:not([hidden]) h2');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

function applyRoute(pathname = currentRoute(), { focusHeading = false } = {}) {
  detailRenderToken += 1;
  if (focusHeading) window.scrollTo({ top: 0, behavior: 'instant' });
  const safePath = normalizeHubRoute(pathname);
  const routeMap = {
    '/': ['/', '/games'],
    '/games': ['/games'],
    '/favorites': ['/favorites'],
    '/trending': ['/trending'],
    '/recently-added': ['/recently-added'],
    '/news': ['/news'],
    '/coming-soon': ['/coming-soon'],
    '/about': ['/about'],
    '/contact': ['/contact'],
    '/inquiries': ['/inquiries'],
    '/admin': ['/admin'],
  };

  const detailGameId = gameIdFromRoute(safePath);
  const activePages = detailGameId ? ['/game-detail'] : routeMap[safePath] || ['/'];
  document.querySelectorAll('[data-page]').forEach((section) => {
    const page = section.dataset.page || '/';
    section.hidden = !activePages.includes(page);
  });

  document.querySelectorAll('.nav-link[data-route]').forEach((link) => {
    const isActive = normalizeHubRoute(link.dataset.route || '/') === (detailGameId ? '/games' : safePath);
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  if (focusHeading && !detailGameId) focusPageHeading();

  document.title = detailGameId && byId.has(detailGameId)
    ? `${byId.get(detailGameId).title} | Octo Industries`
    : getRouteTitle(safePath);

  if (detailGameId) void renderGameDetail(detailGameId, { focusHeading });

  if (safePath !== '/games' && searchInput) {
    searchInput.blur();
  }
}

function bindNavigationControls() {
  const menuToggle = document.querySelector('#menu-toggle');
  const navigation = document.querySelector('#primary-nav');

  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    if (!open) {
      closeNavigation(true);
      return;
    }
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Close navigation menu');
    navigation.classList.add('is-open');
    document.body.classList.add('nav-open');
    document.querySelector('#nav-backdrop').hidden = false;
    navigation.querySelector('.nav-link')?.focus({ preventScroll: true });
  });

  navigation.addEventListener('click', (event) => {
    const routeLink = event.target.closest('[data-route]');
    if (routeLink) {
      closeNavigation();
    }
  });

  document.querySelector('#nav-backdrop').addEventListener('click', () => closeNavigation(true));
  document.querySelectorAll('.nav-search').forEach((button) => button.addEventListener('click', () => {
    const gamesSection = document.querySelector('#games-page');
    gamesSection?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    window.setTimeout(() => searchInput.focus({ preventScroll: true }), reducedMotion ? 0 : 350);
    closeNavigation();
  }));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
      closeNavigation(true);
    }
  });
}

function bindEvents() {
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.gameId) return;
    const game = byId.get(image.dataset.gameId);
    const sourceFile = image.dataset.sourceFile || game?.sourceFile || 'Unknown game source';
    console.error('[Octo Industries] Banner image failed to load', {
      requestedUrl: image.currentSrc || image.src,
      gameTitle: game?.title || 'Unknown game',
      sourceFile,
      reason: 'Image failed to load or decode; browsers do not expose HTTP status or CORS details to page scripts.',
      fallbackAttempted: image.dataset.fallbackAttempted === 'true',
    });
    if (image.dataset.fallbackAttempted !== 'true') {
      image.dataset.fallbackAttempted = 'true';
      image.src = fallbackBannerUrl;
      image.alt = `Artwork unavailable for ${game?.title || 'game'}`;
      return;
    }
    const parent = image.parentElement;
    image.remove();
    if (image.classList.contains('game-image')) {
      const fallback = document.createElement('span');
      fallback.className = 'art-index';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = game ? String(games.indexOf(game) + 1).padStart(2, '0') : '?';
      parent?.prepend(fallback);
    } else if (image.classList.contains('featured-image')) {
      const orbit = document.createElement('span');
      orbit.className = 'feature-orbit';
      const spark = document.createElement('span');
      spark.className = 'feature-spark';
      parent?.append(orbit, spark);
    } else if (parent) {
      parent.textContent = game?.title?.slice(0, 1) || '?';
    }
  }, true);

  const updateSearch = (event) => {
    searchInput.value = event.currentTarget.value;
    if (homeSearchInput) homeSearchInput.value = searchInput.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGames, reducedMotion ? 0 : 70);
  };
  searchInput.addEventListener('input', updateSearch);
  homeSearchInput?.addEventListener('input', updateSearch);
  document.querySelector('#home-search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchInput.value = homeSearchInput.value;
    renderGames();
    pushRoute('/games');
    applyRoute('/games');
    searchInput.focus({ preventScroll: true });
  });
  document.querySelector('#game-sort').addEventListener('change', () => {
    renderGames();
  });

  filterCategoryOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    const panel = document.querySelector('#filter-panel');
    activeCategory = button.dataset.category;
    categories();
    renderGames();
    if (panel) panel.hidden = true;
    const filterButton = document.querySelector('#filter-games');
    filterButton?.setAttribute('aria-expanded', 'false');
  });

  document.querySelector('#filter-games')?.addEventListener('click', () => {
    const panel = document.querySelector('#filter-panel');
    const filterButton = document.querySelector('#filter-games');
    if (!panel || !filterButton) return;
    const expanded = filterButton.getAttribute('aria-expanded') === 'true';
    panel.hidden = expanded;
    filterButton.setAttribute('aria-expanded', String(!expanded));
    if (!expanded) {
      panel.focus?.();
    } else {
      filterButton.focus({ preventScroll: true });
    }
  });

  document.querySelectorAll('.mini-category').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      categories();
      renderGames();
      document.querySelector('#games-page')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      searchInput.focus({ preventScroll: true });
    });
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGames, reducedMotion ? 0 : 70);
  });

  document.querySelector('#search-clear').addEventListener('click', () => {
    searchInput.value = '';
    if (homeSearchInput) homeSearchInput.value = '';
    searchInput.focus();
    renderGames();
  });

  document.querySelector('#filter-clear-all')?.addEventListener('click', () => {
    activeCategory = 'All';
    categories();
    renderGames();
    const panel = document.querySelector('#filter-panel');
    const filterButton = document.querySelector('#filter-games');
    if (panel) panel.hidden = true;
    if (filterButton) filterButton.setAttribute('aria-expanded', 'false');
    filterButton?.focus({ preventScroll: true });
  });

  document.querySelector('#clear-filters').addEventListener('click', () => {
    activeCategory = 'All';
    searchInput.value = '';
    if (homeSearchInput) homeSearchInput.value = '';
    categories();
    renderGames();
    searchInput.focus();
  });

  document.querySelector('#feature-previous').addEventListener('click', () => showSlide(-1));
  document.querySelector('#feature-next').addEventListener('click', () => showSlide(1));

  document.querySelector('#gallery-close').addEventListener('click', () => {
    document.querySelector('#screenshot-gallery').close();
  });
  document.querySelector('#gallery-image').addEventListener('error', () => {
    const image = document.querySelector('#gallery-image');
    if (!activeGallery) return;
    if (image.dataset.fallbackAttempted !== 'true') {
      image.dataset.fallbackAttempted = 'true';
      image.src = fallbackBannerUrl;
      image.alt = `Screenshot unavailable for ${activeGallery.title}`;
    } else {
      image.removeAttribute('src');
      image.alt = `Screenshot unavailable for ${activeGallery.title}`;
    }
  });
  document.querySelector('#screenshot-gallery').addEventListener('close', () => {
    if (galleryTrigger instanceof HTMLElement) galleryTrigger.focus({ preventScroll: true });
  });
  document.querySelector('#gallery-previous').addEventListener('click', () => {
    if (!activeGallery) return;
    galleryIndex = (galleryIndex - 1 + activeGallery.screenshots.length) % activeGallery.screenshots.length;
    renderGalleryImage();
  });
  document.querySelector('#gallery-next').addEventListener('click', () => {
    if (!activeGallery) return;
    galleryIndex = (galleryIndex + 1) % activeGallery.screenshots.length;
    renderGalleryImage();
  });
  document.querySelector('#gallery-thumbnails').addEventListener('click', (event) => {
    const thumbnail = event.target.closest('[data-gallery-index]');
    if (!thumbnail || !activeGallery) return;
    galleryIndex = Number(thumbnail.dataset.galleryIndex);
    renderGalleryImage();
  });
  document.querySelector('#screenshot-gallery').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });

  let touchStart;
  document.querySelector('#featured-frame').addEventListener('touchstart', (event) => {
    touchStart = event.changedTouches[0].clientX;
  }, { passive: true });
  document.querySelector('#featured-frame').addEventListener('touchend', (event) => {
    if (touchStart === undefined) return;
    const difference = event.changedTouches[0].clientX - touchStart;
    if (Math.abs(difference) > 54) showSlide(difference < 0 ? 1 : -1);
    touchStart = undefined;
  }, { passive: true });

  document.addEventListener('click', (event) => {
    const favorite = event.target.closest('[data-favorite-id]');
    if (favorite && byId.has(favorite.dataset.favoriteId)) {
      event.preventDefault();
      event.stopPropagation();
      hubPersistence.toggleFavorite(favorite.dataset.favoriteId);
      renderGames();
      renderFavoriteDisplays();
      if (gameIdFromRoute(currentRoute()) === favorite.dataset.favoriteId) void renderGameDetail(favorite.dataset.favoriteId);
      return;
    }

    const resetSave = event.target.closest('[data-reset-save-id]');
    if (resetSave) {
      event.preventDefault();
      const gameId = resetSave.dataset.resetSaveId;
      const status = document.querySelector('[data-detail-save-status]');
      resetSave.disabled = true;
      if (status) status.textContent = 'Resetting hub save…';
      void hubPersistence.resetGame(gameId).then(() => {
        if (status) status.textContent = 'Hub save reset. The game runtime was not modified.';
        void renderGameDetail(gameId);
      }).catch((error) => {
        if (status) status.textContent = error.message;
        resetSave.disabled = false;
      });
      return;
    }

    const exportSave = event.target.closest('[data-export-save-id]');
    if (exportSave) {
      event.preventDefault();
      const gameId = exportSave.dataset.exportSaveId;
      const status = document.querySelector('[data-detail-save-status]');
      void hubPersistence.exportGame(gameId).then((payload) => {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `octo-${gameId}-save.json`;
        link.click();
        URL.revokeObjectURL(url);
        if (status) status.textContent = 'Save export created.';
      }).catch((error) => {
        if (status) status.textContent = error.message;
      });
      return;
    }

    const importSave = event.target.closest('[data-import-save-id]');
    if (importSave) {
      event.preventDefault();
      [...document.querySelectorAll('[data-save-file-id]')]
        .find((input) => input.dataset.saveFileId === importSave.dataset.importSaveId)?.click();
      return;
    }

    const gallery = event.target.closest('[data-gallery-id]');
    if (gallery && byId.has(gallery.dataset.galleryId)) {
      openGallery(byId.get(gallery.dataset.galleryId));
      if (gallery.dataset.detailGalleryIndex !== undefined) {
        galleryIndex = Number(gallery.dataset.detailGalleryIndex);
        renderGalleryImage();
      }
      return;
    }
    const launch = event.target.closest('[data-launch-id]');
    if (launch && byId.has(launch.dataset.launchId)) markPlayed(byId.get(launch.dataset.launchId));

    const routeLink = event.target.closest('[data-route]');
    if (routeLink) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const nextPath = normalizeHubRoute(routeLink.dataset.route || '/');
      if (nextPath !== '/admin') {
        event.preventDefault();
        pushRoute(nextPath);
        applyRoute(nextPath, { focusHeading: true });
      }
      return;
    }

    const viewTarget = event.target.closest('[data-view]');
    if (viewTarget) {
      const targetId = viewTarget.dataset.view;
      const viewSection = document.querySelector(`#${targetId}`);
      if (viewSection) {
        viewSection.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }

  });

  document.addEventListener('change', (event) => {
    const input = event.target.closest('[data-save-file-id]');
    if (!input || !input.files?.length) return;
    const gameId = input.dataset.saveFileId;
    const status = document.querySelector('[data-detail-save-status]');
    const [file] = input.files;
    input.value = '';
    if (status) status.textContent = 'Importing save…';
    void file.text().then((text) => hubPersistence.importGame(JSON.parse(text))).then(() => {
      if (status) status.textContent = 'Save imported and integrity checked.';
      void renderGameDetail(gameId);
    }).catch((error) => {
      if (status) status.textContent = error.message;
    });
  });

  document.addEventListener('keydown', (event) => {
    if (document.querySelector('#screenshot-gallery').open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      galleryIndex = (galleryIndex + (event.key === 'ArrowRight' ? 1 : -1) + activeGallery.screenshots.length) % activeGallery.screenshots.length;
      renderGalleryImage();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      document.querySelector('#games-page')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      searchInput.focus({ preventScroll: true });
    }
    if (event.key === 'Escape') {
      if (document.activeElement === searchInput && searchInput.value) {
        searchInput.value = '';
        if (homeSearchInput) homeSearchInput.value = '';
        renderGames();
      }
    }
  });
}

function browserDeviceInfo() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const platformAndAgent = `${platform} ${ua}`;
  const ipad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const deviceType = navigator.userAgentData?.mobile
    ? 'Mobile'
    : ipad || /Tablet/i.test(ua)
      ? 'Tablet'
      : 'Desktop';
  const operatingSystem = /Windows/i.test(platformAndAgent) ? 'Windows'
    : /Android/i.test(platformAndAgent) ? 'Android'
      : /iPhone|iPad|iPod|iOS/i.test(platformAndAgent) || ipad ? 'iOS'
        : /Mac OS|Macintosh/i.test(platformAndAgent) ? 'macOS'
          : /Linux/i.test(platformAndAgent) ? 'Linux' : 'Unknown';
  const browserVersion = ua.match(/(?:Edg(?:e|A|iOS)?|OPR|OPiOS|SamsungBrowser|FxiOS|Firefox|CriOS|Chrome|Version)\/([\d.]+)/);
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|OPiOS\//.test(ua) ? 'Opera'
      : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
            : /Version\/.*Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const osVersion = operatingSystem === 'Windows' ? ua.match(/Windows NT ([\d.]+)/)?.[1]
    : operatingSystem === 'Android' ? ua.match(/Android ([\d.]+)/)?.[1]
      : operatingSystem === 'iOS' ? ua.match(/(?:CPU )?OS ([\d_]+)/)?.[1]?.replaceAll('_', '.')
        : operatingSystem === 'macOS' ? ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replaceAll('_', '.') : '';
  const deviceName = navigator.userAgentData?.model || (ipad ? 'iPad'
    : /iPhone/i.test(ua) ? 'iPhone'
      : /iPod/i.test(ua) ? 'iPod'
        : operatingSystem === 'Android' ? 'Android device'
          : operatingSystem === 'macOS' ? 'Mac'
            : operatingSystem === 'Windows' ? 'Windows PC'
              : operatingSystem === 'Linux' ? 'Linux device' : 'Unknown device');
  return {
    deviceType,
    deviceName,
    operatingSystem,
    operatingSystemVersion: osVersion || '',
    browser,
    browserVersion: browserVersion?.[1] || '',
    screenResolution: Number.isFinite(screen.width) && Number.isFinite(screen.height)
      ? `${screen.width} × ${screen.height}` : '',
    language: navigator.languages?.join(', ').slice(0, 100) || navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    octoVersion: document.querySelector('meta[name="octo-version"]')?.content || window.OCTO_BUILD_VERSION || '',
  };
}

const ticketStatuses = {
  new: 'New', under_review: 'Under Review', awaiting_user: 'Awaiting User', planned: 'Planned', in_progress: 'In Progress',
  awaiting_user_reply: 'Awaiting User Reply', implemented: 'Implemented', resolved: 'Resolved',
  rejected: 'Rejected', closed: 'Closed',
};

function savedTicketCredentials() {
  return hubPersistence.getTickets().filter((ticket) => /^[a-f\d]{32}$/.test(ticket.ticketId || '')
    && /^[a-f\d]{64}$/.test(ticket.accessToken || '') && Number.isInteger(ticket.ticketNumber));
}

function saveTicketCredentials(ticket) {
  try {
    hubPersistence.saveTicket(ticket);
    return true;
  } catch {
    return false;
  }
}

function formatTicketDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Bahrain', timeZoneName: 'short',
  }).format(date);
}

async function loadMyTickets() {
  const container = document.querySelector('#my-tickets-list');
  const credentials = savedTicketCredentials();
  if (!credentials.length) {
    container.innerHTML = '<p class="ticket-empty">No saved tickets yet.</p>';
    return;
  }
  container.innerHTML = '<p class="ticket-empty">Loading tickets…</p>';
  const results = await Promise.all(credentials.map(async (credential) => {
    try {
      const response = await fetch(window.OCTO_CONFIG.apiUrl(`/api/tickets/${encodeURIComponent(credential.ticketId)}`), {
        headers: { 'X-Ticket-Access-Token': credential.accessToken, Accept: 'application/json' },
        cache: 'no-store',
      });
      const ticket = await response.json().catch(() => null);
      if (!response.ok) throw new Error(ticket?.error || 'Ticket is unavailable.');
      return { credential, ticket };
    } catch (error) {
      return { credential, error };
    }
  }));
  container.innerHTML = results.map(({ credential, ticket, error }) => {
    if (error) return `<article class="ticket-card"><h3>Ticket #${credential.ticketNumber}</h3><p class="ticket-empty">${escapeHtml(error.message)}</p></article>`;
    const conversation = ticket.conversation.map((entry) => `<li class="ticket-message" data-author="${entry.author === 'admin' ? 'admin' : 'user'}">
      <div><strong>${entry.author === 'admin' ? 'Octo Industries' : 'You'}</strong><time>${escapeHtml(formatTicketDate(entry.createdAt))}</time></div>
      <p>${escapeHtml(entry.message)}</p>
    </li>`).join('');
    const status = ticketStatuses[ticket.status] || 'Under Review';
    const canReply = !['closed', 'rejected', 'implemented'].includes(ticket.status);
    return `<article class="ticket-card">
      <header class="ticket-card-header"><div><p class="eyebrow">${escapeHtml(ticket.type.toUpperCase())}</p><h3>Ticket #${credential.ticketNumber}</h3></div>
        <span class="ticket-status" data-status="${escapeHtml(ticket.status)}">${escapeHtml(status)}</span></header>
      <p class="ticket-updated">Updated ${escapeHtml(formatTicketDate(ticket.updatedAt))}</p>
      <ol class="ticket-conversation">${conversation}</ol>
      ${canReply ? `<form class="ticket-reply-form" data-ticket-reply="${escapeHtml(credential.ticketId)}">
        <label for="ticket-reply-${escapeHtml(credential.ticketId)}">Reply</label>
        <textarea id="ticket-reply-${escapeHtml(credential.ticketId)}" name="message" maxlength="5000" rows="3" required></textarea>
        <button class="button button-secondary" type="submit">Send Reply</button>
        <p class="ticket-reply-status" data-ticket-reply-status role="status" aria-live="polite"></p>
      </form>` : '<p class="ticket-closed-note">This ticket is closed to replies.</p>'}
    </article>`;
  }).join('');
}

function bindFeedbackForm() {
  const dialog = document.querySelector('#feedback-dialog');
  const form = document.querySelector('#feedback-form');
  const type = document.querySelector('#feedback-type');
  const game = document.querySelector('#feedback-game');
  const gameLabel = document.querySelector('#feedback-game-label');
  const status = document.querySelector('#feedback-status');
  for (const entry of games) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.title;
    game.append(option);
  }
  const open = () => {
    closeNavigation();
    dialog.showModal();
  };
  document.querySelectorAll('#feedback-open, [data-feedback-open], #inquiries-open').forEach((button) => button.addEventListener('click', () => {
    const route = normalizeHubRoute('/inquiries');
    pushRoute(route);
    applyRoute(route);
    open();
  }));
  document.querySelector('#feedback-close').addEventListener('click', () => dialog.close());
  document.querySelector('#feedback-cancel').addEventListener('click', () => dialog.close());
  document.querySelector('#my-tickets-refresh').addEventListener('click', () => loadMyTickets());
  document.querySelector('#my-tickets-list').addEventListener('submit', async (event) => {
    const replyForm = event.target.closest('[data-ticket-reply]');
    if (!replyForm) return;
    event.preventDefault();
    const ticketId = replyForm.dataset.ticketReply;
    const credential = savedTicketCredentials().find((entry) => entry.ticketId === ticketId);
    const message = replyForm.elements.message.value;
    const submit = replyForm.querySelector('button[type="submit"]');
    const responseStatus = replyForm.querySelector('[data-ticket-reply-status]');
    if (!credential) {
      responseStatus.textContent = 'Ticket access is unavailable in this browser.';
      return;
    }
    submit.disabled = true;
    responseStatus.textContent = 'Sending reply…';
    try {
      const response = await fetch(window.OCTO_CONFIG.apiUrl(`/api/tickets/${encodeURIComponent(ticketId)}/messages`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ticket-Access-Token': credential.accessToken,
        },
        body: JSON.stringify({ message }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Could not send this reply.');
      await loadMyTickets();
    } catch (error) {
      responseStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  void loadMyTickets();
  type.addEventListener('change', () => {
    const isIssue = type.value === 'issue';
    game.hidden = !isIssue;
    gameLabel.hidden = !isIssue;
    if (!isIssue) game.value = '';
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.querySelector('#feedback-submit');
    button.disabled = true;
    status.hidden = false;
    status.textContent = 'Sending your feedback…';
    try {
      const response = await fetch(window.OCTO_CONFIG.apiUrl('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          type: type.value,
          gameId: game.value,
          message: document.querySelector('#feedback-message').value,
          deviceInfo: browserDeviceInfo(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Could not send feedback. Please try again.');
      if (!result?.ticketId || !result?.accessToken || !Number.isInteger(result.ticketNumber)) {
        form.reset();
        game.hidden = true;
        gameLabel.hidden = true;
        status.textContent = 'Thanks — your feedback was sent. Ticket tracking is not available right now.';
        return;
      }
      const credential = {
        ticketId: result.ticketId,
        accessToken: result.accessToken,
        ticketNumber: result.ticketNumber,
      };
      const saved = saveTicketCredentials(credential);
      form.reset();
      game.hidden = true;
      gameLabel.hidden = true;
      status.textContent = saved
        ? `Thanks — ticket #${result.ticketNumber} was created and saved in My Tickets.`
        : `Ticket #${result.ticketNumber} was created. Save this private access key to keep access: ${result.accessToken}`;
      await loadMyTickets();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function drawAmbient() {
  const canvas = document.querySelector('#ambient');
  const context = canvas?.getContext('2d');
  if (!context || reducedMotion) return;
  let width = 0;
  let height = 0;
  let previousFrame = 0;
  let pointer = { x: -1000, y: -1000 };
  const particles = [];

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const amount = Math.min(34, Math.max(16, Math.round(width * height / 41000)));
    particles.length = 0;
    for (let index = 0; index < amount; index += 1) {
      particles.push({ x: Math.random() * width, y: Math.random() * height, dx: (Math.random() - .5) * .19, dy: -.08 - Math.random() * .14, radius: 0.7 + Math.random() * 1.4 });
    }
  }

  function frame(time) {
    if (document.hidden) {
      requestAnimationFrame(frame);
      return;
    }
    if (time - previousFrame < 32) {
      requestAnimationFrame(frame);
      return;
    }
    previousFrame = time;
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      const dx = pointer.x - particle.x;
      const dy = pointer.y - particle.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < 125) {
        particle.x -= dx / distance * .12;
        particle.y -= dy / distance * .12;
      }
      particle.x += particle.dx;
      particle.y += particle.dy;
      if (particle.y < -6) { particle.y = height + 6; particle.x = Math.random() * width; }
      if (particle.x < -6) particle.x = width + 6;
      if (particle.x > width + 6) particle.x = -6;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = 'rgba(93, 207, 226, .40)';
      context.fill();
    }
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  requestAnimationFrame(frame);
}

function start() {
  const bootScreen = document.querySelector('#boot-screen');
  bindFeedbackForm();
  requestAnimationFrame(() => bootScreen?.classList.add('is-ready'));
  window.setTimeout(() => bootScreen?.remove(), 550);

  renderDashboardOverview();
  renderGameCollection();

  applyRoute(currentRoute());
  bindNavigationControls();
  window.addEventListener('popstate', () => applyRoute(currentRoute()));
  window.addEventListener('hashchange', () => applyRoute(currentRoute()));
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === 'octo-industries.play-counts' || event.key === 'octo-industries.recent') {
      refreshTrendingDisplays();
    }
  });
  window.addEventListener('octo:persistence-change', () => refreshTrendingDisplays());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshTrendingDisplays();
  });
  window.addEventListener('pageshow', refreshTrendingDisplays);
  void hubPersistence.ready.then(() => {
    renderRecent();
    refreshTrendingDisplays();
  });
  refreshTrendingDisplays();
}

async function loadPublicCatalog() {
  const response = await fetch(window.OCTO_CONFIG.apiUrl('/api/catalog'), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  const catalog = await response.json();
  if (!Array.isArray(catalog)) throw new Error('The server returned an invalid game catalog.');
  if (!catalog.length) throw new Error('The server returned an empty game catalog.');
  const publicIds = new Set(catalog.map((game) => game.id));
  const generatedOnly = generatedCatalog.filter((game) => !publicIds.has(game.id)).map((game) => game.id);
  const mergedCatalog = mergeGameCatalog(generatedCatalog, catalog);
  console.info('[Octo Industries] Public catalog loaded.', {
    publicGames: catalog.length,
    generatedGames: generatedCatalog.length,
    totalGames: mergedCatalog.length,
    gamesMissingFromPublicCatalog: generatedOnly,
  });
  games = mergedCatalog.map(normalizeGame);
  byId = new Map(games.map((game) => [game.id, game]));
  featuredGames = games.filter((game) => game.featured);
  slides = featuredGames.length ? featuredGames : games;
  slideIndex = 0;
  renderDashboardOverview();
  renderGameCollection();
  updateFeedbackGameOptions();
}

async function loadRoadmap() {
  try {
    const response = await fetch(window.OCTO_CONFIG.apiUrl('/api/roadmap'), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Roadmap request failed (${response.status}).`);
    const roadmap = await response.json();
    if (!Array.isArray(roadmap)) throw new Error('The server returned an invalid roadmap.');
    roadmapItems = roadmap;
  } catch (error) {
    console.error('Unable to load the public roadmap.', error);
    roadmapItems = [];
  }
  renderRoadmapViews();
}

void loadRoadmap();
start();
loadPublicCatalog().catch((error) => console.error('[Octo Industries] Unable to load the public game catalog; keeping the generated catalog.', error));
