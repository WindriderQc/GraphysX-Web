import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJanitorSummary, readJanitorGroups } from '../src/diskx-janitor-source.ts';
const reply = data => async (url, options) => {
  assert.equal(options.method, undefined, 'read adapter uses GET only');
  assert.ok(url.startsWith('/diskx-api/janitor-'));
  return new Response(JSON.stringify({ status: 'success', data }));
};
test('absence, incompatible response and transport failure stay distinct', async () => {
  assert.deepEqual(await readJanitorSummary(reply({ available: false, status: 'unavailable' })), { available: false });
  await assert.rejects(readJanitorSummary(reply({ status: 'complete' })), /incompatible/);
  await assert.rejects(readJanitorSummary(async () => new Response('{}', { status: 502 })), /HTTP 502/);
});
test('assessment completion and savings are not execution or physical reclamation', async () => {
  const data = { generatedAt: '2026-10-25', status: 'complete', summary: { verifiedGroups: 2, provenSavingsBytes: 10, candidateGroups: 3, candidateBytes: 90, filesToHash: 5, bytesToHash: 100, executableActions: 0 } };
  const result = await readJanitorSummary(reply(data));
  assert.equal(result.status, 'complete'); assert.equal(result.candidateBytes, 90);
  assert.equal(result.executed, undefined); assert.equal(result.physicalReclaimedBytes, undefined);
});
test('group page keeps report identity, native evidence and omission; refuses looping cursors', async () => {
  const data = { report: { id: 'report-1', generatedAt: '2026-10-25', status: 'complete' }, total: 2, offset: 0, limit: 1, nextOffset: 1, scanBoundReached: true,
    groups: [{ sha256: 'a'.repeat(64), proof: 'sha256-current-metadata', size: 10, count: 2, provenSavingsBytes: 10,
      files: [{ path: '/synthetic/a', storageRole: 'media' }], filesOmitted: 1, policySurvivorPath: '/synthetic/a', review: { status: 'pending_review' } }] };
  const result = await readJanitorGroups(0, reply(data));
  assert.equal(result.report.id, 'report-1'); assert.equal(result.groups[0].filesOmitted, 1);
  assert.equal(result.groups[0].review.status, 'pending_review'); assert.equal(result.scanBoundReached, true);
  await assert.rejects(readJanitorGroups(0, reply({ ...data, nextOffset: 0 })), /progression/);
});
