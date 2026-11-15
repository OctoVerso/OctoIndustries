export function normalizeHubRoute(input = '/') {
  const raw = typeof input === 'string' ? input.trim() : '/';
  const withoutHash = raw.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  let path = withoutQuery || '/';

  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      path = '/';
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  path = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  if (path === '') return '/';
  return path;
}

export function getRouteTitle(pathname = '/') {
  const route = normalizeHubRoute(pathname);
  const titles = {
    '/': 'Home | Octo Industries',
    '/games': 'Games | Octo Industries',
    '/trending': 'Trending | Octo Industries',
    '/recently-added': 'Recently Added | Octo Industries',
    '/news': 'Octo News | Octo Industries',
    '/coming-soon': 'Coming Soon | Octo Industries',
    '/about': 'About Octo Industries',
    '/contact': 'Contact Me | Octo Industries',
    '/inquiries': 'Inquiries | Octo Industries',
    '/admin': 'Admin Dashboard | Octo Industries',
  };

  return titles[route] || 'Octo Industries';
}
