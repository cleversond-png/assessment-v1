const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { test, after } = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-assessment-stores-'));
process.env.DATA_DIR = dataDir;

const jobStore = require('../src/store/jobStore');
const resultsStore = require('../src/store/resultsStore');

const tenantId = '00000000-0000-0000-0000-000000000001';

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a running job becomes failed after a restart', () => {
  jobStore.set(tenantId, {
    status: 'running',
    domains: { baseline: 'done' },
    startedAt: '2026-10-19T12:00:00.000Z',
  });
  jobStore.set('other-tenant', {
    status: 'completed',
    domains: {},
    startedAt: '2026-10-19T12:00:00.000Z',
    completedAt: '2026-10-19T12:05:00.000Z',
  });

  jobStore.markInterrupted();

  const interrupted = jobStore.get(tenantId);
  assert.equal(interrupted.status, 'failed');
  assert.equal(interrupted.error, jobStore.INTERRUPTED_ERROR);
  assert.equal(interrupted.domains.baseline, 'done');
  assert.equal(jobStore.get('other-tenant').status, 'completed');
});

test('results older than 30 days are removed and history keeps the rest', () => {
  const resultsDir = path.join(dataDir, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const oldFile = path.join(resultsDir, `${tenantId}_2020-01-01T00-00-00-000Z.json`);
  const recentFile = path.join(resultsDir, `${tenantId}_2026-10-01T00-00-00-000Z.json`);
  fs.writeFileSync(oldFile, JSON.stringify({
    tenantId,
    assessedAt: '2020-01-01T00:00:00.000Z',
    overallScore: 1,
    domains: { baseline: { domainScore: 1 } },
  }));
  fs.writeFileSync(recentFile, JSON.stringify({
    tenantId,
    assessedAt: '2026-10-01T00:00:00.000Z',
    overallScore: 3,
    domains: { baseline: { domainScore: 3 }, entraId: { domainScore: 2 } },
  }));
  const oldTime = new Date('2020-01-01T00:00:00.000Z');
  const recentTime = new Date('2026-10-01T00:00:00.000Z');
  fs.utimesSync(oldFile, oldTime, oldTime);
  fs.utimesSync(recentFile, recentTime, recentTime);

  const removed = resultsStore.purgeExpired(Date.parse('2026-10-19T00:00:00.000Z'));
  assert.equal(removed, 1);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(recentFile), true);

  const history = resultsStore.listHistory(tenantId);
  assert.equal(history.length, 1);
  assert.equal(history[0].overallScore, 3);
  assert.equal(history[0].baseline, 3);
  assert.equal(history[0].entraId, 2);
});
