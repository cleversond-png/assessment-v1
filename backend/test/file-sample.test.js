const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  parseSiteUsageCsv,
  selectSitesForFileSample,
  sitePathFromUrl,
  buildReportCoverage,
} = require('../src/collectors/sharePoint/fileSample');

const HEADER = [
  'Report Refresh Date', 'Site Id', 'Site URL', 'Owner Display Name', 'Is Deleted',
  'Last Activity Date', 'File Count', 'Active File Count', 'Page View Count',
  'Visited Page Count', 'Storage Used (Byte)', 'Storage Allocated (Byte)',
  'Root Web Template', 'Owner Principal Name', 'Report Period',
].join(',');

function row(url, storage, deleted = 'False', owner = 'Ana') {
  return [
    '2026-10-01', 'site', url, owner, deleted,
    '2026-10-01', '10', '1', '0', '0', String(storage), '200', 'STS', 'ana@contoso.com', '7',
  ].join(',');
}

test('deleted sites and OneDrive stay out of the file sample', () => {
  const csv = [
    HEADER,
    row('https://contoso.sharepoint.com/sites/small', 100, 'False', '"Doe, Ana"'),
    row('https://contoso-my.sharepoint.com/personal/ana', 999),
    row('https://contoso.sharepoint.com/sites/gone', 5000, 'True'),
    row('https://contoso.sharepoint.com/sites/big', 800),
    row('https://contoso.sharepoint.com/', 50, 'FALSE'),
  ].join('\n');

  const selected = selectSitesForFileSample(parseSiteUsageCsv(csv));
  assert.deepEqual(selected.sites.map((s) => s.storageUsed), [800, 100, 50]);
  assert.equal(selected.sharePointSites, 3);
  assert.equal(selected.oneDriveSites, 1);
  assert.equal(selected.oneDriveStorageBytes, 999);
  assert.equal(selected.sites[1].siteUrl, 'https://contoso.sharepoint.com/sites/small');
});

test('only the 20 largest SharePoint sites are kept', () => {
  const lines = [HEADER];
  for (let i = 1; i <= 25; i++) {
    lines.push(row(`https://contoso.sharepoint.com/sites/s${i}`, i));
  }
  const selected = selectSitesForFileSample(parseSiteUsageCsv(lines.join('\n')));
  assert.equal(selected.sites.length, 20);
  assert.equal(selected.sharePointSites, 25);
  assert.equal(selected.sites[0].storageUsed, 25);
  assert.equal(selected.sites[19].storageUsed, 6);
});

test('site URL becomes the documented Graph path', () => {
  assert.equal(
    sitePathFromUrl('https://contoso.sharepoint.com/sites/marketing'),
    '/sites/contoso.sharepoint.com:/sites/marketing'
  );
  assert.equal(
    sitePathFromUrl('https://contoso.sharepoint.com/'),
    '/sites/contoso.sharepoint.com'
  );
  assert.equal(sitePathFromUrl('not a url'), null);
});

test('coverage names the report, the files read and excluded OneDrive', () => {
  const text = buildReportCoverage({
    opened: 2,
    sharePointSites: 10,
    filesRead: 40,
    truncated: 1,
    skipped: 0,
    notOpened: 0,
    totalCap: 20000,
    oneDriveSites: 3,
    oneDriveStorageBytes: 90,
  });
  assert.equal(
    text,
    'Relatório D7: 2 de 10 sites SharePoint abertos, 40 arquivos lidos, 1 site interrompido no limite. OneDrive pessoal fica fora da lista de nomes (3 sites, 90 bytes).'
  );
});
