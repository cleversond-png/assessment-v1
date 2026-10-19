const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calculateGovernanceScore } = require('../src/collectors/governance');
const { generateRecommendations } = require('../src/recommendations');

test('DLP proxy and unavailable retention labels do not change the governance score', () => {
  const withoutGaps = calculateGovernanceScore({
    sensitivityLabels: { score: 4 },
    audit: { score: 5 },
  });
  const withGaps = calculateGovernanceScore({
    sensitivityLabels: { score: 4 },
    audit: { score: 5 },
    dlp: { score: null, unavailable: true, proxy: true, summary: { alertsInPeriod: 2 } },
    retentionLabels: { score: null, unavailable: true },
  });
  assert.equal(withoutGaps, withGaps);
  assert.equal(withGaps, 4.4);
});

test('retention labels count only when the collector returned a score', () => {
  const score = calculateGovernanceScore({
    sensitivityLabels: { score: 4 },
    retentionLabels: { score: 0 },
  });
  assert.equal(score, 3);
});

test('DLP manual review fires when the collector cannot read policies', () => {
  const recommendations = generateRecommendations({
    governance: { collectors: { dlp: { unavailable: true, proxy: true } } },
  });
  assert.equal(recommendations.items.some((item) => item.id === 'DLP_COPILOT_MANUAL_REVIEW'), true);
});
