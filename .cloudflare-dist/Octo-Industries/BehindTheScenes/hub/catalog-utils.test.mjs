import test from 'node:test';
import assert from 'node:assert/strict';
import { gameCategories } from './catalog-utils.mjs';

test('game categories include every unique category from the main registry', () => {
  assert.deepEqual(gameCategories([
    { category: 'Puzzle' },
    { category: 'Other' },
    { category: 'Puzzle' },
    { category: '' },
    { category: null },
  ]), ['Other', 'Puzzle']);
});
