(() => {
  const defaultSettings = {
    hubButtonPosition: 'top-left',
    watermarkPosition: 'bottom-right',
    watermarkOpacity: 0.15,
  };
  const corners = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  const storageKey = 'octo-industries.game-home-corner';

  if (!document.body) {
    return;
  }

  const scriptElement = document.currentScript || Array.from(document.querySelectorAll('script')).find((element) =>
    /game-branding\.js(?:\?|$)/.test(element.src || '')
  );

  if (!scriptElement) {
    return;
  }

  const scriptUrl = scriptElement.src;
  const homeButtonUrl = new URL('home-button.png', scriptUrl).href;
  const watermarkUrl = new URL('watermark-logo.png', scriptUrl).href;
  const hubUrl = new URL('../../index.html#home', scriptUrl).href;

  function readPosition(value, fallback, settingName) {
    if (corners.has(value) || (settingName === 'watermarkPosition' && value === 'none')) {
      return value;
    }

    if (value !== undefined) {
      console.warn(`Invalid Octo Industries ${settingName} setting; using ${fallback}.`);
    }
    return fallback;
  }

  function normalizeSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const opacity = source.watermarkOpacity;
    const watermarkOpacity = typeof opacity === 'number' && Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
      ? opacity
      : defaultSettings.watermarkOpacity;
    if (opacity !== undefined && watermarkOpacity !== opacity) {
      console.warn('Invalid Octo Industries watermarkOpacity setting; using 0.15.');
    }
    return {
      hubButtonPosition: readPosition(source.hubButtonPosition, defaultSettings.hubButtonPosition, 'hubButtonPosition'),
      watermarkPosition: readPosition(source.watermarkPosition, defaultSettings.watermarkPosition, 'watermarkPosition'),
      watermarkOpacity,
    };
  }

  const existingBrand = document.body.querySelector('.octo-game-brand');
  const existingWatermark = document.body.querySelector('.octo-game-watermark');
  if (existingBrand) existingBrand.remove();
  if (existingWatermark) existingWatermark.remove();

  const badge = document.createElement('a');
  badge.className = 'octo-game-brand';
  badge.href = hubUrl;
  badge.setAttribute('aria-label', 'Octo Industries home button. Drag to move between corners, or activate to return to the Game Hub.');
  badge.title = 'Drag to move between corners. Click to return to the Game Hub.';

  const badgeImage = document.createElement('img');
  badgeImage.src = homeButtonUrl;
  badgeImage.alt = '';
  badgeImage.draggable = false;
  badgeImage.loading = 'eager';
  badge.append(badgeImage);

  const watermark = document.createElement('img');
  watermark.className = 'octo-game-watermark';
  watermark.src = watermarkUrl;
  watermark.alt = '';
  watermark.setAttribute('aria-hidden', 'true');
  watermark.draggable = false;
  watermark.loading = 'eager';

  let drag;
  let suppressClick = false;
  let corner = defaultSettings.hubButtonPosition;
  let liveSettings = normalizeSettings(window.OCTO_GAME_BRANDING_CONFIG || defaultSettings);

  function syncFromConfig(nextSettings) {
    liveSettings = normalizeSettings(nextSettings);
    const nextHomeCorner = readPosition(liveSettings.hubButtonPosition, defaultSettings.hubButtonPosition, 'hubButtonPosition');
    const nextWatermarkCorner = readPosition(liveSettings.watermarkPosition, defaultSettings.watermarkPosition, 'watermarkPosition');

    try {
      const savedCorner = localStorage.getItem(storageKey);
      if (corners.has(savedCorner)) {
        corner = savedCorner;
      } else {
        corner = nextHomeCorner;
      }
    } catch (error) {
      corner = nextHomeCorner;
      console.warn('The saved Octo Industries home-button position is unavailable.', error);
    }

    document.body.dataset.octoHomeCorner = corner;
    document.body.dataset.octoWatermarkCorner = nextWatermarkCorner;
    document.body.style.setProperty('--octo-watermark-opacity', String(liveSettings.watermarkOpacity));
    badge.style.left = '';
    badge.style.top = '';
    badge.style.right = '';
    badge.style.bottom = '';
    badge.classList.remove('is-dragging');

    if (nextWatermarkCorner === 'none') {
      watermark.remove();
      return;
    }

    if (!watermark.isConnected) {
      document.body.append(watermark);
    }
  }

  Object.defineProperty(window, 'OCTO_GAME_BRANDING_CONFIG', {
    configurable: true,
    enumerable: true,
    get() {
      return liveSettings;
    },
    set(nextValue) {
      syncFromConfig(nextValue);
    },
  });

  syncFromConfig(window.OCTO_GAME_BRANDING_CONFIG || defaultSettings);

  badge.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    const bounds = badge.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      moved: false,
    };
    badge.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });

  badge.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) {
      return;
    }

    drag.moved = true;
    badge.classList.add('is-dragging');
    document.body.dataset.octoHomeCorner = 'dragging';

    const bounds = badge.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - bounds.width - 8, event.clientX - drag.offsetX));
    const top = Math.max(8, Math.min(window.innerHeight - bounds.height - 8, event.clientY - drag.offsetY));
    badge.style.left = `${left}px`;
    badge.style.top = `${top}px`;
    badge.style.right = 'auto';
    badge.style.bottom = 'auto';
    event.preventDefault();
    event.stopPropagation();
  });

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    if (drag.moved) {
      suppressClick = event.type === 'pointerup';
      const nextCorner = `${event.clientY < window.innerHeight / 2 ? 'top' : 'bottom'}-${event.clientX < window.innerWidth / 2 ? 'left' : 'right'}`;
      corner = nextCorner;
      document.body.dataset.octoHomeCorner = nextCorner;
      try {
        localStorage.setItem(storageKey, nextCorner);
      } catch (error) {
        console.warn('The Octo Industries home-button position could not be saved.', error);
      }
      event.preventDefault();
      event.stopPropagation();
    }
    drag = undefined;
  }

  function saveCorner(nextCorner) {
    corner = nextCorner;
    document.body.dataset.octoHomeCorner = corner;
    badge.style.left = '';
    badge.style.top = '';
    badge.style.right = '';
    badge.style.bottom = '';
    badge.classList.remove('is-dragging');

    try {
      localStorage.setItem(storageKey, corner);
    } catch (error) {
      console.warn('The Octo Industries home-button position could not be saved.', error);
    }
  }

  badge.addEventListener('pointerup', finishDrag);
  badge.addEventListener('pointercancel', finishDrag);
  badge.addEventListener('click', (event) => {
    if (!suppressClick) {
      return;
    }

    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  });

  badge.addEventListener('keydown', (event) => {
    const side = corner.endsWith('left') ? 'left' : 'right';
    const vertical = corner.startsWith('top') ? 'top' : 'bottom';
    let nextCorner;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      nextCorner = `${event.key === 'ArrowUp' ? 'top' : 'bottom'}-${side}`;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      nextCorner = `${vertical}-${event.key === 'ArrowLeft' ? 'left' : 'right'}`;
    } else {
      return;
    }

    event.preventDefault();
    saveCorner(nextCorner);
    badge.focus();
  });

  document.body.dataset.octoBrandingOverlayInstalled = 'true';
  document.body.append(badge);
  if (document.body.dataset.octoWatermarkCorner !== 'none') {
    document.body.append(watermark);
  }
})();
