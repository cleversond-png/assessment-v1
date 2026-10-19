const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'jobs.json');
const INTERRUPTED_ERROR = 'O processo reiniciou durante o assessment.';

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(jobs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(jobs, null, 2));
}

function get(tenantId) {
  return load()[tenantId] || null;
}

function set(tenantId, job) {
  const jobs = load();
  jobs[tenantId] = job;
  write(jobs);
  return job;
}

function markInterrupted() {
  const jobs = load();
  let changed = false;
  for (const job of Object.values(jobs)) {
    if (job?.status === 'running') {
      job.status = 'failed';
      job.error = INTERRUPTED_ERROR;
      job.completedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) write(jobs);
}

module.exports = { get, set, markInterrupted, INTERRUPTED_ERROR };
