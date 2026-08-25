const express = require('express');
const crypto = require('crypto');
const { ALLOWED_TONES } = require('../services/chat-intent');
const { isValidDate } = require('../utils/validation');

const MESSAGE_LIMIT = 2000;
const HISTORY_MESSAGE_LIMIT = 30;
const HISTORY_CHAR_LIMIT = 20000;
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

  function validateHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return [];
    const recent = rawHistory.slice(-HISTORY_MESSAGE_LIMIT);
    const accepted = [];
    let totalCharacters = 0;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      const item = recent[index];
      if (!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string') continue;
      const text = item.text.trim().slice(0, 4000);
      if (!text) continue;
      const remaining = HISTORY_CHAR_LIMIT - totalCharacters;
      if (remaining <= 0) break;
      accepted.unshift({ role: item.role, text: text.slice(-remaining) });
      totalCharacters += Math.min(text.length, remaining);
    }
    return accepted;
  }

  function narrationFacts(result) {
    if (result.kind === 'leaderboard') {
      const averageField = result.leaderboard === 'team' ? 'team_steps_per_day_reported' : 'steps_per_day_reported';
      return {
        kind: result.kind,
        leaderboard: result.leaderboard,
        challenge: result.challenge ? { name: result.challenge.name, end_date: result.challenge.end_date } : null,
        ranked: result.ranked.slice(0, 10).map((row, index) => ({
          rank: index + 1,
          name: result.leaderboard === 'team' ? row.team : row.name,
          average: Math.round(Number(row[averageField]) || 0)
        })),
        unranked_count: result.unranked.length
      };
    }
    if (result.kind === 'steps') {
      return {
        kind: result.kind,
        scope: result.scope,
        challenge: result.challenge,
        summary: result.summary,
        recent_entries: result.entries.slice(0, 7)
      };
    }
    if (result.kind === 'step_preview') return null;
    return result;
  }

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
      const history = validateHistory(req.body?.history);
      const serverContext = await service.getContext();
      const context = applyClientDateContext(serverContext, req.body);
      const intent = await provider.interpret(message.trim(), context, history);
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

      let reply = null;
      const facts = narrationFacts(result);
      if (facts && typeof provider.compose === 'function') {
        try {
          reply = await provider.compose(message.trim(), history, intent.tone, facts);
        } catch (error) {
          console.warn('Trotter voice pass failed; using deterministic fallback:', error.message);
        }
      }

      res.json({ intent: intent.intent, tone: intent.tone, result, reply });
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
  HISTORY_MESSAGE_LIMIT,
  HISTORY_CHAR_LIMIT,
  PLAN_TTL_MS
};
