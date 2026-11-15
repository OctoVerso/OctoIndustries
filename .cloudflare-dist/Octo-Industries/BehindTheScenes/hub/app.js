import { getRouteTitle, normalizeHubRoute } from './route-utils.js';
import { gameCategories } from './catalog-utils.mjs';

let games = Array.isArray(window.OCTO_GAMES) ? [...window.OCTO_GAMES] : [];
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
const fallbackBannerUrl = '/Octo-Industries/branding/fallback-banner.svg?v=1';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function readRecent() {
  try {
    const stored = JSON.parse(localStorage.getItem('octo-industries.recent') || '[]');
    return Array.isArray(stored) ? stored.filter((id) => byId.has(id)) : [];
  } catch {
    return [];
  }
}

function readPlayCounts() {
  try {
    const stored = JSON.parse(localStorage.getItem('octo-industries.play-counts') || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function markPlayed(game) {
  try {
    const recent = [game.id, ...readRecent().filter((id) => id !== game.id)].slice(0, 3);
    localStorage.setItem('octo-industries.recent', JSON.stringify(recent));
    const playCounts = readPlayCounts();
    playCounts[game.id] = (Number(playCounts[game.id]) || 0) + 1;
    localStorage.setItem('octo-industries.play-counts', JSON.stringify(playCounts));
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
  return `
    <article class="game-card" style="animation-delay:${Math.min(index * 45, 225)}ms" data-game-id="${escapeHtml(game.id)}">
      <a class="game-art" data-category="${escapeHtml(game.category)}" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}" aria-label="Play ${escapeHtml(game.title)}">
        ${hasThumbnail ? imageMarkup(game, 'game-image') : `<span class="art-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>`}
        ${localPlayCount !== null ? `<span class="trend-indicator">${localPlayCount} local plays</span>` : ''}
        <span class="art-live"><i></i> READY TO PLAY</span><span class="art-category">${escapeHtml(game.category.toUpperCase())}</span>
      </a>
      <div class="game-card-copy">
        <div><div class="game-heading-line"><h3>${escapeHtml(game.title)}</h3><span class="category-label">${escapeHtml(game.category.toUpperCase())}</span></div><p class="game-description">${escapeHtml(game.description)}</p></div>
        <div class="game-card-foot"><div class="game-tags">${tags.map((tag) => `<span class="game-tag">#${escapeHtml(tag.toLowerCase())}</span>`).join('')}</div><div class="game-card-actions"><a class="play-link" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}"><span aria-hidden="true">▶</span> PLAY</a></div></div>
      </div>
    </article>`;
}

function renderGalleryImage() {
  if (!activeGallery) return;
  const image = document.querySelector('#gallery-image');
  const screenshot = activeGallery.screenshots[galleryIndex];
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
  const featuredEntries = currentGames.filter((game) => game.featured).slice(0, 4);
  const trendingEntries = featuredEntries.length ? featuredEntries : currentGames.slice(0, 4);
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
  const items = games.slice(0, 6);
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
    </article>`).join('') : '<p class="empty-mini-state">No trending data is available right now.</p>';
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
      <button class="mini-action" type="button" data-view="games">Browse Games</button>`;
  } else {
    continueList.innerHTML = recent.map((game) => `
      <a class="mini-game-item" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}">
        <span class="mini-thumb">${game.thumbnail ? imageMarkup(game, 'recent-image') : escapeHtml(game.title.slice(0, 1))}</span>
        <span class="mini-copy"><strong>${escapeHtml(game.title)}</strong><small>${escapeHtml(game.category)}</small></span>
        <span class="mini-go" aria-hidden="true">↗</span>
      </a>`).join('');
  }

}

function renderHomeOverview() {
  const categoryCount = new Set(games.map((game) => game.category).filter(Boolean)).size;
  const playCounts = readPlayCounts();
  const trendingCount = games.filter((game) => Number(playCounts[game.id]) > 0).length;
  const recentCount = readRecent().length;
  document.querySelector('#home-total-games').textContent = games.length;
  document.querySelector('#home-ready-count').textContent = games.length;
  document.querySelector('#home-category-count').textContent = categoryCount;
  document.querySelector('#home-trending-count').textContent = trendingCount;
  document.querySelector('#home-continue-count').textContent = recentCount;
  document.querySelector('#home-browse-count').textContent = games.length;
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
  const picks = games.filter((game) => game.featured).slice(0, 4);
  const list = picks.length ? picks : games.slice(0, 4);

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

function setDrawerOpen(open) {
  const menuToggle = document.querySelector('#menu-toggle');
  document.querySelector('#primary-nav').classList.toggle('is-open', open);
  document.body.classList.toggle('nav-open', open);
  document.querySelector('#nav-backdrop').hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close Hub menu' : 'Open Hub menu');
}

const hubViewMetadata = {
  home: { title: 'Octo Industries | Game Hub', description: 'Continue playing, browse featured games, or find your next game in the Octo Industries Hub.' },
  games: { title: 'Games | Octo Industries', description: 'Search and filter the Octo Industries game collection by category, title, and tag.' },
  trending: { title: 'Trending Games | Octo Industries', description: 'Browse games ranked by plays recorded on this device in the Octo Industries Hub.' },
  'recently-added': { title: 'Recently Added | Octo Industries', description: 'Find newly added games in the Octo Industries game collection.' },
  news: { title: 'News | Octo Industries', description: 'Read the latest Octo Industries game hub news and announcements.' },
  'coming-soon': { title: 'Coming Soon | Octo Industries', description: 'See upcoming games and updates planned for Octo Industries.' },
  about: { title: 'About | Octo Industries', description: 'Learn about Octo Industries, an independent gaming platform created by Mr. Octo.' },
  contact: { title: 'Contact | Octo Industries', description: 'Contact Mr. Octo about Octo Industries, partnerships, suggestions, or issues.' },
};

function updateHubMetadata(view) {
  const metadata = hubViewMetadata[view];
  const viewUrl = new URL(window.location.href);
  viewUrl.searchParams.set('view', view);
  const canonicalUrl = new URL(window.location.pathname, window.location.origin);
  if (view !== 'home') canonicalUrl.searchParams.set('view', view);
  document.title = metadata.title;
  document.querySelector('meta[name="description"]').content = metadata.description;
  document.querySelector('meta[property="og:title"]').content = metadata.title;
  document.querySelector('meta[property="og:description"]').content = metadata.description;
  document.querySelector('meta[property="og:url"]').content = canonicalUrl.href;
  document.querySelector('link[rel="canonical"]').href = canonicalUrl.href;
}

function setHubView(name, { focusSearch = false, focusHeading = false, focusTarget = '', pushState = false } = {}) {
  const panels = [...document.querySelectorAll('[data-hub-panel]')];
  const view = panels.some((panel) => panel.dataset.hubPanel === name) ? name : 'games';
  const currentView = new URLSearchParams(window.location.search).get('view') || 'home';
  if (pushState && currentView !== view) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('view', view);
    window.history.pushState({ view }, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }
  panels.forEach((panel) => { panel.hidden = panel.dataset.hubPanel !== view; });
  document.querySelectorAll('#primary-nav [data-hub-view]').forEach((button) => {
    const active = button.dataset.hubView === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  updateHubMetadata(view);
  setDrawerOpen(false);
  requestAnimationFrame(() => {
    if (focusSearch) searchInput.focus({ preventScroll: true });
    else if (focusTarget) document.querySelector(focusTarget)?.focus({ preventScroll: true });
    else if (focusHeading) panels.find((panel) => panel.dataset.hubPanel === view)?.querySelector('h1')?.focus({ preventScroll: true });
  });
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

function applyRoute(pathname = window.location.pathname) {
  const safePath = normalizeHubRoute(pathname);
  const routeMap = {
    '/': ['/', '/games'],
    '/games': ['/games'],
    '/trending': ['/trending'],
    '/recently-added': ['/recently-added'],
    '/news': ['/news'],
    '/coming-soon': ['/coming-soon'],
    '/about': ['/about'],
    '/contact': ['/contact'],
    '/inquiries': ['/inquiries'],
    '/admin': ['/admin'],
  };

  const activePages = routeMap[safePath] || ['/'];
  document.querySelectorAll('[data-page]').forEach((section) => {
    const page = section.dataset.page || '/';
    section.hidden = !activePages.includes(page);
  });

  document.querySelectorAll('.nav-link[data-route]').forEach((link) => {
    const isActive = normalizeHubRoute(link.dataset.route || '/') === safePath;
    link.classList.toggle('is-active', isActive);
  });

  const heading = document.querySelector('#home-page h1, #games-page h2, #trending-page h1, #recently-added-page h1, #news-page h1, #coming-soon-page h2, #about-page h1, #contact-page h1, #inquiries-page h1');
  if (heading) heading.tabIndex = -1;
  if (heading) {
    heading.focus({ preventScroll: true });
  }

  document.title = getRouteTitle(safePath);

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
      const route = normalizeHubRoute(routeLink.getAttribute('href') || routeLink.dataset.route || '/');
      if (route !== '/admin') {
        event.preventDefault();
        window.history.pushState({}, '', route);
        applyRoute(route);
      }
      closeNavigation(true);
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
    currentPage = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGames, reducedMotion ? 0 : 70);
  };
  searchInput.addEventListener('input', updateSearch);
  homeSearchInput?.addEventListener('input', updateSearch);
  document.querySelector('#home-search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchInput.value = homeSearchInput.value;
    currentPage = 1;
    renderGames();
    window.history.pushState({}, '', '/games');
    applyRoute('/games');
    searchInput.focus({ preventScroll: true });
  });
  document.querySelector('#game-sort').addEventListener('change', () => {
    currentPage = 1;
    renderGames();
  });

  filterCategoryOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    const panel = document.querySelector('#filter-panel');
    activeCategory = button.dataset.category;
    currentPage = 1;
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
    currentPage = 1;
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
    currentPage = 1;
    categories();
    renderGames();
    searchInput.focus();
  });

  document.querySelectorAll('[data-roadmap-category]').forEach((link) => link.addEventListener('click', () => {
    activeRoadmapCategory = link.dataset.roadmapCategory;
    renderComingSoon();
  }));
  document.querySelector('[data-hub-action="search"]')?.addEventListener('click', () => {
    window.history.pushState({}, '', '/games');
    applyRoute('/games');
    searchInput.focus({ preventScroll: true });
  });

  document.querySelector('#feature-previous').addEventListener('click', () => showSlide(-1));
  document.querySelector('#feature-next').addEventListener('click', () => showSlide(1));

  document.querySelector('#gallery-close').addEventListener('click', () => {
    document.querySelector('#screenshot-gallery').close();
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
    const gallery = event.target.closest('[data-gallery-id]');
    if (gallery && byId.has(gallery.dataset.galleryId)) {
      openGallery(byId.get(gallery.dataset.galleryId));
      return;
    }
    const launch = event.target.closest('[data-launch-id]');
    if (launch && byId.has(launch.dataset.launchId)) markPlayed(byId.get(launch.dataset.launchId));

    const routeLink = event.target.closest('[data-route]');
    if (routeLink) {
      const nextPath = normalizeHubRoute(routeLink.getAttribute('href') || routeLink.dataset.route || '/');
      if (nextPath !== '/admin') {
        event.preventDefault();
        window.history.pushState({}, '', nextPath);
        applyRoute(nextPath);
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
  window.addEventListener('popstate', () => {
    setHubView(new URLSearchParams(window.location.search).get('view') || 'home');
  });

  const navLinks = [...document.querySelectorAll('.primary-nav .nav-link[data-route]')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const route = entry.target.dataset.page || '/';
        navLinks.forEach((link) => link.classList.toggle('is-active', normalizeHubRoute(link.dataset.route || '/') === route));
      }
    }, { rootMargin: '-25% 0px -65% 0px' });
    document.querySelectorAll('[data-page]').forEach((section) => {
      if (!section.hidden) observer.observe(section);
    });
  }
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
  new: 'New', under_review: 'Under Review', planned: 'Planned', in_progress: 'In Progress',
  awaiting_user_reply: 'Awaiting User Reply', implemented: 'Implemented', resolved: 'Resolved',
  rejected: 'Rejected', closed: 'Closed',
};

function savedTicketCredentials() {
  try {
    const stored = JSON.parse(localStorage.getItem('octo-industries.tickets') || '[]');
    return Array.isArray(stored) ? stored.filter((ticket) => /^[a-f\d]{32}$/.test(ticket.ticketId || '')
      && /^[a-f\d]{64}$/.test(ticket.accessToken || '') && Number.isInteger(ticket.ticketNumber)) : [];
  } catch {
    return [];
  }
}

function saveTicketCredentials(ticket) {
  try {
    const existing = savedTicketCredentials().filter((entry) => entry.ticketId !== ticket.ticketId);
    localStorage.setItem('octo-industries.tickets', JSON.stringify([ticket, ...existing].slice(0, 50)));
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
      const response = await fetch(`/api/tickets/${encodeURIComponent(credential.ticketId)}`, {
        headers: { 'X-Ticket-Access-Token': credential.accessToken, Accept: 'application/json' },
        credentials: 'same-origin', cache: 'no-store',
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
    window.history.pushState({}, '', route);
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
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ticket-Access-Token': credential.accessToken,
        },
        credentials: 'same-origin',
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
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: type.value,
          gameId: game.value,
          message: document.querySelector('#feedback-message').value,
          deviceInfo: browserDeviceInfo(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Could not send feedback. Please try again.');
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

  if (!games.length) {
    grid.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector('h3').textContent = 'The collection is offline.';
    emptyState.querySelector('p').textContent = 'Run npm --prefix Octo-Industries/BehindTheScenes run sync to discover games and build the local catalog.';
    resultSummary.textContent = 'No game catalog found';
  } else {
    document.querySelector('#header-count').textContent = String(games.length).padStart(2, '0');
    document.querySelector('#library-count').innerHTML = `${String(games.length).padStart(2, '0')} GAMES IN THE COLLECTION <span>↘</span>`;
    categories();
    renderFeatured();
    renderGames();
    renderRecent();
    renderTrending();
    renderRecentlyAdded();
    renderHomeRoutes();
    bindEvents();
    drawAmbient();
  }

  applyRoute(window.location.pathname);
  bindNavigationControls();
  window.addEventListener('popstate', () => applyRoute(window.location.pathname));
}

async function loadPublicCatalog() {
  const response = await fetch('/api/catalog', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  const catalog = await response.json();
  if (!Array.isArray(catalog)) throw new Error('The server returned an invalid game catalog.');
  games = catalog;
  byId = new Map(games.map((game) => [game.id, game]));
  featuredGames = games.filter((game) => game.featured);
  slides = featuredGames.length ? featuredGames : games;
  slideIndex = 0;
  renderDashboardOverview();
}

async function loadRoadmap() {
  try {
    const response = await fetch('/api/roadmap', { headers: { Accept: 'application/json' } });
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

const initialHubView = new URLSearchParams(window.location.search).get('view') || 'home';
setHubView(initialHubView);

Promise.all([
  loadPublicCatalog().catch((error) => console.error('Unable to load the live game catalog; using the generated catalog instead.', error)),
  loadRoadmap(),
]).finally(start);