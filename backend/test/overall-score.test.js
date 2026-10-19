const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calculateOverallScore } = require('../src/scoring/overallScore');

function domains(scores) {
  return Object.fromEntries(
    Object.entries(scores).map(([name, domainScore]) => [name, { domainScore }])
  );
}

test('Entra weighs more than baseline', () => {
  const score = calculateOverallScore(domains({ baseline: 0, entraId: 5 }));
  assert.equal(score, 3.3);
});

test('SharePoint and governance weigh more than email', () => {
  const score = calculateOverallScore(domains({
    sharePoint: 0,
    governance: 0,
    emailSecurity: 5,
  }));
  assert.equal(score, 1);
});

test('Copilot readiness does not change the overall score', () => {
  const base = domains({
    baseline: 5,
    entraId: 5,
    sharePoint: 5,
    governance: 5,
    emailSecurity: 5,
    teams: 5,
  });
  assert.equal(calculateOverallScore(base), 5);
  assert.equal(calculateOverallScore({ ...base, iaReadiness: { domainScore: 0 } }), 5);
});

test('a domain without a numeric score is left out', () => {
  assert.equal(calculateOverallScore(domains({ baseline: 4, entraId: null })), 4);
  assert.equal(calculateOverallScore({}), null);
});
