const { isDeleted, isPersonalOneDrive } = require('./fileSample');

function siteLabel(siteUrl) {
  try {
    const parts = new URL(siteUrl).pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'Site raiz';
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return 'Site';
  }
}

function concentrationScore(ratio) {
  if (ratio <= 0.40) return 5;
  if (ratio <= 0.55) return 4;
  if (ratio <= 0.70) return 3;
  if (ratio <= 0.85) return 2;
  if (ratio <= 0.95) return 1;
  return 0;
}

function scoreStorageSites(sites) {
  const totalBytes = sites.reduce((sum, site) => sum + (site.storageBytes || 0), 0);
  const totalAllocatedBytes = sites.reduce((sum, site) => sum + (site.storageTotal || 0), 0);
  if (sites.length === 0 || totalBytes === 0) {
    return {
      score: 5,
      totalBytes,
      totalAllocatedBytes,
      concentrationRatio: 0,
      top20PercentCount: 0,
    };
  }
  const top20PercentCount = Math.max(1, Math.ceil(sites.length * 0.2));
  const top20Bytes = sites
    .slice(0, top20PercentCount)
    .reduce((sum, site) => sum + (site.storageBytes || 0), 0);
  const concentrationRatio = top20Bytes / totalBytes;
  return {
    score: concentrationScore(concentrationRatio),
    totalBytes,
    totalAllocatedBytes,
    concentrationRatio,
    top20PercentCount,
  };
}

function summarizeSiteStorage(rows) {
  let oneDriveSites = 0;
  let oneDriveStorageBytes = 0;
  const sites = [];
  for (const row of rows) {
    if (isDeleted(row.isDeleted)) continue;
    const siteUrl = String(row.siteUrl || '').trim();
    if (!siteUrl) continue;
    const storageBytes = Number(row.storageUsed) || 0;
    if (isPersonalOneDrive(siteUrl)) {
      oneDriveSites += 1;
      oneDriveStorageBytes += storageBytes;
      continue;
    }
    sites.push({
      displayName: siteLabel(siteUrl),
      webUrl: siteUrl,
      storageBytes,
      storageMB: Math.round(storageBytes / (1024 * 1024)),
      storageTotal: Number(row.storageAllocated) || 0,
    });
  }
  sites.sort((a, b) => b.storageBytes - a.storageBytes);
  return {
    ...scoreStorageSites(sites),
    sites,
    oneDriveSites,
    oneDriveStorageBytes,
    sharePointSites: sites.length,
  };
}

module.exports = { concentrationScore, scoreStorageSites, summarizeSiteStorage };
