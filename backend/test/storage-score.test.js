const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseSiteUsageCsv } = require('../src/collectors/sharePoint/fileSample');
const { summarizeSiteStorage } = require('../src/collectors/sharePoint/storageScore');

const HEADER = [
  'Report Refresh Date', 'Site Id', 'Site URL', 'Owner Display Name', 'Is Deleted',
  'Last Activity Date', 'File Count', 'Active File Count', 'Page View Count',
  'Visited Page Count', 'Storage Used (Byte)', 'Storage Allocated (Byte)',
  'Root Web Template', 'Owner Principal Name', 'Report Period',
].join(',');

function row(url, used, allocated, deleted = 'False') {
  return [
    '2026-10-01', 'site', url, 'Ana', deleted,
    '2026-10-01', '1', '1', '0', '0', String(used), String(allocated), 'STS', 'ana@contoso.com', '7',
  ].join(',');
}

test('storage concentration uses every SharePoint site and skips OneDrive', () => {
  const csv = [
    HEADER,
    row('https://contoso.sharepoint.com/sites/big', 900, 1000),
    row('https://contoso.sharepoint.com/sites/small', 100, 1000),
    row('https://contoso-my.sharepoint.com/personal/ana', 5000, 8000),
    row('https://contoso.sharepoint.com/sites/gone', 9000, 9000, 'True'),
  ].join('\n');

  const summary = summarizeSiteStorage(parseSiteUsageCsv(csv));
  assert.equal(summary.sharePointSites, 2);
  assert.equal(summary.oneDriveSites, 1);
  assert.equal(summary.oneDriveStorageBytes, 5000);
  assert.equal(summary.top20PercentCount, 1);
  assert.equal(summary.score, 1);
  assert.equal(summary.sites[0].displayName, 'big');
  assert.equal(summary.totalAllocatedBytes, 2000);
});

test('even SharePoint storage scores 5', () => {
  const lines = [HEADER];
  for (let i = 1; i <= 5; i++) {
    lines.push(row(`https://contoso.sharepoint.com/sites/s${i}`, 10, 20));
  }
  const summary = summarizeSiteStorage(parseSiteUsageCsv(lines.join('\n')));
  assert.equal(summary.score, 5);
  assert.equal(summary.top20PercentCount, 1);
});
