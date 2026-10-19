const { execFile } = require('child_process');
const axios = require('axios');
const logger = require('../logger');

const DEFAULT_RESOURCE_GROUP = 'EDUGEST-ZERO_TRUST';
const ARM_RESOURCE = 'https://management.azure.com/';
const ARM_API_VERSION = '2021-04-01';
const WEB_API_VERSION = '2022-03-01';
const CONTAINER_APP_API_VERSION = '2023-05-01';
const POSTGRES_API_VERSION = '2022-12-01';
const COST_API_VERSION = '2023-03-01';

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || process.env.AZURE_ENV_SUBSCRIPTION_ID;
const currentSiteName = process.env.WEBSITE_SITE_NAME || null;
const allowSelfStop = process.env.AZURE_ENV_ALLOW_SELF_STOP === 'true';

function isEnvironmentControlAllowed() {
  return process.env.AZURE_ENV_ALLOW_CONTROL === 'true';
}

const ENVIRONMENTS = [
  {
    id: 'assessment',
    label: 'EDUGEST - ASSESSMENT',
    resourceGroupName: process.env.AZURE_ENV_RESOURCE_GROUP || DEFAULT_RESOURCE_GROUP,
  },
  {
    id: 'super-admin',
    label: 'EDUGEST - SUPER ADMIN',
    resourceGroupName: process.env.AZURE_SUPER_ADMIN_RESOURCE_GROUP || 'rg-edugest-prod-eus2',
  },
];

function requireAzureScope() {
  if (!subscriptionId) {
    throw new Error('AZURE_SUBSCRIPTION_ID or AZURE_ENV_SUBSCRIPTION_ID is required for environment operations');
  }
}

function execAz(args) {
  return new Promise((resolve, reject) => {
    execFile('az', args, { timeout: 20000 }, (error, stdout, stderr) => {
      if (error) {
        error.message = stderr?.trim() || error.message;
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function getManagedIdentityToken() {
  if (process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER) {
    const url = new URL(process.env.IDENTITY_ENDPOINT);
    url.searchParams.set('api-version', '2019-08-01');
    url.searchParams.set('resource', ARM_RESOURCE);

    const res = await axios.get(url.toString(), {
      headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER },
      timeout: 10000,
    });
    return res.data.access_token;
  }

  const res = await axios.get('http://169.254.169.254/metadata/identity/oauth2/token', {
    params: { 'api-version': '2018-02-01', resource: ARM_RESOURCE },
    headers: { Metadata: 'true' },
    timeout: 5000,
  });
  return res.data.access_token;
}

async function getArmToken() {
  try {
    return await getManagedIdentityToken();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    const stdout = await execAz(['account', 'get-access-token', '--resource', ARM_RESOURCE, '--query', 'accessToken', '-o', 'tsv']);
    return stdout;
  }
}

async function armRequest(method, path, body) {
  requireAzureScope();
  const token = await getArmToken();
  const url = `${ARM_RESOURCE}${path.replace(/^\//, '')}`;
  const res = await axios.request({
    method,
    url,
    data: body,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });
  return res.data;
}

function isStartStopCapable(resource) {
  return [
    'microsoft.web/sites',
    'microsoft.app/containerapps',
    'microsoft.dbforpostgresql/flexibleservers',
  ].includes(resource.type?.toLowerCase());
}

function normalizeResource(resource, stateById = {}) {
  const state = stateById[resource.id] || resource.properties?.state || null;
  const type = resource.type?.toLowerCase();
  const selfHosted = Boolean(currentSiteName && resource.name === currentSiteName && type === 'microsoft.web/sites');
  const blockedSelfStop = selfHosted && !allowSelfStop;
  const running = state === 'Running' || state === 'Ready';
  const stopped = state === 'Stopped' || state === 'Disabled';
  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    kind: resource.kind || null,
    location: resource.location,
    state,
    selfHosted,
    startStopCapable: isStartStopCapable(resource),
    canStart: isEnvironmentControlAllowed() && isStartStopCapable(resource) && stopped && !blockedSelfStop,
    canStop: isEnvironmentControlAllowed() && isStartStopCapable(resource) && running && !blockedSelfStop,
  };
}

function resolveEnvironment(environmentId = 'assessment') {
  const environment = ENVIRONMENTS.find((item) => item.id === environmentId);
  if (!environment) throw new Error('Unknown environment');
  return environment;
}

function resourceApiVersion(resource) {
  const type = resource.type?.toLowerCase();
  if (type === 'microsoft.web/sites') return WEB_API_VERSION;
  if (type === 'microsoft.app/containerapps') return CONTAINER_APP_API_VERSION;
  if (type === 'microsoft.dbforpostgresql/flexibleservers') return POSTGRES_API_VERSION;
  return ARM_API_VERSION;
}

function readResourceState(detail) {
  const type = detail.type?.toLowerCase();
  if (type === 'microsoft.web/sites') return detail.properties?.state || null;
  if (type === 'microsoft.app/containerapps') {
    return detail.properties?.runningStatus || detail.properties?.provisioningState || null;
  }
  if (type === 'microsoft.dbforpostgresql/flexibleservers') return detail.properties?.state || null;
  return detail.properties?.state || null;
}

async function listEnvironmentResources(environmentId = 'assessment') {
  const environment = resolveEnvironment(environmentId);
  const { resourceGroupName } = environment;
  const listPath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/resources?api-version=${ARM_API_VERSION}`;
  const resources = (await armRequest('GET', listPath)).value || [];
  const controllableResources = resources.filter(isStartStopCapable);
  const statePairs = await Promise.all(controllableResources.map(async (resource) => {
    try {
      const path = `${resource.id}?api-version=${resourceApiVersion(resource)}`;
      const detail = await armRequest('GET', path);
      return [resource.id, readResourceState(detail)];
    } catch (err) {
      logger.warn({ event: 'environment_resource_state_failed', resourceId: resource.id, error: err.message });
      return [resource.id, null];
    }
  }));
  const stateById = Object.fromEntries(statePairs);

  return {
    id: environment.id,
    label: environment.label,
    subscriptionId,
    resourceGroupName,
    resources: resources.map((resource) => normalizeResource(resource, stateById)),
  };
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

function parseCostRows(data) {
  const columns = data?.properties?.columns || [];
  const rows = data?.properties?.rows || [];
  const totalIndex = columns.findIndex((c) => c.name === 'PreTaxCost' || c.name === 'Cost');
  const currencyIndex = columns.findIndex((c) => c.name === 'Currency');
  const total = rows.reduce((sum, row) => sum + Number(row[totalIndex] || 0), 0);
  const currency = rows.find((row) => row[currencyIndex])?.[currencyIndex] || null;

  return {
    total: Math.round(total * 100) / 100,
    currency,
    rows: rows.map((row) => Object.fromEntries(columns.map((col, index) => [col.name, row[index]]))),
  };
}

async function getEnvironmentBilling(environmentId = 'assessment') {
  const environment = resolveEnvironment(environmentId);
  const range = currentMonthRange();
  const path = `/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${COST_API_VERSION}`;
  const body = {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: { from: range.from, to: range.to },
    dataset: {
      granularity: 'None',
      aggregation: {
        PreTaxCost: { name: 'PreTaxCost', function: 'Sum' },
      },
      filter: {
        dimensions: {
          name: 'ResourceGroupName',
          operator: 'In',
          values: [environment.resourceGroupName],
        },
      },
      grouping: [
        { type: 'Dimension', name: 'ServiceName' },
        { type: 'Dimension', name: 'ResourceLocation' },
      ],
    },
  };

  const data = await armRequest('POST', path, body);
  return {
    id: environment.id,
    label: environment.label,
    subscriptionId,
    resourceGroupName: environment.resourceGroupName,
    period: range,
    ...parseCostRows(data),
  };
}

async function getEnvironment(environmentId) {
  const [inventory, billing] = await Promise.all([
    listEnvironmentResources(environmentId),
    getEnvironmentBilling(environmentId).catch((err) => ({ unavailable: true, error: err.message })),
  ]);
  return { ...inventory, billing };
}

async function listEnvironments() {
  const environments = await Promise.all(ENVIRONMENTS.map((environment) => getEnvironment(environment.id)));
  return { subscriptionId, environments };
}

async function controlResource(environmentId, resourceName, action) {
  if (!isEnvironmentControlAllowed()) {
    const error = new Error('Start/stop desativado.');
    error.statusCode = 403;
    throw error;
  }
  if (!['start', 'stop'].includes(action)) throw new Error('Invalid action');
  const resources = await listEnvironmentResources(environmentId);
  const target = resources.resources.find((resource) => (
    resource.name === resourceName && resource.startStopCapable
  ));
  if (!target) throw new Error('Start/stop is only allowed for supported resources in the configured environment');
  if (target.selfHosted && action === 'stop' && !allowSelfStop) {
    throw new Error('Self-stop is blocked for the portal host. Set AZURE_ENV_ALLOW_SELF_STOP=true only if another control plane can start it again.');
  }
  if ((action === 'start' && !target.canStart) || (action === 'stop' && !target.canStop)) {
    throw new Error(`Resource ${target.name} cannot ${action} from current state ${target.state || 'unknown'}`);
  }

  const path = `${target.id}/${action}?api-version=${resourceApiVersion(target)}`;
  await armRequest('POST', path);
  logger.info({
    event: 'environment_resource_action',
    environmentId,
    resourceGroupName: resources.resourceGroupName,
    resourceName,
    resourceType: target.type,
    action,
  });
  return getEnvironment(environmentId);
}

module.exports = {
  listEnvironments,
  getEnvironment,
  listEnvironmentResources,
  getEnvironmentBilling,
  controlResource,
  isEnvironmentControlAllowed,
};
