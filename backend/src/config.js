require('dotenv').config();

const REQUIRED_VARS = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_REDIRECT_URI'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Aceita Directory ID (UUID) ou domínio inicial do tenant *.onmicrosoft.com
const TENANT_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9-]+\.onmicrosoft\.com)$/i;

function isValidPasswordHash(value) {
  const parts = String(value || '').split(':');
  if (parts.length !== 4) return false;
  const [scheme, iterationsRaw, salt, expectedHex] = parts;
  if (scheme !== 'pbkdf2') return false;
  if (!/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(expectedHex)) return false;
  const iterations = Number(iterationsRaw);
  return Number.isInteger(iterations) && String(iterations) === iterationsRaw && iterations >= 100000;
}

function validateConfig() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (!process.env.PORTAL_ADMIN_PASSWORD_HASH) missing.push('PORTAL_ADMIN_PASSWORD_HASH');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (!UUID_RE.test(process.env.AZURE_CLIENT_ID)) {
    throw new Error(
      `AZURE_CLIENT_ID must be a valid UUID (got: "${process.env.AZURE_CLIENT_ID}"). ` +
      `Copy the "Application (client) ID" from the Azure Portal App Registration overview.`
    );
  }
  if (!isValidPasswordHash(process.env.PORTAL_ADMIN_PASSWORD_HASH)) {
    throw new Error('PORTAL_ADMIN_PASSWORD_HASH must be a pbkdf2 hash with at least 100000 iterations');
  }
}

module.exports = {
  validateConfig,
  TENANT_RE,
  UUID_RE,
  azure: {
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    redirectUri: process.env.AZURE_REDIRECT_URI,
    authority: 'https://login.microsoftonline.com',
    graphScope: 'https://graph.microsoft.com/.default',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
};
