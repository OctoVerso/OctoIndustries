import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalStateFor,
  normalizeEvidence,
  validateAcquisitionCreate,
  validateAcquisitionPatch,
} from './acquisition-queue.js';

test('acquisition requests normalize evidence and start in an unverified classification', () => {
  assert.deepEqual(validateAcquisitionCreate({
    gameId: 'new-game',
    title: 'New Game',
    sourceUrl: 'https://example.com/game',
    evidence: 'https://example.com/game\nhttps://example.com/license',
  }), {
    gameId: 'new-game',
    title: 'New Game',
    action: 'acquire',
    sourceUrl: 'https://example.com/game',
    requestedVersion: '',
    notes: '',
    acquisitionStatus: 'unverified',
    evidence: [
      { kind: 'note', label: 'https://example.com/game', url: 'https://example.com/game', sha256: '', capturedAt: '' },
      { kind: 'note', label: 'https://example.com/license', url: 'https://example.com/license', sha256: '', capturedAt: '' },
    ],
  });
});

test('approval requires evidence and rejects external-only items', () => {
  const current = {
    state: 'awaiting-approval',
    acquisitionStatus: 'unverified',
    evidence: [{ kind: 'test', label: 'Browser check', url: '', sha256: '', capturedAt: '' }],
  };
  assert.deepEqual(validateAcquisitionPatch(current, { state: 'approved' }), { state: 'approved' });
  assert.equal(approvalStateFor('approved'), 'approved');
  assert.throws(() => validateAcquisitionPatch({ ...current, evidence: [] }, { state: 'approved' }), /requires evidence/);
  assert.throws(() => validateAcquisitionPatch({ ...current, acquisitionStatus: 'external-only' }, { state: 'approved' }), /external-only/);
});

test('queue transitions are constrained and evidence is validated', () => {
  assert.equal(approvalStateFor('awaiting-approval'), 'pending');
  assert.equal(approvalStateFor('rejected'), 'rejected');
  assert.throws(() => validateAcquisitionPatch({ state: 'proposed', acquisitionStatus: 'unverified', evidence: [] }, { state: 'approved' }), /cannot move/);
  assert.throws(() => normalizeEvidence([{ kind: 'artifact', label: 'bad', sha256: 'not-a-digest' }]), /SHA-256/);
});
