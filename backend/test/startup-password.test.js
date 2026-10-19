const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

function runServer(passwordHash) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-assessment-startup-'));
  const env = {
    ...process.env,
    AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000000',
    AZURE_CLIENT_SECRET: 'test-secret',
    AZURE_REDIRECT_URI: 'http://localhost/auth/callback',
    DATA_DIR: dataDir,
    NODE_ENV: 'test',
    PORT: '0',
    PORTAL_ADMIN_PASSWORD_HASH: passwordHash,
  };

  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    encoding: 'utf8',
    timeout: 20000,
  });

  fs.rmSync(dataDir, { recursive: true, force: true });
  return result;
}

test('server exits when PORTAL_ADMIN_PASSWORD_HASH is missing', () => {
  const result = runServer('');
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /PORTAL_ADMIN_PASSWORD_HASH/);
});

test('server exits when PORTAL_ADMIN_PASSWORD_HASH is not a pbkdf2 hash', () => {
  const result = runServer('nao-e-pbkdf2');
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /PORTAL_ADMIN_PASSWORD_HASH/);
});
