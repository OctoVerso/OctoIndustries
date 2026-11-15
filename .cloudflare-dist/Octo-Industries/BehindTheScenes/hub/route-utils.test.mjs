import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHubRoute, getRouteTitle } from './route-utils.js';

test('hub routes normalize and resolve to the correct public pages', () => {
  assert.equal(normalizeHubRoute('/'), '/');
  assert.equal(normalizeHubRoute('/games'), '/games');
  assert.equal(normalizeHubRoute('/inquiries/'), '/inquiries');
  assert.equal(normalizeHubRoute('https://example.com/trending'), '/trending');
  assert.equal(normalizeHubRoute('/about#team'), '/about');
  assert.equal(getRouteTitle('/coming-soon'), 'Coming Soon | Octo Industries');
  assert.equal(getRouteTitle('/news'), 'Octo News | Octo Industries');
});
