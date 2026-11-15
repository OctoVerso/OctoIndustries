import test from 'node:test';
import assert from 'node:assert/strict';
import { gameCategories, mergeGameCatalog } from './catalog-utils.mjs';

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
