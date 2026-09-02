const express = require('express');
const { READ_ONLY_SCOPES, READ_WRITE_SCOPES } = require('../services/api-tokens');

function createApiTokenAdminRouter({ requireApiAdmin, validateCSRFToken, adminApiLimiter, tokenService }) {
  const router = express.Router();
  router.use(adminApiLimiter, requireApiAdmin);

  router.get('/', async (req, res) => {
    try {
      res.json(await tokenService.listTokens());
    } catch (error) {
      console.error('API token listing failed:', error.message);
      res.status(500).json({ error: 'Unable to list API tokens' });
    }
  });

  router.post('/', validateCSRFToken, async (req, res) => {
    try {
      const access = req.body?.access;
      if (!['read_only', 'read_write'].includes(access)) {
        return res.status(400).json({ error: 'Access must be read_only or read_write' });
      }
      const token = await tokenService.createToken({
        userId: Number(req.body?.user_id),
        name: req.body?.name,
        scopes: access === 'read_write' ? READ_WRITE_SCOPES : READ_ONLY_SCOPES,
        expiresDays: Number(req.body?.expires_days)
      });
      res.status(201).json({
        message: 'API token created. Copy it now; it will not be shown again.',
        token
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/:id', validateCSRFToken, async (req, res) => {
    try {
      const revoked = await tokenService.revokeToken(Number(req.params.id));
      if (!revoked) return res.status(404).json({ error: 'Active token not found' });
      res.json({ message: 'API token revoked' });
    } catch (error) {
      console.error('API token revocation failed:', error.message);
      res.status(500).json({ error: 'Unable to revoke API token' });
    }
  });

  router.get('/audit/recent', async (req, res) => {
    try {
      const requested = Number(req.query.limit || 50);
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 200) : 50;
      const logs = await tokenService.listAudit(limit);
      res.json({ logs });
    } catch (error) {
      console.error('API audit listing failed:', error.message);
      res.status(500).json({ error: 'Unable to list API activity' });
    }
  });

  return router;
}

module.exports = { createApiTokenAdminRouter };
