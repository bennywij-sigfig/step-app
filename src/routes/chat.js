const express = require('express');
const crypto = require('crypto');
const { ALLOWED_TONES } = require('../services/chat-intent');
const { isValidDate } = require('../utils/validation');
const { runTrotterAgent } = require('../services/chat-agent');

const MESSAGE_LIMIT = 2000;
const HISTORY_MESSAGE_LIMIT = 50;
const HISTORY_CHAR_LIMIT = 35000;
const IMAGE_BYTE_LIMIT = 5 * 1024 * 1024;
const PLAN_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_PLANS = 5;

function createChatRouter({
  requireApiAuth,
  validateCSRFToken,
  chatApiLimiter,
  chatGlobalHourlyLimiter = (req, res, next) => next(),
  chatGlobalDailyLimiter = (req, res, next) => next(),
  chatImageLimiter = (req, res, next) => next(),
  chatImageGlobalLimiter = (req, res, next) => next(),
  teamRenameLimiter = (req, res, next) => next(),
  provider,
  service,
  toolRegistry = null,
  agentMode = 'legacy',
  now = () => Date.now(),
  imageRequestLog = (...args) => console.info(...args)
}) {
  const router = express.Router();
  const imageBodyParser = express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    limit: IMAGE_BYTE_LIMIT
  });
  const parseImageBody = (req, res, next) => imageBodyParser(req, res, error => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That image is larger than the 5 MB upload limit.' });
    }
    next(error);
  });
  const logImageRequest = (req, res, next) => {
    const reference = `TROT-IMG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const startedAt = Date.now();
    const declaredBytes = Number(req.get('Content-Length'));
    const baseEvent = {
      reference,
      content_type: String(req.get('Content-Type') || '').split(';')[0].toLowerCase() || null,
      declared_bytes: Number.isSafeInteger(declaredBytes) && declaredBytes >= 0 ? declaredBytes : null
    };
    let finalized = false;

    req.imageRequestReference = reference;
    res.set('X-Trotter-Request-Reference', reference);
    imageRequestLog('Trotter image request', JSON.stringify({
      event: 'started',
      ...baseEvent,
      authenticated: Boolean(req.session?.userId)
    }));

    const finalize = event => {
      if (finalized) return;
      finalized = true;
      const receivedBytes = Buffer.isBuffer(req.body) ? req.body.length : null;
      imageRequestLog('Trotter image request', JSON.stringify({
        event,
        ...baseEvent,
        status: res.statusCode,
        outcome: event === 'client_disconnected'
          ? 'client_disconnected'
          : res.statusCode < 400 ? 'success' : res.statusCode < 500 ? 'client_error' : 'server_error',
        duration_ms: Date.now() - startedAt,
        received_bytes: receivedBytes
      }));
    };
    res.once('finish', () => finalize('completed'));
    res.once('close', () => {
      if (!res.writableEnded) finalize('client_disconnected');
    });
    next();
  };

  function validateImageBytes(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
    if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    return false;
  }

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
    if (['step_preview', 'team_rename_preview', 'help'].includes(result.kind)) return null;
    return result;
  }

  function voiceReplyClaimsWrite(reply) {
    if (typeof reply !== 'string') return true;
    return /\b(?:i|we|trotter)\b[\s\S]{0,70}\b(?:recorded|logged|saved|added|updated|overwrote|submitted|renamed)\b/i.test(reply)
      || /\b(?:successfully|has been)\s+(?:recorded|logged|saved|added|updated|overwritten|submitted|renamed)\b/i.test(reply);
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
      // currentDate is the canonical, generous challenge date (Singapore is
      // the first supported region to reach a new date). A browser in Pacific
      // time can legitimately still be on the prior local date, so it must not
      // make Trotter report an already-open challenge as upcoming.
      return { ...context, clientDate, clientTimezone };
    } catch (_) {
      return context;
    }
  }

  function attachPlan(req, result) {
    const plans = prunePlans(req);
    const actionable = result.summary.new + result.summary.conflicts;
    if (actionable > 0) {
      const planId = crypto.randomUUID();
      const createdAt = now();
      plans[planId] = {
        type: 'steps',
        challengeId: result.challengeId,
        entries: result.entries,
        createdAt,
        expiresAt: createdAt + PLAN_TTL_MS
      };
      result.plan_id = planId;
      result.expires_in_seconds = PLAN_TTL_MS / 1000;
    }
    return result;
  }

  function attachTeamRenamePlan(req, result) {
    const plans = prunePlans(req);
    const planId = crypto.randomUUID();
    const createdAt = now();
    plans[planId] = {
      type: 'team_rename',
      teamId: result.team_id,
      currentName: result.current_name,
      proposedName: result.proposed_name,
      createdAt,
      expiresAt: createdAt + PLAN_TTL_MS
    };
    delete result.team_id;
    result.plan_id = planId;
    result.expires_in_seconds = PLAN_TTL_MS / 1000;
    return result;
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

  async function runLegacyChat(req, message, history, context) {
    const intent = await provider.interpret(message, context, history);
    if (ALLOWED_TONES.has(req.body?.tone)) intent.tone = req.body.tone;
    if (['challenge_info', 'challenge_outlook', 'calculate_overtake', 'calculate_target_average'].includes(intent.intent) && !intent.as_of_date) {
      intent.as_of_date = context.currentDate;
    }
    const result = await service.executeIntent(req.session.userId, intent);
    if (result.kind === 'step_preview') attachPlan(req, result);
    if (result.kind === 'team_rename_preview') attachTeamRenamePlan(req, result);

    let reply = null;
    const facts = narrationFacts(result);
    if (facts && typeof provider.compose === 'function') {
      try {
        const candidateReply = await provider.compose(message, history, intent.tone, facts);
        if (voiceReplyClaimsWrite(candidateReply)) {
          console.warn('Discarded Trotter voice reply that claimed a write occurred');
        } else {
          reply = candidateReply;
        }
      } catch (error) {
        console.warn('Trotter voice pass failed; using deterministic fallback:', error.message);
      }
    }
    return { intent: intent.intent, tone: intent.tone, result, reply };
  }

  router.get('/config', requireApiAuth, (req, res) => {
    res.json({
      enabled: provider.isConfigured(),
      provider: provider.isConfigured() ? provider.provider : null,
      model: provider.isConfigured() ? provider.model : null,
      message_limit: MESSAGE_LIMIT,
      batch_limit: service.MAX_BATCH_SIZE,
      history: 'browser-session-only',
      transcript_scope: String(req.session.userId),
      image_upload: typeof provider.extractImage === 'function',
      image_limit_bytes: IMAGE_BYTE_LIMIT,
      agent_mode: agentMode
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
    const requestReference = `TROT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    try {
      const history = validateHistory(req.body?.history);
      const serverContext = await service.getContext(req.session.userId);
      const context = applyClientDateContext(serverContext, req.body);

      if (agentMode === 'tools') {
        if (!toolRegistry || typeof provider.createToolModel !== 'function') {
          return res.status(503).json({ error: 'Trotter tool mode is not configured.' });
        }
        const tone = ALLOWED_TONES.has(req.body?.tone) ? req.body.tone : 'neutral';
        const agentResult = await runTrotterAgent({
          model: provider.createToolModel(context),
          registry: toolRegistry,
          message: message.trim(),
          history,
          tone,
          context: {
            userId: req.session.userId,
            currentDate: context.currentDate
          }
        });
        const falseWriteClaim = Boolean(agentResult.text) && voiceReplyClaimsWrite(agentResult.text);
        const result = agentResult.primary_result || (falseWriteClaim
          ? { kind: 'help', message: 'I did not change anything. Changes require review and your confirmation.' }
          : { kind: 'chitchat' });
        if (result.kind === 'step_preview') attachPlan(req, result);
        if (result.kind === 'team_rename_preview') attachTeamRenamePlan(req, result);
        // Challenge timing is rendered from the tool result so model prose
        // cannot contradict the inclusive Singapore-open/Pacific-close window.
        const reply = falseWriteClaim || ['challenge_info', 'my_team', 'team_rename_preview'].includes(result.kind)
          ? null
          : agentResult.text;
        return res.json({
          intent: 'tool_agent',
          tone,
          result,
          reply,
          agent: {
            rounds: agentResult.rounds,
            tools: agentResult.tool_results.map(item => item.name)
          }
        });
      }

      res.json(await runLegacyChat(req, message.trim(), history, context));
    } catch (error) {
      if (error.code === 'CHAT_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'Chat beta is not configured yet' });
      }
      if (error.response || error.code === 'ECONNABORTED') {
        console.error('Trotter provider incident', JSON.stringify({
          event: 'trotter_provider_error',
          reference: requestReference,
          code: error.code || error.response?.status || 'provider_error',
          model: provider.model || null
        }));
        return res.status(502).json({
          error: `The chat service is temporarily unavailable. Please try again in a moment. Reference: ${requestReference}`,
          reference: requestReference
        });
      }
      if (error.code === 'CHAT_INTENT_INVALID' || error.code === 'CHAT_MODEL_RESPONSE_INVALID') {
        return res.status(422).json({ error: error.message });
      }
      if (error.code === 'CHAT_TOOL_ERROR' || error.code === 'CHAT_AGENT_PROTOCOL_ERROR') {
        console.warn('Trotter tool-agent incident', JSON.stringify({
          event: 'trotter_tool_error',
          reference: requestReference,
          code: error.code,
          reason: error.message,
          details: error.details || {},
          model: provider.model || null,
          agentMode
        }));
        return res.status(422).json({
          error: `Trotter got tripped up while using her tools. Please try that request again. Reference: ${requestReference}`,
          reference: requestReference
        });
      }
      if (error.code === 'STEP_CHAT_USER_ERROR') {
        return res.status(400).json({ error: error.message });
      }
      console.error('Chat request failed:', error.message);
      res.status(500).json({ error: 'I couldn’t complete that request just now. Please try again.' });
    }
  });

  router.post(
    '/image/extract',
    logImageRequest,
    requireApiAuth,
    validateCSRFToken,
    chatImageGlobalLimiter,
    chatImageLimiter,
    parseImageBody,
    async (req, res) => {
      const mimeType = String(req.get('Content-Type') || '').split(';')[0].toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        return res.status(415).json({ error: 'Use a JPEG, PNG, or WebP image.' });
      }
      if (!validateImageBytes(req.body, mimeType)) {
        return res.status(400).json({ error: 'That file does not appear to be a valid image.' });
      }
      if (typeof provider.extractImage !== 'function') {
        return res.status(503).json({ error: 'Image extraction is not configured.' });
      }
      try {
        const serverContext = await service.getContext(req.session.userId);
        const context = applyClientDateContext(serverContext, {
          client_date: req.get('X-Client-Date'),
          client_timezone: req.get('X-Client-Timezone')
        });
        const extraction = await provider.extractImage(req.body, mimeType, context);
        res.json({ extraction });
      } catch (error) {
        const reference = req.imageRequestReference;
        if (error.response || error.code === 'ECONNABORTED') {
          imageRequestLog('Trotter image request', JSON.stringify({
            event: 'provider_error',
            reference,
            code: error.code || error.response?.status || 'provider_error',
            model: provider.model || null
          }));
          return res.status(502).json({
            error: `Trotter could not inspect that image right now. Please try again. Reference: ${reference}`,
            reference
          });
        }
        imageRequestLog('Trotter image request', JSON.stringify({
          event: 'extraction_error',
          reference,
          code: error.code || error.name || 'extraction_error',
          model: provider.model || null
        }));
        res.status(422).json({
          error: `Trotter could not find usable date and step entries in that image. Reference: ${reference}`,
          reference
        });
      }
    }
  );

  router.post('/entries/preview', requireApiAuth, validateCSRFToken, chatApiLimiter, async (req, res) => {
    try {
      const result = { kind: 'step_preview', ...(await service.previewEntries(req.session.userId, req.body?.entries)) };
      attachPlan(req, result);
      const tone = ALLOWED_TONES.has(req.body?.tone) ? req.body.tone : 'neutral';
      res.json({ intent: 'record_steps', tone, result, reply: null });
    } catch (error) {
      if (error.code === 'STEP_CHAT_USER_ERROR') return res.status(400).json({ error: error.message });
      console.error('Reviewed image entries preview failed:', error.message);
      res.status(500).json({ error: 'Trotter could not preview those entries right now.' });
    }
  });

  router.post('/team-rename/confirm', requireApiAuth, validateCSRFToken, teamRenameLimiter, async (req, res) => {
    const planId = req.body?.plan_id;
    if (typeof planId !== 'string') return res.status(400).json({ error: 'Invalid confirmation request' });
    const plans = prunePlans(req);
    const plan = plans[planId];
    if (!plan || plan.type !== 'team_rename') {
      return res.status(409).json({ error: 'This rename review expired or was already used. Ask Trotter to review it again.' });
    }
    // Consume before execution so retries cannot repeat a rename.
    delete plans[planId];
    try {
      const result = await service.commitTeamRename(req.session.userId, plan);
      res.json({ result: { kind: 'team_rename_commit', ...result } });
    } catch (error) {
      console.error('Team rename confirmation failed:', error.message);
      if (error.code === 'STEP_CHAT_USER_ERROR') return res.status(409).json({ error: error.message });
      res.status(500).json({ error: 'Unable to rename the team right now. Ask Trotter to review it again.' });
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
  IMAGE_BYTE_LIMIT,
  PLAN_TTL_MS
};
