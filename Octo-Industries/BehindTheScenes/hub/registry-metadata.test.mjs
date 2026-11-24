import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegistryMetadata, validateRegistryMetadata } from './registry-metadata.mjs';

test('registry metadata defaults unverified fields without claiming coverage', () => {
  assert.deepEqual(normalizeRegistryMetadata({}), {
    acquisitionStatus: 'unverified',
    runtimeStatus: 'unverified',
    networkDependency: 'unverified',
    saveLevel: null,
    saveStatus: 'unverified',
    testStatus: 'unverified',
    acquisitionEvidence: [],
  });
});

test('registry metadata preserves explicit external and save classifications', () => {
  const result = normalizeRegistryMetadata({
    acquisitionStatus: 'external-only',
    runtimeStatus: 'external-required',
    networkDependency: 'required',
    saveLevel: 0,
    saveStatus: 'unsupported',
    testStatus: 'not-run',
    acquisitionEvidence: ['launch wrapper', 42, '  source note  '],
  });
  assert.deepEqual(result, {
    acquisitionStatus: 'external-only',
    runtimeStatus: 'external-required',
    networkDependency: 'required',
    saveLevel: 0,
    saveStatus: 'unsupported',
    testStatus: 'not-run',
    acquisitionEvidence: ['launch wrapper', 'source note'],
  });
  assert.equal(validateRegistryMetadata(result).ok, true);
});

test('invalid classifications fall back to unverified', () => {
  const result = normalizeRegistryMetadata({ acquisitionStatus: 'passed', saveLevel: 9 });
  assert.equal(result.acquisitionStatus, 'unverified');
  assert.equal(result.saveLevel, null);
  assert.deepEqual(validateRegistryMetadata({ acquisitionStatus: 'passed', saveLevel: 9 }).errors, ['acquisitionStatus', 'saveLevel']);
});
