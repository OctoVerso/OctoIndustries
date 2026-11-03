(() => {
  const script = document.currentScript;
  // This file lives at Octo-Industries/BehindTheScenes/hub/config.js, three levels below the site root.
  const siteRoot = new URL('../../../', script.src).href;
  const config = Object.assign({
    functionsUrl: 'https://egamrzyfjjabisybpait.supabase.co/functions/v1',
  }, window.OCTO_CONFIG);
  config.siteRoot = siteRoot;

  const adminRoutes = [
    [/^\/api\/admin\/jobs(?=\/|\?|$)/, '/jobs'],
    [/^\/api\/admin\/build(?=\/|\?|$)/, '/jobs/build'],
    [/^\/api\/admin\/proposals(?=\/|\?|$)/, '/proposals'],
    [/^\/api\/admin\/roadmap(?=\/|\?|$)/, '/roadmap'],
    [/^\/api\/admin(?=\/|\?|$)/, '/admin'],
    [/^\/api\/catalog(?=\/|\?|$)/, '/catalog'],
    [/^\/api\/feedback(?=\/|\?|$)/, '/feedback'],
    [/^\/api\/tickets(?=\/|\?|$)/, '/feedback/tickets'],
  ];

  // Maps the application's logical /api paths onto the Supabase Edge Function URLs.
  config.apiUrl = (path) => {
    for (const [pattern, target] of adminRoutes) {
      if (pattern.test(path)) return `${config.functionsUrl}${path.replace(pattern, target)}`;
    }
    throw new Error(`Unknown API path: ${path}`);
  };

  // Game paths may be stored with a leading slash; resolve them against the site root so they also work on a project subpath.
  config.assetUrl = (path) => {
    if (typeof path !== 'string' || !path || /^(?:[a-z][a-z\d+.-]*:|\/\/|data:)/i.test(path)) return path;
    return new URL(path.replace(/^\/+/, ''), siteRoot).href;
  };

  window.OCTO_CONFIG = Object.freeze(config);
})();
