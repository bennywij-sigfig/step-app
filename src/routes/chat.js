const express = require('express');
const crypto = require('crypto');
const { ALLOWED_TONES } = require('../services/chat-intent');
const { isValidDate } = require('../utils/validation');

const MESSAGE_LIMIT = 2000;
const PLAN_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_PLANS = 5;

function createChatRouter({
  requireApiAuth,
  validateCSRFToken,
  chatApiLimiter,
  chatGlobalHourlyLimiter = (req, res, next) => next(),
  chatGlobalDailyLimiter = (req, res, next) => next(),
  provider,
  service,
  now = () => Date.now()
}) {
  const router = express.Router();

  function applyClientDateContext(context, body) {
    const clientDate = body?.client_date;
    const clientTimezone = body?.client_timezone;
    if (!isValidDate(clientDate) || typeof clientTimezone !== 'string' || clientTimezone.length > 64) return context;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: clientTimezone }).format(new Date());
      const serverDate = Date.parse(`${context.currentDate}T00:00:00Z`);
      const browserDate = Date.parse(`${clientDate}T00:00:00Z`);
      if (Math.abs(serverDate - browserDate) > 2 * 86400000) return context;
      return { ...context, currentDate: clientDate, timezone: clientTimezone };
    } catch (_) {
      return context;
    }
  }

  function prunePlans(req) {
    const currentTime = now();
    const plans = req.session.stepChatPlans || {};
    for (const [id, plan] of Object.entries(plans)) {
      if (!plan || plan.expiresAt <= currentTime) delete plans[id];
    }
    const remaining = Object.entries(plans).sort((a, b) => b[1].createdAt - a[1].createdAt);
    for (const [id] of remaining.slice(MAX_SESSION_PLANS)) delete plans[id];
    req.session.stepChatPlans = plans;
    return plans;
  }

  router.get('/config', requireApiAuth, (req, res) => {
    res.json({
      enabled: provider.isConfigured(),
      provider: provider.isConfigured() ? provider.provider : null,
      model: provider.isConfigured() ? provider.model : null,
      message_limit: MESSAGE_LIMIT,
      batch_limit: service.MAX_BATCH_SIZE,
      history: 'browser-session-only',
      transcript_scope: String(req.session.userId)
    });
  });

  router.post('/', requireApiAuth, validateCSRFToken, chatGlobalDailyLimiter, chatGlobalHourlyLimiter, chatApiLimiter, async (req, res) => {
    const message = req.body?.message;
    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Enter a message' });
    }
    if (message.length > MESSAGE_LIMIT) {
      return res.status(400).json({ error: `Messages are limited to ${MESSAGE_LIMIT} characters` });
    }

    try {
      const serverContext = await service.getContext();
      const context = applyClientDateContext(serverContext, req.body);
      const intent = await provider.interpret(message.trim(), context);
      if (ALLOWED_TONES.has(req.body?.tone)) intent.tone = req.body.tone;
      const result = await service.executeIntent(req.session.userId, intent);

      if (result.kind === 'step_preview') {
        const plans = prunePlans(req);
        const actionable = result.summary.new + result.summary.conflicts;
        if (actionable > 0) {
          const planId = crypto.randomUUID();
          const createdAt = now();
          plans[planId] = {
            challengeId: result.challengeId,
            entries: result.entries,
            createdAt,
            expiresAt: createdAt + PLAN_TTL_MS
          };
          result.plan_id = planId;
          result.expires_in_seconds = PLAN_TTL_MS / 1000;
        }
      }

      res.json({ intent: intent.intent, tone: intent.tone, result });
    } catch (error) {
      if (error.code === 'CHAT_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'Chat beta is not configured yet' });
      }
      if (error.response || error.code === 'ECONNABORTED') {
        console.error('Chat provider request failed:', error.message);
        return res.status(502).json({ error: 'The chat service is temporarily unavailable. Please try again in a moment.' });
      }
      if (error.code === 'CHAT_INTENT_INVALID' || error.code === 'CHAT_MODEL_RESPONSE_INVALID') {
        return res.status(422).json({ error: error.message });
      }
      if (error.code === 'STEP_CHAT_USER_ERROR') {
        return res.status(400).json({ error: error.message });
      }
      console.error('Chat request failed:', error.message);
      res.status(500).json({ error: 'I couldn’t complete that request just now. Please try again.' });
    }
  });

  router.post('/confirm', requireApiAuth, validateCSRFToken, chatApiLimiter, async (req, res) => {
    const planId = req.body?.plan_id;
    const mode = req.body?.mode;
    if (typeof planId !== 'string' || !['new_only', 'overwrite_conflicts'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid confirmation request' });
    }

    const plans = prunePlans(req);
    const plan = plans[planId];
    if (!plan) return res.status(409).json({ error: 'This preview expired or was already used. Preview the entries again.' });

    // Consume before execution so retries cannot accidentally repeat a write.
    delete plans[planId];
    try {
      const result = await service.commitPlan(req.session.userId, plan, mode);
      res.json({ result: { kind: 'step_commit', ...result } });
    } catch (error) {
      console.error('Chat confirmation failed:', error.message);
      if (error.code === 'STEP_CHAT_USER_ERROR') {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: 'Unable to save this step plan right now. Please preview it again.' });
    }
  });

  return router;
}

module.exports = {
  createChatRouter,
  MESSAGE_LIMIT,
  PLAN_TTL_MS
};
