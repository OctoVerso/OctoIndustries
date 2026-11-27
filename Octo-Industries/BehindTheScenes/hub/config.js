(() => {
  const script = document.currentScript;
  // This file lives at Octo-Industries/BehindTheScenes/hub/config.js, three levels below the site root.
  const siteRoot = new URL('../../../', script.src).href;
  const isLocalPreview = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8080';
  const isCodespacesPreview = location.hostname.endsWith('.app.github.dev');
  const deploymentConfig = window.OCTO_CONFIG || {};
  const config = Object.assign({
    functionsUrl: 'https://egamrzyfjjabisybpait.supabase.co/functions/v1',
  }, deploymentConfig);
  if (isCodespacesPreview) config.functionsUrl = `${location.origin}/functions/v1`;
  else if (isLocalPreview) config.functionsUrl = deploymentConfig.functionsUrl === ''
    ? ''
    : `${location.origin}/functions/v1`;
  config.siteRoot = siteRoot;

  const adminRoutes = [
    [/^\/api\/admin\/jobs(?=\/|\?|$)/, '/jobs'],
    [/^\/api\/admin\/build(?=\/|\?|$)/, '/jobs/build'],
    [/^\/api\/admin\/proposals(?=\/|\?|$)/, '/proposals'],
    [/^\/api\/admin\/roadmap(?=\/|\?|$)/, '/roadmap'],
    [/^\/api\/admin(?=\/|\?|$)/, '/admin'],
    [/^\/api\/catalog(?=\/|\?|$)/, '/catalog'],
    [/^\/api\/roadmap(?=\/|\?|$)/, '/roadmap'],
    [/^\/api\/feedback(?=\/|\?|$)/, '/feedback'],
    [/^\/api\/tickets(?=\/|\?|$)/, '/feedback/tickets'],
  ];

  // Maps the application's logical /api paths onto the Supabase Edge Function URLs.
  config.apiUrl = (path) => {
    if (!config.functionsUrl) {
      throw new Error('Admin and data APIs are disabled in this Codespaces preview. Configure an approved staging functions URL to enable them.');
    }
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
