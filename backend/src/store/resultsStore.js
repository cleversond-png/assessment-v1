const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const RESULTS_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'results')
  : path.resolve(__dirname, '../../data/results');
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function ensureDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function hasCollectorData(result) {
  const domains = result.domains || {};
  return Object.entries(domains).some(
    ([key, d]) => key !== 'iaReadiness' && d.collectors && Object.keys(d.collectors).length > 0
  );
}

function purgeExpired(now = Date.now()) {
  ensureDir();
  let removed = 0;
  for (const file of fs.readdirSync(RESULTS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const full = path.join(RESULTS_DIR, file);
    if (now - fs.statSync(full).mtimeMs > RETENTION_MS) {
      fs.unlinkSync(full);
      removed += 1;
    }
  }
  if (removed > 0) logger.info({ event: 'results_purged', removed });
  return removed;
}

function listHistory(tenantId) {
  ensureDir();
  const prefix = `${tenantId}_`;
  return fs.readdirSync(RESULTS_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((data) => data?.assessedAt)
    .map((data) => ({
      assessedAt: data.assessedAt,
      overallScore: data.overallScore ?? null,
      baseline: data.domains?.baseline?.domainScore ?? null,
      entraId: data.domains?.entraId?.domainScore ?? null,
      sharePoint: data.domains?.sharePoint?.domainScore ?? null,
      governance: data.domains?.governance?.domainScore ?? null,
      emailSecurity: data.domains?.emailSecurity?.domainScore ?? null,
      teams: data.domains?.teams?.domainScore ?? null,
      iaReadiness: data.domains?.iaReadiness?.domainScore ?? null,
    }))
    .sort((a, b) => String(a.assessedAt).localeCompare(String(b.assessedAt)));
}

function save(tenantId, result) {
  purgeExpired();
  ensureDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(RESULTS_DIR, `${tenantId}_${ts}.json`);
  const latest = path.join(RESULTS_DIR, `latest_${tenantId}.json`);

  fs.writeFileSync(file, JSON.stringify(result, null, 2));

  if (hasCollectorData(result)) {
    fs.writeFileSync(latest, JSON.stringify(result, null, 2));
    logger.info({ event: 'result_saved', tenantId, file, latestUpdated: true });
  } else {
    logger.warn({ event: 'result_saved_no_data', tenantId, file, latestUpdated: false,
      reason: 'collectors empty — latest not overwritten' });
  }

  return file;
}

function getLatest(tenantId) {
  ensureDir();
  const latest = path.join(RESULTS_DIR, `latest_${tenantId}.json`);
  if (!fs.existsSync(latest)) return null;
  return JSON.parse(fs.readFileSync(latest, 'utf8'));
}

function listLatestAll() {
  ensureDir();
  return fs.readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith('latest_'))
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
      return {
        tenantId: data.tenantId,
        tenantName: data.tenantName || null,
        assessedAt: data.assessedAt,
        overallScore: data.overallScore,
        recommendations: data.recommendations?.bySeverity,
      };
    })
    .sort((a, b) => (a.overallScore ?? 99) - (b.overallScore ?? 99));
}

function deleteAllForTenant(tenantId) {
  ensureDir();
  const files = fs.readdirSync(RESULTS_DIR).filter(
    (f) => f.startsWith(`${tenantId}_`) || f === `latest_${tenantId}.json`
  );
  for (const f of files) {
    fs.unlinkSync(path.join(RESULTS_DIR, f));
  }
  logger.info({ event: 'results_deleted', tenantId, count: files.length });
  return files.length;
}

module.exports = { save, getLatest, listLatestAll, listHistory, deleteAllForTenant, purgeExpired, RETENTION_MS };
