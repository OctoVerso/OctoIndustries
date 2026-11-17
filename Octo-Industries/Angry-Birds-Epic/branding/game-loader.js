(() => {
  const scriptUrl = (document.currentScript && document.currentScript.src) || '';
  const logoUrl = new URL('primary-logo.png', scriptUrl).href;

  function show(options = {}) {
    const el = document.createElement('div');
    el.className = 'octo-loader';
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-label', 'Loading');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    el.setAttribute('aria-valuenow', '0');
    el.innerHTML = `
      <div class="octo-loader-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="octo-loader-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#e85a9b"/>
              <stop offset=".55" stop-color="#8a4fd6"/>
              <stop offset="1" stop-color="#f28b44"/>
            </linearGradient>
          </defs>
          <circle class="track" cx="50" cy="50" r="47" pathLength="100"/>
          <circle class="fill" cx="50" cy="50" r="47" pathLength="100"/>
        </svg>
        <img src="${logoUrl}" alt="" width="640" height="720" decoding="sync">
      </div>
      <div class="octo-loader-bar"><i></i></div>
      <div class="octo-loader-percent">0%</div>
      <button class="octo-loader-play" type="button">TAP TO PLAY</button>`;
    const settings = options && typeof options === 'object' ? options : {};
    if (settings.artwork || settings.title) {
      const media = [];
      if (settings.artwork) {
        const artwork = document.createElement('img');
        artwork.className = 'octo-loader-game-art';
        artwork.src = settings.artwork;
        artwork.alt = settings.title ? `${settings.title} artwork` : 'Game artwork';
        artwork.decoding = 'async';
        media.push(artwork);
      }
      if (settings.title) {
        const title = document.createElement('div');
        title.className = 'octo-loader-game-title';
        title.textContent = settings.title;
        media.push(title);
      }
      el.classList.add('has-game-media');
      el.prepend(...media);
    }
    (document.body || document.documentElement).append(el);

    const percent = el.querySelector('.octo-loader-percent');
    const playButton = el.querySelector('.octo-loader-play');
    let hideTimer;

    const loader = {
      progress(value) {
        value = Math.max(0, Math.min(100, Math.round(value)));
        el.style.setProperty('--p', value);
        el.setAttribute('aria-valuenow', value);
        percent.textContent = `${value}%`;
      },
      finish(delay = 0) {
        loader.progress(100);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => el.classList.add('is-done'), delay);
      },
      // Browsers only start audio after a user gesture; ask for one if none has happened yet.
      whenActivated() {
        if (navigator.userActivation && navigator.userActivation.hasBeenActive) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          el.classList.add('is-waiting');
          playButton.focus({ preventScroll: true });
          const go = () => {
            el.classList.remove('is-waiting');
            resolve();
          };
          playButton.addEventListener('click', go, { once: true });
        });
      },
    };
    return loader;
  }

  async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load ${url}`);
    }
    const total = Number(response.headers.get('Content-Length')) || 0;
    if (!response.body || !total) {
      return response.arrayBuffer();
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      received += value.length;
      onProgress((received / total) * 99);
    }
    return new Blob(chunks).arrayBuffer();
  }

  // Loads a Flash game through Ruffle with the Octo loader in front of it.
  async function loadRuffle({ url, config, replace, className, coverMs = 0 }) {
    const loader = show();
    window.RufflePlayer.config = Object.assign({ splashScreen: false, autoplay: 'on', openUrlMode: 'deny' }, config);
    try {
      const data = await fetchWithProgress(url, loader.progress);
      loader.progress(99);
      await loader.whenActivated();
      const player = window.RufflePlayer.newest().createPlayer();
      player.className = className;
      replace.replaceWith(player);
      player.addEventListener('loadeddata', () => loader.finish(coverMs));
      player.load({ data });
      setTimeout(() => loader.finish(), 30000);
      return player;
    } catch (error) {
      console.error(error);
      const player = window.RufflePlayer.newest().createPlayer();
      player.className = className;
      replace.replaceWith(player);
      player.load(url);
      loader.finish();
      return player;
    }
  }

  window.OctoLoader = { show, fetchWithProgress, loadRuffle };
})();
