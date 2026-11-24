function normalizeIds(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => typeof entry === 'string' ? entry : entry?.id)
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim());
}

function duplicates(ids) {
  const seen = new Set();
  const duplicateIds = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicateIds.add(id);
    seen.add(id);
  }
  return [...duplicateIds].sort();
}

/**
 * Compare a registry with the entries it is expected to contain.
 * New IDs are allowed. Missing IDs and duplicates are integrity failures.
 */
export function compareRegistryIntegrity(expectedEntries, actualEntries) {
  const expectedIds = normalizeIds(expectedEntries);
  const actualIds = normalizeIds(actualEntries);
  const expectedSet = new Set(expectedIds);
  const actualSet = new Set(actualIds);
  const missing = [...expectedSet].filter((id) => !actualSet.has(id)).sort();
  const unexpected = [...actualSet].filter((id) => !expectedSet.has(id)).sort();
  const duplicateExpected = duplicates(expectedIds);
  const duplicateActual = duplicates(actualIds);

  return {
    ok: missing.length === 0 && duplicateExpected.length === 0 && duplicateActual.length === 0,
    expectedCount: expectedSet.size,
    actualCount: actualSet.size,
    missing,
    unexpected,
    duplicateExpected,
    duplicateActual,
  };
}

export function assertRegistryIntegrity(expectedEntries, actualEntries, label = 'registry') {
  const result = compareRegistryIntegrity(expectedEntries, actualEntries);
  if (result.ok) return result;

  const details = [];
  if (result.missing.length) details.push(`missing IDs: ${result.missing.join(', ')}`);
  if (result.duplicateExpected.length) details.push(`duplicate expected IDs: ${result.duplicateExpected.join(', ')}`);
  if (result.duplicateActual.length) details.push(`duplicate actual IDs: ${result.duplicateActual.join(', ')}`);
  throw new Error(`${label} integrity check failed: ${details.join('; ')}`);
}

/**
 * Guard an existing generated catalog against silent removals while allowing
 * newly discovered games to be added on the next sync.
 */
export function assertCatalogPreservesPreviousEntries(previousCatalog, nextCatalog) {
  return assertRegistryIntegrity(previousCatalog, nextCatalog, 'Generated catalog');
}
