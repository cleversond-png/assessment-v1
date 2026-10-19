const { graphGet } = require('../../graph/graphClient');
const logger = require('../../logger');

// Documented API: GET /security/labels/retentionLabels (v1.0).
// https://learn.microsoft.com/en-us/graph/api/security-labelsroot-list-retentionlabel?view=graph-rest-1.0
// Delegated RecordsManagement.Read.All only. Application permission is not supported.
// This product uses client_credentials, so a 401/403/500 is treated as unavailable.

async function collectRetention(tenantId) {
  logger.info({ event: 'collector_start', collector: 'retention', tenantId });

  let labels;
  try {
    const data = await graphGet(tenantId, '/security/labels/retentionLabels');
    labels = data.value ?? [];
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403 || status === 404 || status === 500) {
      logger.warn({ event: 'collector_unavailable', collector: 'retentionLabels', tenantId, status });
      return {
        collector: 'retentionLabels',
        score: null,
        unavailable: true,
        reason: 'GET /security/labels/retentionLabels não aceita permissão de aplicação. O assessment usa client_credentials.',
      };
    }
    throw err;
  }

  const totalLabels = labels.length;

  // Separate labels that block deletion (records) from advisory ones
  const recordLabels = labels.filter(
    (l) => l.retentionTrigger === 'dateLabeled' || l.isRecordLabel === true || l.behaviorDuringRetentionPeriod === 'retainAsRecord'
  );
  const publishedLabels = labels.filter((l) => l.isInUse === true);

  let score;
  if (totalLabels === 0) score = 0;
  else if (totalLabels <= 2 && recordLabels.length === 0) score = 1;
  else if (totalLabels <= 5 && recordLabels.length === 0) score = 2;
  else if (totalLabels > 0 && recordLabels.length > 0 && publishedLabels.length === 0) score = 3;
  else if (recordLabels.length > 0 && publishedLabels.length > 0) score = 4;
  else score = 2;

  logger.info({
    event: 'collector_done', collector: 'retention', tenantId,
    totalLabels, recordLabels: recordLabels.length, publishedLabels: publishedLabels.length, score,
  });

  return {
    collector: 'retentionLabels',
    score,
    summary: {
      totalLabels,
      recordLabelCount: recordLabels.length,
      publishedLabelCount: publishedLabels.length,
    },
    labels: labels.slice(0, 20).map((l) => ({
      id: l.id,
      displayName: l.displayName,
      retentionDuration: l.retentionDuration,
      retentionTrigger: l.retentionTrigger,
      isRecordLabel: l.isRecordLabel ?? false,
      isInUse: l.isInUse ?? false,
    })),
  };
}

module.exports = { collectRetention };
