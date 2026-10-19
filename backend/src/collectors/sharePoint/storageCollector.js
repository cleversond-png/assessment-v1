const { graphGetAll, graphGet, graphGetReportCsv } = require('../../graph/graphClient');
const { parseSiteUsageCsv } = require('./fileSample');
const { scoreStorageSites, summarizeSiteStorage } = require('./storageScore');
const logger = require('../../logger');

// Ranking: Reports.Read.All via getSharePointSiteUsageDetail.
// Fallback quota: Sites.Read.All. Personal OneDrive stays out of the concentration.
const SITES_FOR_QUOTA = 50;

function gb(bytes) {
  return Math.round(bytes / (1024 ** 3) * 10) / 10;
}

function reportResult(tenantId, summary) {
  const totalGB = gb(summary.totalBytes);
  logger.info({
    event: 'collector_done', collector: 'storage', tenantId,
    totalSites: summary.sharePointSites, totalGB,
    concentrationRatio: Math.round(summary.concentrationRatio * 100),
    score: summary.score, rankingSource: 'report',
  });
  const oneDriveNote = summary.oneDriveSites
    ? ` OneDrive pessoal fica fora da concentração (${summary.oneDriveSites} sites, ${summary.oneDriveStorageBytes} bytes).`
    : '';
  return {
    collector: 'storage',
    score: summary.score,
    summary: {
      totalSites: summary.sharePointSites,
      sitesSampled: summary.sharePointSites,
      totalStorageGB: totalGB,
      totalAllocatedGB: gb(summary.totalAllocatedBytes),
      utilizationPercent: summary.totalAllocatedBytes > 0
        ? Math.round((summary.totalBytes / summary.totalAllocatedBytes) * 100)
        : null,
      sitesNearing: null,
      sitesCritical: null,
      top20PercentSiteCount: summary.top20PercentCount,
      top20PercentStoragePercent: Math.round(summary.concentrationRatio * 100),
      rankingSource: 'report',
      oneDriveSitesExcluded: summary.oneDriveSites,
      oneDriveStorageBytes: summary.oneDriveStorageBytes,
      note: `Relatório D7: ${summary.sharePointSites} sites SharePoint.${oneDriveNote}`,
    },
    topSitesByStorage: summary.sites.slice(0, 20),
  };
}

async function collectFromReport(tenantId) {
  const csv = await graphGetReportCsv(
    tenantId,
    "/reports/getSharePointSiteUsageDetail(period='D7')"
  );
  const rows = parseSiteUsageCsv(csv);
  if (!rows) {
    const error = new Error('CSV do relatório de sites sem as colunas esperadas');
    error.reportUnusable = true;
    throw error;
  }
  return reportResult(tenantId, summarizeSiteStorage(rows));
}

async function collectFromSearch(tenantId) {

  let sites;
  try {
    sites = await graphGetAll(tenantId, '/sites', {
      search: '*',
      $select: 'id,displayName,webUrl,createdDateTime',
    });
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 404) {
      logger.warn({ event: 'collector_unavailable', collector: 'storage', tenantId });
      return {
        collector: 'storage',
        score: 0,
        unavailable: true,
        reason: 'Sites.Read.All required for storage analysis.',
      };
    }
    throw err;
  }

  if (sites.length === 0) {
    return {
      collector: 'storage',
      score: 5,
      summary: { message: 'No SharePoint sites found.' },
      topSitesByStorage: [],
    };
  }

  // Fetch drive quota for a sample of sites in parallel
  const sample = sites.slice(0, SITES_FOR_QUOTA);
  const siteStorage = (
    await Promise.allSettled(
      sample.map(async (site) => {
        try {
          const drive = await graphGet(tenantId, `/sites/${site.id}/drive`, { $select: 'id,quota' });
          return {
            displayName: site.displayName,
            webUrl: site.webUrl,
            createdDateTime: site.createdDateTime,
            storageBytes: drive.quota?.used ?? 0,
            storageMB: Math.round((drive.quota?.used ?? 0) / (1024 * 1024)),
            storageTotal: drive.quota?.total ?? 0,
            quotaState: drive.quota?.state ?? 'normal',
          };
        } catch {
          return null;
        }
      })
    )
  )
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    .sort((a, b) => b.storageBytes - a.storageBytes);

  if (siteStorage.length === 0) {
    return {
      collector: 'storage',
      score: 5,
      summary: { message: 'Drive quota data unavailable for all sampled sites.' },
      topSitesByStorage: [],
    };
  }

  const scored = scoreStorageSites(siteStorage);
  const { totalBytes, totalAllocatedBytes, concentrationRatio, top20PercentCount, score } = scored;
  const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024) * 10) / 10;

  logger.info({
    event: 'collector_done', collector: 'storage', tenantId,
    totalSites: sites.length, sampled: siteStorage.length,
    totalGB, concentrationRatio: Math.round(concentrationRatio * 100), score,
  });

  return {
    collector: 'storage',
    score,
    summary: {
      totalSites: sites.length,
      sitesSampled: siteStorage.length,
      totalStorageGB: totalGB,
      totalAllocatedGB: Math.round(totalAllocatedBytes / (1024 ** 3) * 10) / 10,
      utilizationPercent: totalAllocatedBytes > 0 ? Math.round((totalBytes / totalAllocatedBytes) * 100) : null,
      sitesNearing: siteStorage.filter((s) => s.quotaState === 'nearing').length,
      sitesCritical: siteStorage.filter((s) => s.quotaState === 'critical' || s.quotaState === 'exceeded').length,
      top20PercentSiteCount: top20PercentCount,
      top20PercentStoragePercent: Math.round(concentrationRatio * 100),
      note: sample.length < sites.length
        ? `Quota fetched for first ${sample.length} of ${sites.length} sites`
        : undefined,
    },
    topSitesByStorage: siteStorage.slice(0, 20),
  };
}

async function collectStorage(tenantId) {
  logger.info({ event: 'collector_start', collector: 'storage', tenantId });
  try {
    return await collectFromReport(tenantId);
  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status === 404 || err.reportUnusable) {
      logger.warn({ event: 'storage_report_unavailable', tenantId, status: status || 'csv' });
      return collectFromSearch(tenantId);
    }
    throw err;
  }
}

module.exports = { collectStorage };
