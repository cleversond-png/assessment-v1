const axios = require('axios');
const tokenStore = require('../auth/tokenStore');
const logger = require('../logger');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';

function getAuthHeader(tenantId) {
  const entry = tokenStore.getToken(tenantId);
  if (!entry) throw new Error(`No valid token for tenant ${tenantId}`);
  return { Authorization: `Bearer ${entry.accessToken}` };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphGet(tenantId, path, params = {}, opts = {}) {
  const { retries = 3, extraHeaders = {}, timeout = 30000 } = opts;
  try {
    const res = await axios.get(`${GRAPH_BASE}${path}`, {
      headers: { ...getAuthHeader(tenantId), ...extraHeaders },
      params,
      timeout,
    });
    return res.data;
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      const wait = parseInt(err.response.headers['retry-after'] || '10', 10) * 1000;
      logger.warn({ event: 'rate_limited', path, waitMs: wait });
      await sleep(wait);
      return graphGet(tenantId, path, params, { ...opts, retries: retries - 1 });
    }
    const detail = err.response?.data?.error || err.message;
    logger.error({ event: 'graph_error', path, detail });
    throw err;
  }
}

// Auto-paginate: follows @odata.nextLink until exhausted
async function graphGetAll(tenantId, path, params = {}, { maxRateLimitRetries = 10 } = {}) {
  const results = [];
  let nextUrl = `${GRAPH_BASE}${path}`;
  let firstRequest = true;
  let rateLimitHits = 0;

  while (nextUrl) {
    try {
      const res = await axios.get(nextUrl, {
        headers: getAuthHeader(tenantId),
        params: firstRequest ? params : undefined,
        timeout: 30000,
      });
      results.push(...(res.data.value || []));
      nextUrl = res.data['@odata.nextLink'] || null;
      firstRequest = false;
    } catch (err) {
      if (err.response?.status === 429) {
        rateLimitHits++;
        if (rateLimitHits > maxRateLimitRetries) {
          logger.error({ event: 'rate_limit_max_retries_exceeded', path, rateLimitHits });
          throw new Error(`Rate limit exceeded after ${maxRateLimitRetries} retries on ${path}`);
        }
        const wait = parseInt(err.response.headers['retry-after'] || '10', 10) * 1000;
        logger.warn({ event: 'rate_limited', path, waitMs: wait, attempt: rateLimitHits });
        await sleep(wait);
        continue;
      }
      const detail = err.response?.data?.error || err.message;
      logger.error({ event: 'graph_paginate_error', path, detail });
      throw err;
    }
  }

  return results;
}

async function graphGetBeta(tenantId, path, params = {}, retries = 3) {
  try {
    const res = await axios.get(`${GRAPH_BETA}${path}`, {
      headers: getAuthHeader(tenantId),
      params,
      timeout: 30000,
    });
    return res.data;
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      const wait = parseInt(err.response.headers['retry-after'] || '10', 10) * 1000;
      logger.warn({ event: 'rate_limited', path: `beta:${path}`, waitMs: wait });
      await sleep(wait);
      return graphGetBeta(tenantId, path, params, retries - 1);
    }
    const detail = err.response?.data?.error || err.message;
    logger.error({ event: 'graph_error', path: `beta:${path}`, detail });
    throw err;
  }
}

// Usage reports answer 302 with a preauthenticated file URL.
// The Graph token stays on the first request and is not sent to that host.
async function graphGetReportCsv(tenantId, path, retries = 3) {
  try {
    const res = await axios.get(`${GRAPH_BASE}${path}`, {
      headers: getAuthHeader(tenantId),
      maxRedirects: 0,
      timeout: 30000,
      validateStatus: (status) => status === 200 || status === 302,
      responseType: 'text',
      transformResponse: [(data) => data],
    });
    if (res.status === 302) {
      const location = res.headers.location;
      if (!location || !/^https:\/\//i.test(location)) {
        const error = new Error('Redirect do relatório sem URL https');
        error.reportUnusable = true;
        throw error;
      }
      try {
        const file = await axios.get(location, {
          timeout: 60000,
          responseType: 'text',
          transformResponse: [(data) => data],
          maxRedirects: 5,
        });
        return file.data;
      } catch (err) {
        err.reportUnusable = true;
        throw err;
      }
    }
    return res.data;
  } catch (err) {
    if (err.reportUnusable) {
      logger.warn({ event: 'report_download_failed', path });
      throw err;
    }
    if (err.response?.status === 429 && retries > 0) {
      const wait = parseInt(err.response.headers['retry-after'] || '10', 10) * 1000;
      logger.warn({ event: 'rate_limited', path, waitMs: wait });
      await sleep(wait);
      return graphGetReportCsv(tenantId, path, retries - 1);
    }
    const detail = err.response?.data?.error || err.message;
    logger.error({ event: 'graph_error', path, detail });
    throw err;
  }
}

module.exports = { graphGet, graphGetAll, graphGetBeta, graphGetReportCsv };
