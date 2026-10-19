const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, after } = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-assessment-test-'));
process.env.AZURE_CLIENT_ID = '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET = 'test-secret';
process.env.AZURE_REDIRECT_URI = 'http://localhost/auth/callback';
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { app } = require('../src/server');

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('GET /health returns ok', () => {
  return request(app).get('/health').expect(200, { status: 'ok' });
});
