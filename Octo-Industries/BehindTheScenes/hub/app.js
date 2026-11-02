function withAssetUrls(game) {
  const { assetUrl } = window.OCTO_CONFIG;
  return {
    ...game,
    launch: assetUrl(game.launch),
    thumbnail: assetUrl(game.thumbnail),
    screenshots: (game.screenshots || []).map(assetUrl),
  };
}

let games = Array.isArray(window.OCTO_GAMES) ? window.OCTO_GAMES.map(withAssetUrls) : [];
let byId = new Map(games.map((game) => [game.id, game]));
const grid = document.querySelector('#game-grid');
const searchInput = document.querySelector('#game-search');
const categoryList = document.querySelector('#category-list');
const resultSummary = document.querySelector('#results-summary');
const emptyState = document.querySelector('#empty-state');
const recentSection = document.querySelector('#recent-section');
const recentList = document.querySelector('#recent-list');
let featuredGames = games.filter((game) => game.featured);
let slides = featuredGames.length ? featuredGames : games;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let activeCategory = 'All';
let slideIndex = 0;
let searchTimer;
let activeGallery;
let galleryIndex = 0;

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

function markPlayed(game) {
  try {
    const recent = [game.id, ...readRecent().filter((id) => id !== game.id)].slice(0, 3);
    localStorage.setItem('octo-industries.recent', JSON.stringify(recent));
  } catch {
    return;
  }
}

function imageMarkup(game, className, contain = false) {
  if (!game.thumbnail) return '';
  return `<img class="${className}" data-game-id="${escapeHtml(game.id)}" src="${escapeHtml(game.thumbnail)}" alt="" loading="${className === 'featured-image' ? 'eager' : 'lazy'}"${contain ? ' data-contain="true"' : ''}>`;
}

function categories() {
  const counts = new Map();
  for (const game of games) counts.set(game.category, (counts.get(game.category) || 0) + 1);
  const options = [['All', games.length], ...[...counts.entries()].sort(([first], [second]) => first.localeCompare(second))];
  categoryList.innerHTML = options.map(([name, count]) => `
    <button class="category-chip${activeCategory === name ? ' is-active' : ''}" type="button" data-category="${escapeHtml(name)}" aria-pressed="${activeCategory === name}">
      ${escapeHtml(name === 'All' ? 'All games' : name)} <span>${String(count).padStart(2, '0')}</span>
    </button>`).join('');
}

function gameCard(game, index) {
  const tags = [game.category, ...(game.tags || [])].filter((tag, position, list) => list.indexOf(tag) === position).slice(0, 2);
  const hasThumbnail = Boolean(game.thumbnail);
  const hasGallery = Array.isArray(game.screenshots) && game.screenshots.length > 0;
  return `
    <article class="game-card" style="animation-delay:${Math.min(index * 45, 225)}ms" data-game-id="${escapeHtml(game.id)}">
      <a class="game-art" data-category="${escapeHtml(game.category)}" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}" aria-label="Play ${escapeHtml(game.title)}">
        ${hasThumbnail ? imageMarkup(game, 'game-image') : `<span class="art-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>`}
        <span class="art-live"><i></i> READY TO PLAY</span><span class="art-category">${escapeHtml(game.category.toUpperCase())}</span>
      </a>
      <div class="game-card-copy">
        <div><div class="game-heading-line"><h3>${escapeHtml(game.title)}</h3><span class="category-label">${escapeHtml(game.category.toUpperCase())}</span></div><p class="game-description">${escapeHtml(game.description)}</p></div>
        <div class="game-card-foot"><div class="game-tags">${tags.map((tag) => `<span class="game-tag">#${escapeHtml(tag.toLowerCase())}</span>`).join('')}</div><div class="game-card-actions">${hasGallery ? `<button class="gallery-link" type="button" data-gallery-id="${escapeHtml(game.id)}" aria-label="View ${escapeHtml(game.title)} screenshots">IMAGES</button>` : ''}<a class="play-link" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}"><span aria-hidden="true">▶</span> PLAY</a></div></div>
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
  grid.innerHTML = matches.map(gameCard).join('');
  grid.hidden = matches.length === 0;
  emptyState.hidden = matches.length > 0;
  grid.setAttribute('aria-busy', 'false');
  resultSummary.textContent = matches.length === games.length && activeCategory === 'All' && !searchInput.value.trim()
    ? `${games.length} games, all ready to play`
    : `${matches.length} ${matches.length === 1 ? 'game' : 'games'} found`;
  document.querySelector('#search-clear').hidden = !searchInput.value;
}

function renderRecent() {
  const recent = readRecent().map((id) => byId.get(id)).filter(Boolean);
  recentSection.hidden = !recent.length;
  recentList.innerHTML = recent.map((game) => `
    <a class="recent-item" href="${escapeHtml(game.launch)}" data-launch-id="${escapeHtml(game.id)}">
      <span class="recent-thumb">${game.thumbnail ? imageMarkup(game, 'recent-image') : escapeHtml(game.title.slice(0, 1))}</span>
      <span class="recent-copy"><b>${escapeHtml(game.title)}</b><span>${escapeHtml(game.category)} · Pick up and play</span></span>
      <span class="recent-go" aria-hidden="true">↗</span>
    </a>`).join('');
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

function bindEvents() {
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.gameId) return;
    const game = byId.get(image.dataset.gameId);
    image.remove();
    if (image.classList.contains('game-image')) {
      const fallback = document.createElement('span');
      fallback.className = 'art-index';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = String(games.indexOf(game) + 1).padStart(2, '0');
      image.closest('.game-art').prepend(fallback);
    } else if (image.classList.contains('featured-image')) {
      const orbit = document.createElement('span');
      orbit.className = 'feature-orbit';
      const spark = document.createElement('span');
      spark.className = 'feature-spark';
      image.closest('.featured-art').append(orbit, spark);
    } else if (image.classList.contains('recent-image')) {
      image.closest('.recent-thumb').textContent = game?.title.slice(0, 1) || '?';
    }
  }, true);

  categoryList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    categories();
    renderGames();
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGames, reducedMotion ? 0 : 70);
  });

  document.querySelector('#search-clear').addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    renderGames();
  });

  document.querySelector('#clear-filters').addEventListener('click', () => {
    activeCategory = 'All';
    searchInput.value = '';
    categories();
    renderGames();
    searchInput.focus();
  });

  document.querySelectorAll('.nav-search').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('#games').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    window.setTimeout(() => searchInput.focus({ preventScroll: true }), reducedMotion ? 0 : 350);
    document.querySelector('#primary-nav').classList.remove('is-open');
    document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false');
    document.querySelector('#menu-toggle').setAttribute('aria-label', 'Open navigation');
  }));

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
    if (event.target.closest('#primary-nav a')) {
      document.querySelector('#primary-nav').classList.remove('is-open');
      document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false');
    }
  });

  const menuToggle = document.querySelector('#menu-toggle');
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    document.querySelector('#primary-nav').classList.toggle('is-open', open);
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
      document.querySelector('#games').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      searchInput.focus({ preventScroll: true });
    }
    if (event.key === 'Escape') {
      document.querySelector('#primary-nav').classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      if (document.activeElement === searchInput && searchInput.value) {
        searchInput.value = '';
        renderGames();
      }
    }
  });

  const navLinks = [...document.querySelectorAll('.primary-nav .nav-link[href^="#"]')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        navLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
      }
    }, { rootMargin: '-25% 0px -65% 0px' });
    document.querySelectorAll('#home, #games, #about').forEach((section) => observer.observe(section));
  }
}

function browserDeviceInfo() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const deviceType = navigator.userAgentData?.mobile
    ? 'Mobile'
    : /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? 'Tablet'
      : 'Desktop';
  const operatingSystem = /Windows/i.test(platform + ua) ? 'Windows'
    : /Android/i.test(platform + ua) ? 'Android'
      : /iPhone|iPad|iPod|iOS/i.test(platform + ua) ? 'iOS'
        : /Mac OS|Macintosh/i.test(platform + ua) ? 'macOS'
          : /Linux/i.test(platform + ua) ? 'Linux' : 'Unknown';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Chrome\//.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  return {
    deviceType,
    operatingSystem,
    browser,
    screenResolution: Number.isFinite(screen.width) && Number.isFinite(screen.height)
      ? `${screen.width} × ${screen.height}` : '',
    octoVersion: document.querySelector('meta[name="octo-version"]')?.content || window.OCTO_BUILD_VERSION || '',
  };
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
    document.querySelector('#primary-nav').classList.remove('is-open');
    document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false');
    document.querySelector('#menu-toggle').setAttribute('aria-label', 'Open navigation');
    dialog.showModal();
  };
  document.querySelectorAll('#feedback-open, [data-feedback-open]').forEach((button) => button.addEventListener('click', open));
  document.querySelector('#feedback-close').addEventListener('click', () => dialog.close());
  document.querySelector('#feedback-cancel').addEventListener('click', () => dialog.close());
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
      form.reset();
      game.hidden = true;
      gameLabel.hidden = true;
      status.textContent = 'Thanks — your feedback was sent.';
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

  if (!games.length) {
    grid.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector('h3').textContent = 'The collection is offline.';
    emptyState.querySelector('p').textContent = 'Run npm --prefix Octo-Industries/BehindTheScenes run sync to discover games and build the local catalog.';
    resultSummary.textContent = 'No game catalog found';
  } else {
    document.querySelector('#header-count').textContent = String(games.length).padStart(2, '0');
    document.querySelector('#library-status').textContent = `${games.length} GAMES READY TO PLAY`;
    document.querySelector('#library-count').innerHTML = `${String(games.length).padStart(2, '0')} GAMES IN THE COLLECTION <span>↘</span>`;
    categories();
    renderFeatured();
    renderGames();
    renderRecent();
    bindEvents();
    drawAmbient();
  }
}

async function loadPublicCatalog() {
  const response = await fetch(window.OCTO_CONFIG.apiUrl('/api/catalog'), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  const catalog = await response.json();
  if (!Array.isArray(catalog)) throw new Error('The server returned an invalid game catalog.');
  games = catalog.map(withAssetUrls);
  featuredGames = games.filter((game) => game.featured);
  slides = featuredGames.length ? featuredGames : games;
  slideIndex = 0;
  byId = new Map(games.map((game) => [game.id, game]));
}

loadPublicCatalog()
  .catch((error) => console.error('Unable to load the live game catalog; using the generated catalog instead.', error))
  .finally(start);