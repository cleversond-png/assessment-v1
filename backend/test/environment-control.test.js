const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isEnvironmentControlAllowed } = require('../src/azure/environmentService');

test('environment control is on only when AZURE_ENV_ALLOW_CONTROL is true', () => {
  const previous = process.env.AZURE_ENV_ALLOW_CONTROL;
  try {
    delete process.env.AZURE_ENV_ALLOW_CONTROL;
    assert.equal(isEnvironmentControlAllowed(), false);

    process.env.AZURE_ENV_ALLOW_CONTROL = 'false';
    assert.equal(isEnvironmentControlAllowed(), false);

    process.env.AZURE_ENV_ALLOW_CONTROL = 'true';
    assert.equal(isEnvironmentControlAllowed(), true);
  } finally {
    if (previous === undefined) delete process.env.AZURE_ENV_ALLOW_CONTROL;
    else process.env.AZURE_ENV_ALLOW_CONTROL = previous;
  }
});
