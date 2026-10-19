const { collectSensitivityLabels } = require('./sensitivityLabelsCollector');
const { collectAudit } = require('./auditCollector');
const { collectDlp } = require('./dlpCollector');
const { collectRetentionPolicies } = require('./retentionPoliciesCollector');
const { collectRetention } = require('./retentionCollector');
const { collectCopilotExtensions } = require('./copilotExtensionsCollector');
const logger = require('../../logger');

// Weights for domain score calculation.
// Uses usedWeight denominator (baseline style) so collectors that are unavailable
// due to missing Purview/compliance licences do not penalise the domain score.
const COLLECTOR_WEIGHTS = {
  sensitivityLabels: 6,
  audit: 4,
  dlp: 3,
  retentionPolicies: 2,
  retentionLabels: 2,
  copilotExtensions: 1,
};

async function runGovernanceAssessment(tenantId) {
  logger.info({ event: 'assessment_start', domain: 'governance', tenantId });

  const collectors = [
    { name: 'sensitivityLabels',  fn: () => collectSensitivityLabels(tenantId) },
    { name: 'audit',              fn: () => collectAudit(tenantId) },
    { name: 'dlp',                fn: () => collectDlp(tenantId) },
    { name: 'retentionPolicies',  fn: () => collectRetentionPolicies(tenantId) },
    { name: 'retentionLabels',    fn: () => collectRetention(tenantId) },
    { name: 'copilotExtensions',  fn: () => collectCopilotExtensions(tenantId) },
  ];

  const results = {};
  const errors = {};

  await Promise.allSettled(collectors.map(async ({ name, fn }) => {
    try {
      results[name] = await fn();
    } catch (err) {
      const reason = err.response?.data?.error?.message || err.message;
      logger.error({ event: 'collector_error', collector: name, tenantId, error: reason });
      errors[name] = reason;
      results[name] = { score: null, unavailable: true, reason };
    }
  }));

  const domainScore = calculateGovernanceScore(results);

  logger.info({ event: 'assessment_done', domain: 'governance', tenantId, domainScore });

  return {
    domain: 'governance',
    tenantId,
    assessedAt: new Date().toISOString(),
    domainScore,
    collectors: results,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

function calculateGovernanceScore(results) {
  // Unavailable collectors, including the DLP alert proxy, do not penalise the score.
  let weightedSum = 0;
  let usedWeight = 0;
  for (const [name, weight] of Object.entries(COLLECTOR_WEIGHTS)) {
    const r = results[name];
    if (r && typeof r.score === 'number' && !r.unavailable) {
      weightedSum += r.score * weight;
      usedWeight += weight;
    }
  }
  return usedWeight > 0
    ? Math.round((weightedSum / usedWeight) * 10) / 10
    : 0;
}

module.exports = { runGovernanceAssessment, calculateGovernanceScore };
