const REPORT_SITE_LIMIT = 20;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

function parseSiteUsageCsv(csv) {
  if (typeof csv !== 'string' || csv.trim().length < 10) return null;
  const table = parseCsv(csv);
  if (table.length < 2) return null;
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const col = (name) => headers.indexOf(name);
  const urlCol = col('site url');
  const storageCol = col('storage used (byte)');
  if (urlCol < 0 || storageCol < 0) return null;
  const deletedCol = col('is deleted');
  const filesCol = col('file count');
  return table.slice(1).map((cells) => ({
    siteUrl: (cells[urlCol] || '').trim(),
    isDeleted: deletedCol >= 0 ? (cells[deletedCol] || '').trim() : '',
    storageUsed: Number(String(cells[storageCol] || '').replace(/,/g, '')) || 0,
    fileCount: filesCol >= 0 ? (Number(cells[filesCol]) || 0) : 0,
  }));
}

function isDeleted(value) {
  return /^(true|yes|1)$/i.test(String(value || '').trim());
}

function isPersonalOneDrive(siteUrl) {
  try {
    return new URL(siteUrl).hostname.toLowerCase().includes('-my.sharepoint.com');
  } catch {
    return false;
  }
}

function selectSitesForFileSample(rows, limit = REPORT_SITE_LIMIT) {
  let oneDriveSites = 0;
  let oneDriveStorageBytes = 0;
  const sharePoint = [];
  for (const row of rows) {
    if (isDeleted(row.isDeleted)) continue;
    const siteUrl = String(row.siteUrl || '').trim();
    if (!siteUrl) continue;
    const storageUsed = Number(row.storageUsed) || 0;
    if (isPersonalOneDrive(siteUrl)) {
      oneDriveSites += 1;
      oneDriveStorageBytes += storageUsed;
      continue;
    }
    sharePoint.push({
      siteUrl,
      storageUsed,
      fileCount: Number(row.fileCount) || 0,
    });
  }
  sharePoint.sort((a, b) => b.storageUsed - a.storageUsed);
  return {
    sites: sharePoint.slice(0, limit),
    sharePointSites: sharePoint.length,
    oneDriveSites,
    oneDriveStorageBytes,
  };
}

// GET /sites/{hostname}:/{server-relative-path}
// Root site: GET /sites/{hostname}
function sitePathFromUrl(siteUrl) {
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (!host) return null;
  const parts = url.pathname.split('/').filter(Boolean).map(encodeURIComponent);
  if (parts.length === 0) return `/sites/${host}`;
  return `/sites/${host}:/${parts.join('/')}`;
}

function countPhrase(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function buildReportCoverage(meta) {
  const parts = [
    `Relatório D7: ${meta.opened} de ${meta.sharePointSites} sites SharePoint abertos`,
    `${meta.filesRead} arquivos lidos`,
  ];
  if (meta.truncated) parts.push(countPhrase(meta.truncated, 'site interrompido no limite', 'sites interrompidos no limite'));
  if (meta.skipped) parts.push(countPhrase(meta.skipped, 'site sem drive', 'sites sem drive'));
  if (meta.notOpened) parts.push(countPhrase(meta.notOpened, `site não aberto pelo limite de ${meta.totalCap} itens`, `sites não abertos pelo limite de ${meta.totalCap} itens`));
  let text = parts.join(', ');
  if (meta.oneDriveSites) {
    text += `. OneDrive pessoal fica fora da lista de nomes (${meta.oneDriveSites} sites, ${meta.oneDriveStorageBytes} bytes)`;
  }
  return `${text}.`;
}

function buildSearchCoverage(meta) {
  let text = `Ranking pelo início da busca de sites, porque o relatório de uso não está disponível: ${meta.opened} sites, até ${meta.itemCap} itens por site`;
  if (meta.truncated) text += `, ${countPhrase(meta.truncated, 'site interrompido no limite', 'sites interrompidos no limite')}`;
  return `${text}.`;
}

module.exports = {
  REPORT_SITE_LIMIT,
  parseSiteUsageCsv,
  selectSitesForFileSample,
  sitePathFromUrl,
  buildReportCoverage,
  buildSearchCoverage,
};
