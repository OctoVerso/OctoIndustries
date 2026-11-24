export const REGISTRY_CLASSIFICATIONS = Object.freeze({
  acquisitionStatus: Object.freeze(['local-payload', 'local-wrapper', 'external-only', 'unverified']),
  runtimeStatus: Object.freeze(['local', 'external-required', 'unverified']),
  networkDependency: Object.freeze(['not-required', 'optional', 'required', 'unverified']),
  saveStatus: Object.freeze(['game-managed', 'hub-adapter', 'unsupported', 'unverified']),
  testStatus: Object.freeze(['verified', 'partial', 'not-run', 'unverified']),
});

function enumValue(value, choices, fallback = 'unverified') {
  return typeof value === 'string' && choices.includes(value) ? value : fallback;
}

export function normalizeRegistryMetadata(game = {}) {
  const saveLevel = Number.isInteger(game.saveLevel) && game.saveLevel >= 0 && game.saveLevel <= 3
    ? game.saveLevel
    : null;
  return {
    acquisitionStatus: enumValue(game.acquisitionStatus, REGISTRY_CLASSIFICATIONS.acquisitionStatus),
    runtimeStatus: enumValue(game.runtimeStatus, REGISTRY_CLASSIFICATIONS.runtimeStatus),
    networkDependency: enumValue(game.networkDependency, REGISTRY_CLASSIFICATIONS.networkDependency),
    saveLevel,
    saveStatus: enumValue(game.saveStatus, REGISTRY_CLASSIFICATIONS.saveStatus),
    testStatus: enumValue(game.testStatus, REGISTRY_CLASSIFICATIONS.testStatus),
    acquisitionEvidence: Array.isArray(game.acquisitionEvidence)
      ? game.acquisitionEvidence.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
      : [],
  };
}

export function validateRegistryMetadata(game = {}) {
  const normalized = normalizeRegistryMetadata(game);
  const errors = [];
  for (const [field, choices] of Object.entries(REGISTRY_CLASSIFICATIONS)) {
    if (game[field] !== undefined && game[field] !== null && !choices.includes(game[field])) errors.push(field);
  }
  if (game.saveLevel !== undefined && game.saveLevel !== null
    && (!Number.isInteger(game.saveLevel) || game.saveLevel < 0 || game.saveLevel > 3)) {
    errors.push('saveLevel');
  }
  return { ok: errors.length === 0, errors, metadata: normalized };
}
