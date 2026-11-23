import test from 'node:test';
import assert from 'node:assert/strict';
import { gameCategories, mergeGameCatalog, normalizePlayCounts, rankTrendingGames } from './catalog-utils.mjs';

test('game categories include every unique category from the main registry', () => {
  assert.deepEqual(gameCategories([
    { category: 'Puzzle' },
    { category: 'Other' },
    { category: 'Puzzle' },
    { category: '' },
    { category: null },
  ]), ['Other', 'Puzzle']);
});

test('public catalog updates generated entries without dropping locally deployed games', () => {
  const generated = [
    { id: 'local-only', title: 'Local game', launch: '/local.html' },
    { id: 'shared', title: 'Generated title', launch: '/shared.html' },
  ];
  const publicGames = [
    { id: 'shared', title: 'Updated title' },
    { id: 'remote-only', title: 'Remote game' },
  ];

  assert.deepEqual(mergeGameCatalog(generated, publicGames), [
    { id: 'local-only', title: 'Local game', launch: '/local.html' },
    { id: 'shared', title: 'Updated title', launch: '/shared.html' },
    { id: 'remote-only', title: 'Remote game' },
  ]);
});

test('trending ranks recorded plays descending and excludes zero and missing IDs', () => {
  const games = [
    { id: 'alpha', title: 'Alpha' },
    { id: 'beta', title: 'Beta' },
    { id: 'gamma', title: 'Gamma' },
  ];
  const ranked = rankTrendingGames(games, {
    alpha: 3,
    beta: 7,
    gamma: 0,
    missing: 100,
  }, 10);
  assert.deepEqual(ranked.map((game) => game.id), ['beta', 'alpha']);
  assert.deepEqual(ranked.map((game) => game.playCount), [7, 3]);
});

test('trending uses recent play timestamps then title for deterministic ties', () => {
  const games = [
    { id: 'zulu', title: 'Zulu' },
    { id: 'alpha', title: 'Alpha' },
    { id: 'beta', title: 'Beta' },
  ];
  const ranked = rankTrendingGames(games, {
    zulu: { count: 4, lastPlayedAt: '2026-01-01T00:00:00Z' },
    alpha: { count: 4, lastPlayedAt: '2026-02-01T00:00:00Z' },
    beta: { count: 4, lastPlayedAt: '2026-02-01T00:00:00Z' },
  });
  assert.deepEqual(ranked.map((game) => game.id), ['alpha', 'beta', 'zulu']);
});

test('trending safely handles empty, malformed, negative, and unavailable count data', () => {
  const games = [{ id: 'alpha', title: 'Alpha' }];
  assert.deepEqual(rankTrendingGames(games, null), []);
  assert.deepEqual(rankTrendingGames(games, []), []);
  assert.deepEqual(rankTrendingGames(games, { alpha: 'broken', beta: -5 }), []);
  assert.deepEqual(normalizePlayCounts({ alpha: 2.9, beta: '3', gamma: -1 }), {
    alpha: { count: 2, lastPlayedAt: 0 },
  });
});
