import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCatalogPreservesPreviousEntries,
  assertRegistryIntegrity,
  compareRegistryIntegrity,
} from './registry-integrity.mjs';

test('registry integrity allows additions while preserving existing IDs', () => {
  const result = compareRegistryIntegrity(
    [{ id: 'alpha' }, { id: 'beta' }],
    [{ id: 'alpha' }, { id: 'beta' }, { id: 'new-game' }],
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.unexpected, ['new-game']);
  assert.deepEqual(result.missing, []);
});

test('registry integrity rejects a silently removed ID', () => {
  assert.throws(
    () => assertCatalogPreservesPreviousEntries([{ id: 'alpha' }, { id: 'beta' }], [{ id: 'alpha' }]),
    /missing IDs: beta/,
  );
});

test('registry integrity rejects duplicate IDs in either side', () => {
  const result = compareRegistryIntegrity(['alpha', 'alpha'], ['alpha', 'alpha']);
  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicateExpected, ['alpha']);
  assert.deepEqual(result.duplicateActual, ['alpha']);
  assert.throws(() => assertRegistryIntegrity(['alpha', 'alpha'], ['alpha']), /duplicate expected IDs: alpha/);
});

test('an empty previous catalog does not prevent the first registration', () => {
  assert.doesNotThrow(() => assertCatalogPreservesPreviousEntries([], [{ id: 'first-game' }]));
});
