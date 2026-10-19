const { graphGet } = require('../../graph/graphClient');
const logger = require('../../logger');

// Purview DLP policies are not listable with a Graph application permission.
// /security/alerts_v2 is kept only as context. The result stays unavailable
// so alert presence or absence does not change the domain score.

const ALERT_WINDOW_DAYS = 30;

async function collectDlp(tenantId) {
  logger.info({ event: 'collector_start', collector: 'dlp', tenantId });

  let dlpAlerts = [];
  let permissionMissing = false;

  try {
    const since = new Date(Date.now() - ALERT_WINDOW_DAYS * 86400_000).toISOString();
    const res = await graphGet(tenantId, '/security/alerts_v2', {
      $filter: `category eq 'DataLossPrevention' and createdDateTime ge ${since}`,
      $top: '25',
      $select: 'id,title,severity,status,createdDateTime',
    });
    dlpAlerts = res.value || [];
  } catch (err) {
    const status = err?.response?.status ?? err?.statusCode;
    if (status === 403 || status === 401) {
      permissionMissing = true;
    } else {
      logger.warn({ event: 'dlp_alerts_fetch_failed', tenantId, error: err.message });
      permissionMissing = true;
    }
  }

  const alertCount = permissionMissing ? null : dlpAlerts.length;
  const activeAlerts = permissionMissing ? null : dlpAlerts.filter((a) => a.status !== 'resolved').length;

  // Graph não lista políticas DLP do Purview com permissão de aplicação.
  // Alertas ficam no summary e não entram no score.
  logger.info({ event: 'collector_done', collector: 'dlp', tenantId, alertCount, activeAlerts, scored: false });

  return {
    collector: 'dlp',
    score: null,
    unavailable: true,
    proxy: true,
    reason: permissionMissing
      ? 'Permissão SecurityAlert.Read.All ausente. Políticas DLP do Purview não são listáveis via Graph.'
      : 'Políticas DLP do Purview não são listáveis via Graph. Alertas recentes não comprovam a política.',
    summary: {
      alertsInPeriod: alertCount,
      activeAlerts,
      periodDays: ALERT_WINDOW_DAYS,
      copilotDlpPoliciesCount: null,
    },
  };
}

module.exports = { collectDlp };
