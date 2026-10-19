const express = require('express');
const {
  listEnvironments,
  getEnvironment,
  getEnvironmentBilling,
  controlResource,
  isEnvironmentControlAllowed,
} = require('../azure/environmentService');
const logger = require('../logger');

const router = express.Router();

function handleEnvironmentError(res, err, event) {
  logger.error({ event, error: err.message });
  res.status(err.statusCode || 500).json({ error: err.message });
}

router.get('/', async (_req, res) => {
  try {
    res.json(await listEnvironments());
  } catch (err) {
    handleEnvironmentError(res, err, 'environment_fetch_failed');
  }
});

router.get('/:environmentId', async (req, res) => {
  try {
    res.json(await getEnvironment(req.params.environmentId));
  } catch (err) {
    handleEnvironmentError(res, err, 'environment_fetch_failed');
  }
});

router.get('/:environmentId/billing', async (req, res) => {
  try {
    res.json(await getEnvironmentBilling(req.params.environmentId));
  } catch (err) {
    handleEnvironmentError(res, err, 'environment_billing_failed');
  }
});

router.post('/:environmentId/resources/:name/:action', async (req, res) => {
  if (!isEnvironmentControlAllowed()) {
    return res.status(403).json({ error: 'Start/stop desativado.' });
  }
  try {
    const updated = await controlResource(req.params.environmentId, req.params.name, req.params.action);
    res.json(updated);
  } catch (err) {
    handleEnvironmentError(res, err, 'environment_action_failed');
  }
});

module.exports = router;
