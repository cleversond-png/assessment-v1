const axios = require('axios');
const { graphGet, graphGetAll, graphGetReportCsv } = require('../../graph/graphClient');
const tokenStore = require('../../auth/tokenStore');
const logger = require('../../logger');
const {
  REPORT_SITE_LIMIT,
  parseSiteUsageCsv,
  selectSitesForFileSample,
  sitePathFromUrl,
  buildReportCoverage,
  buildSearchCoverage,
} = require('./fileSample');

// Ranking: Reports.Read.All via getSharePointSiteUsageDetail.
// File metadata: Sites.Read.All and Files.Read.All. No file body is requested.
const LARGE_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const STALE_FILE_MONTHS = 12;
const REPORT_ITEMS_PER_SITE = 2000;
const REPORT_ITEMS_TOTAL = 20000;
const SEARCH_SITES = 5;
const SEARCH_ITEMS_PER_SITE = 1000;
const QUOTA_SAMPLE_CAP = 200;

const ITEM_SELECT = 'name,size,file,lastModifiedDateTime,parentReference,webUrl,shared';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSitesByStorage(tenantId) {
  const sites = await graphGetAll(tenantId, '/sites', {
    search: '*',
    $select: 'id,displayName,webUrl',
  });

  const siteSample = sites.slice(0, QUOTA_SAMPLE_CAP);
  const withQuota = await Promise.allSettled(
    siteSample.map(async (site) => {
      try {
        const drive = await graphGet(tenantId, `/sites/${site.id}/drive`, { $select: 'id,quota' });
        return { ...site, driveId: drive.id, storageBytes: drive.quota?.used ?? 0 };
      } catch {
        return { ...site, driveId: null, storageBytes: 0 };
      }
    })
  );

  return withQuota
    .filter((r) => r.status === 'fulfilled' && r.value.driveId)
    .map((r) => r.value)
    .sort((a, b) => b.storageBytes - a.storageBytes)
    .slice(0, SEARCH_SITES);
}

async function resolveRankedSites(tenantId, ranked) {
  const sites = [];
  let skipped = 0;
  for (const row of ranked) {
    const path = sitePathFromUrl(row.siteUrl);
    if (!path) {
      skipped += 1;
      continue;
    }
    try {
      const site = await graphGet(tenantId, path, { $select: 'id,displayName,webUrl' });
      const drive = await graphGet(tenantId, `/sites/${site.id}/drive`, { $select: 'id' });
      if (!site?.id || !drive?.id) {
        skipped += 1;
        continue;
      }
      sites.push({
        id: site.id,
        displayName: site.displayName,
        driveId: drive.id,
        storageBytes: row.storageUsed,
      });
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 404) {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return { sites, skipped };
}

async function enumerateDriveItems(tenantId, driveId, itemCap) {
  const allItems = [];
  let nextUrl = null;
  let truncated = false;
  let rateRetries = 3;

  try {
    const firstPage = await graphGet(
      tenantId,
      `/drives/${driveId}/root/delta`,
      { $select: ITEM_SELECT }
    );
    const items = firstPage.value ?? [];
    const room = Math.max(itemCap - allItems.length, 0);
    if (items.length > room) {
      allItems.push(...items.slice(0, room));
      truncated = true;
    } else {
      allItems.push(...items);
      nextUrl = firstPage['@odata.nextLink'] ?? null;
      if (firstPage['@odata.deltaLink']) nextUrl = null;
    }

    while (nextUrl && allItems.length < itemCap) {
      const entry = tokenStore.getToken(tenantId);
      if (!entry) break;
      try {
        const res = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${entry.accessToken}` },
          timeout: 30000,
        });
        const pageItems = res.data.value ?? [];
        const pageRoom = itemCap - allItems.length;
        if (pageItems.length > pageRoom) {
          allItems.push(...pageItems.slice(0, pageRoom));
          truncated = true;
          nextUrl = null;
        } else {
          allItems.push(...pageItems);
          nextUrl = res.data['@odata.nextLink'] ?? null;
        }
        rateRetries = 3;
      } catch (err) {
        if (err.response?.status === 429 && rateRetries > 0) {
          rateRetries -= 1;
          const wait = parseInt(err.response.headers['retry-after'] || '10', 10) * 1000;
          logger.warn({ event: 'rate_limited', path: 'drive_delta', waitMs: wait });
          await sleep(wait);
          continue;
        }
        throw err;
      }
    }
    if (nextUrl) truncated = true;
  } catch (err) {
    truncated = true;
    logger.warn({ event: 'files_drive_enum_failed', driveId, error: err.message });
  }

  return {
    items: allItems.filter((item) => item.file && !item.deleted),
    truncated,
    fetched: allItems.length,
  };
}

async function loadSample(tenantId) {
  let selected;
  try {
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
    selected = selectSitesForFileSample(rows, REPORT_SITE_LIMIT);
  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status === 404 || err.reportUnusable) {
      logger.warn({ event: 'files_report_unavailable', tenantId, status: status || 'csv' });
      const sites = await getSitesByStorage(tenantId);
      return {
        sites,
        itemCap: SEARCH_ITEMS_PER_SITE,
        totalCap: SEARCH_ITEMS_PER_SITE * SEARCH_SITES,
        meta: { source: 'search' },
      };
    }
    throw err;
  }

  const { sites, skipped } = await resolveRankedSites(tenantId, selected.sites);
  return {
    sites,
    itemCap: REPORT_ITEMS_PER_SITE,
    totalCap: REPORT_ITEMS_TOTAL,
    meta: {
      source: 'report',
      sharePointSites: selected.sharePointSites,
      oneDriveSites: selected.oneDriveSites,
      oneDriveStorageBytes: selected.oneDriveStorageBytes,
      skipped,
    },
  };
}

async function collectFiles(tenantId) {
  logger.info({ event: 'collector_start', collector: 'files', tenantId });

  let sample;
  try {
    sample = await loadSample(tenantId);
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 404) {
      logger.warn({ event: 'collector_unavailable', collector: 'files', tenantId });
      return {
        collector: 'files',
        score: 0,
        unavailable: true,
        reason: 'Sites.Read.All required for file metadata analysis.',
      };
    }
    throw err;
  }

  const { sites: topSites, itemCap, totalCap, meta } = sample;

  if (topSites.length === 0) {
    const coverage = meta.source === 'report'
      ? buildReportCoverage({ ...meta, opened: 0, filesRead: 0, truncated: 0, notOpened: 0, totalCap })
      : buildSearchCoverage({ opened: 0, itemCap, truncated: 0 });
    return {
      collector: 'files',
      score: 5,
      summary: {
        message: 'No sites with accessible drives found.',
        coverage,
        rankingSource: meta.source,
        oneDriveSitesExcluded: meta.oneDriveSites || 0,
        oneDriveStorageBytes: meta.oneDriveStorageBytes || 0,
      },
      largeFiles: [],
      duplicates: [],
      staleFiles: [],
    };
  }

  const now = Date.now();
  const staleMs = STALE_FILE_MONTHS * 30 * 24 * 60 * 60 * 1000;

  const largeFiles = [];
  const staleFiles = [];
  const hashMap = new Map();
  const nameSizeMap = new Map();
  let totalFilesScanned = 0;
  let sharedFilesCount = 0;
  let anonymousSharedCount = 0;
  let remaining = totalCap;
  let truncatedSites = 0;
  let opened = 0;
  let notOpened = 0;

  for (const site of topSites) {
    if (remaining <= 0) {
      notOpened += 1;
      continue;
    }
    const cap = Math.min(itemCap, remaining);
    const page = await enumerateDriveItems(tenantId, site.driveId, cap);
    opened += 1;
    remaining -= page.fetched;
    if (page.truncated) truncatedSites += 1;
    const items = page.items;
    totalFilesScanned += items.length;

    for (const item of items) {
      const sizeBytes = item.size ?? 0;
      const lastMod = item.lastModifiedDateTime
        ? new Date(item.lastModifiedDateTime).getTime()
        : 0;
      const ref = { name: item.name, sizeBytes, webUrl: item.webUrl, site: site.displayName };

      if (item.shared) {
        sharedFilesCount++;
        if (item.shared.scope === 'anonymous') anonymousSharedCount++;
      }

      if (sizeBytes > LARGE_FILE_BYTES) {
        largeFiles.push({ ...ref, lastModifiedDateTime: item.lastModifiedDateTime });
      }

      if (lastMod && now - lastMod > staleMs) {
        staleFiles.push({ ...ref, lastModifiedDateTime: item.lastModifiedDateTime });
      }

      const hash = item.file?.hashes?.quickXorHash;
      if (hash) {
        if (!hashMap.has(hash)) hashMap.set(hash, []);
        hashMap.get(hash).push(ref);
      } else {
        const key = `${item.name}|${sizeBytes}`;
        if (!nameSizeMap.has(key)) nameSizeMap.set(key, []);
        nameSizeMap.get(key).push(ref);
      }
    }
  }

  const duplicateGroups = [];
  for (const [, copies] of hashMap) {
    if (copies.length > 1) {
      const wasted = copies[0].sizeBytes * (copies.length - 1);
      duplicateGroups.push({ copies: copies.length, wastedBytes: wasted, files: copies });
    }
  }
  for (const [, copies] of nameSizeMap) {
    if (copies.length > 1) {
      const wasted = copies[0].sizeBytes * (copies.length - 1);
      duplicateGroups.push({ copies: copies.length, wastedBytes: wasted, files: copies, matchType: 'name+size' });
    }
  }
  duplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);

  const totalWastedBytes = duplicateGroups.reduce((s, g) => s + g.wastedBytes, 0);

  largeFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
  staleFiles.sort((a, b) => new Date(a.lastModifiedDateTime) - new Date(b.lastModifiedDateTime));

  let score = 5;
  const staleRatio = totalFilesScanned > 0 ? staleFiles.length / totalFilesScanned : 0;
  const dupRatio = totalFilesScanned > 0
    ? duplicateGroups.reduce((s, g) => s + g.copies - 1, 0) / totalFilesScanned
    : 0;

  if (staleRatio > 0.50) score -= 1.5;
  else if (staleRatio > 0.25) score -= 1;
  else if (staleRatio > 0.10) score -= 0.5;

  if (largeFiles.length > 50) score -= 1.5;
  else if (largeFiles.length > 20) score -= 1;
  else if (largeFiles.length > 5) score -= 0.5;

  if (dupRatio > 0.30) score -= 1;
  else if (dupRatio > 0.15) score -= 0.5;
  else if (dupRatio > 0.05) score -= 0.25;

  score = Math.max(Math.round(score * 10) / 10, 0);

  const coverage = meta.source === 'report'
    ? buildReportCoverage({
      ...meta,
      opened,
      filesRead: totalFilesScanned,
      truncated: truncatedSites,
      notOpened,
      totalCap,
    })
    : buildSearchCoverage({ opened, itemCap, truncated: truncatedSites });

  logger.info({
    event: 'collector_done', collector: 'files', tenantId,
    sitesSampled: opened, totalFilesScanned,
    largeFiles: largeFiles.length, duplicateGroups: duplicateGroups.length,
    staleFiles: staleFiles.length, score, rankingSource: meta.source,
  });

  return {
    collector: 'files',
    score,
    summary: {
      sitesSampled: opened,
      sharePointSites: meta.sharePointSites,
      totalFilesScanned,
      sharedFilesCount,
      anonymousSharedCount,
      sharedFilesRatioPercent: totalFilesScanned > 0 ? Math.round((sharedFilesCount / totalFilesScanned) * 100) : 0,
      largeFilesCount: largeFiles.length,
      duplicateGroupsCount: duplicateGroups.length,
      estimatedWastedBytes: totalWastedBytes,
      staleFilesCount: staleFiles.length,
      staleFilesRatioPercent: Math.round(staleRatio * 100),
      largeFileThresholdMB: 100,
      stalePeriodMonths: STALE_FILE_MONTHS,
      sitesTruncated: truncatedSites,
      rankingSource: meta.source,
      oneDriveSitesExcluded: meta.oneDriveSites || 0,
      oneDriveStorageBytes: meta.oneDriveStorageBytes || 0,
      coverage,
    },
    largeFiles: largeFiles.slice(0, 20),
    duplicates: duplicateGroups.slice(0, 20),
    staleFiles: staleFiles.slice(0, 20),
  };
}

module.exports = { collectFiles };
