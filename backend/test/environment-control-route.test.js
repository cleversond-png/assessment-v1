const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { test, after } = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-assessment-env-'));
const salt = crypto.randomBytes(16).toString('hex');
const passwordHash = crypto.pbkdf2Sync('test-password', salt, 100000, 32, 'sha256').toString('hex');

process.env.AZURE_CLIENT_ID = '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET = 'test-secret';
process.env.AZURE_REDIRECT_URI = 'http://localhost/auth/callback';
process.env.PORTAL_ADMIN_USERNAME = 'Admin.Assessment';
process.env.PORTAL_ADMIN_PASSWORD_HASH = `pbkdf2:100000:${salt}:${passwordHash}`;
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
delete process.env.AZURE_ENV_ALLOW_CONTROL;

const request = require('supertest');
const { app } = require('../src/server');

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('start and stop stay disabled unless AZURE_ENV_ALLOW_CONTROL is true', async () => {
  const agent = request.agent(app);
  const login = await agent
    .post('/auth/login')
    .send({ username: 'Admin.Assessment', password: 'test-password' });
  assert.equal(login.status, 200);

  delete process.env.AZURE_ENV_ALLOW_CONTROL;
  const missing = await agent.post('/environment/assessment/resources/recurso-inexistente/stop');
  assert.equal(missing.status, 403);
  assert.deepEqual(missing.body, { error: 'Start/stop desativado.' });

  process.env.AZURE_ENV_ALLOW_CONTROL = 'false';
  const disabled = await agent.post('/environment/assessment/resources/recurso-inexistente/start');
  assert.equal(disabled.status, 403);
  assert.deepEqual(disabled.body, { error: 'Start/stop desativado.' });
});
