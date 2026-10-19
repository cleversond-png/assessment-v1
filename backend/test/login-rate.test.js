const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { test, after } = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-assessment-rate-'));
const salt = crypto.randomBytes(16).toString('hex');
const passwordHash = crypto.pbkdf2Sync('test-password', salt, 100000, 32, 'sha256').toString('hex');

process.env.AZURE_CLIENT_ID = '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET = 'test-secret';
process.env.AZURE_REDIRECT_URI = 'http://localhost/auth/callback';
process.env.PORTAL_ADMIN_USERNAME = 'Admin.Assessment';
process.env.PORTAL_ADMIN_PASSWORD_HASH = `pbkdf2:100000:${salt}:${passwordHash}`;
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { app } = require('../src/server');

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('sixth failed login returns 429', async () => {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'Admin.Assessment', password: 'senha-errada' });
    assert.equal(res.status, 401, `attempt ${attempt}`);
  }

  const blocked = await request(app)
    .post('/auth/login')
    .send({ username: 'Admin.Assessment', password: 'senha-errada' });
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { error: 'Muitas tentativas. Tente mais tarde.' });
});
