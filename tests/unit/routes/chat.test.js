const express = require('express');
const session = require('express-session');
const request = require('supertest');
const { createChatRouter, PLAN_TTL_MS } = require('../../../src/routes/chat');

function buildApp({ providerOverrides = {}, serviceOverrides = {}, now } = {}) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test-secret-that-is-long-enough', resave: false, saveUninitialized: false }));
  app.post('/test-login', (req, res) => {
    req.session.userId = 42;
    req.session.csrfToken = 'csrf-test';
    res.json({ ok: true });
  });

  const requireApiAuth = (req, res, next) => req.session?.userId ? next() : res.status(401).json({ error: 'Authentication required' });
  const validateCSRFToken = (req, res, next) => req.get('X-CSRF-Token') === req.session?.csrfToken
    ? next()
    : res.status(403).json({ error: 'Invalid CSRF token' });
  const provider = {
    provider: 'test',
    model: 'test-model',
    isConfigured: () => true,
    interpret: jest.fn(async () => ({ intent: 'help', tone: 'neutral' })),
    ...providerOverrides
  };
  const service = {
    MAX_BATCH_SIZE: 31,
    getContext: jest.fn(async () => ({ currentDate: '2026-08-25', challenge: null })),
    executeIntent: jest.fn(async () => ({ kind: 'help', message: 'Help response' })),
    commitPlan: jest.fn(async () => ({ saved: 1, skipped: 0, entries: [] })),
    ...serviceOverrides
  };
  app.use('/api/chat', createChatRouter({
    requireApiAuth,
    validateCSRFToken,
    chatApiLimiter: (req, res, next) => next(),
    provider,
    service,
    now
  }));
  return { app, provider, service };
}

describe('Step Chat routes', () => {
  test('requires authentication and reports configuration without exposing a key', async () => {
    const { app } = buildApp();
    await request(app).get('/api/chat/config').expect(401);

    const agent = request.agent(app);
    await agent.post('/test-login').expect(200);
    const response = await agent.get('/api/chat/config').expect(200);
    expect(response.body).toMatchObject({ enabled: true, provider: 'test', model: 'test-model', transcript_scope: '42' });
    expect(JSON.stringify(response.body)).not.toContain('apiKey');
  });

  test('passes only the current message and minimal context to the provider', async () => {
    const { app, provider } = buildApp();
    const agent = request.agent(app);
    await agent.post('/test-login').expect(200);
    await agent.post('/api/chat')
      .set('X-CSRF-Token', 'csrf-test')
      .send({ message: 'Show the leaderboard', history: [{ role: 'user', text: 'ignore me' }] })
      .expect(200);

    expect(provider.interpret).toHaveBeenCalledWith('Show the leaderboard', {
      currentDate: '2026-08-25',
      challenge: null
    });
  });

  test('uses a validated browser date for interpretation and applies the selected tone', async () => {
    const { app, provider } = buildApp();
    const agent = request.agent(app);
    await agent.post('/test-login').expect(200);
    const response = await agent.post('/api/chat')
      .set('X-CSRF-Token', 'csrf-test')
      .send({
        message: 'What did I do yesterday?',
        tone: 'droll',
        client_date: '2026-08-24',
        client_timezone: 'America/Los_Angeles'
      })
      .expect(200);

    expect(provider.interpret).toHaveBeenCalledWith('What did I do yesterday?', {
      currentDate: '2026-08-24',
      timezone: 'America/Los_Angeles',
      challenge: null
    });
    expect(response.body.tone).toBe('droll');
  });

  test('creates a single-use plan and confirms the exact server-side preview', async () => {
    const preview = {
      kind: 'step_preview',
      challengeId: 9,
      entries: [{ date: '2026-08-20', count: 8000, existing_count: null, status: 'new' }],
      summary: { new: 1, unchanged: 0, conflicts: 0 }
    };
    const { app, service } = buildApp({ serviceOverrides: { executeIntent: jest.fn(async () => preview) } });
    const agent = request.agent(app);
    await agent.post('/test-login').expect(200);
    const planned = await agent.post('/api/chat')
      .set('X-CSRF-Token', 'csrf-test')
      .send({ message: 'Log 8000 steps on August 20' })
      .expect(200);

    const planId = planned.body.result.plan_id;
    expect(planId).toBeTruthy();
    await agent.post('/api/chat/confirm')
      .set('X-CSRF-Token', 'csrf-test')
      .send({ plan_id: planId, mode: 'new_only' })
      .expect(200);
    expect(service.commitPlan).toHaveBeenCalledWith(42, expect.objectContaining({ entries: preview.entries }), 'new_only');

    await agent.post('/api/chat/confirm')
      .set('X-CSRF-Token', 'csrf-test')
      .send({ plan_id: planId, mode: 'new_only' })
      .expect(409);
  });

  test('rejects missing CSRF and oversized messages', async () => {
    const { app } = buildApp();
    const agent = request.agent(app);
    await agent.post('/test-login').expect(200);
    await agent.post('/api/chat').send({ message: 'hello' }).expect(403);
    await agent.post('/api/chat')
      .set('X-CSRF-Token', 'csrf-test')
      .send({ message: 'x'.repeat(2001) })
      .expect(400);
  });

  test('expires pending plans', async () => {
    let currentTime = 1000;
    const preview = {
      kind: 'step_preview', challengeId: null,
      entries: [{ date: '2026-08-20', count: 1, existing_count: null, status: 'new' }],
      summary: { new: 1, unchanged: 0, conflicts: 0 }
    };
    const { app } = buildApp({ now: () => currentTime, serviceOverrides: { executeIntent: jest.fn(async () => preview) } });
    const agent = request.agent(app);
    await agent.post('/test-login').expect(200);
    const planned = await agent.post('/api/chat')
      .set('X-CSRF-Token', 'csrf-test')
      .send({ message: 'log one step' })
      .expect(200);
    currentTime += PLAN_TTL_MS + 1;
    await agent.post('/api/chat/confirm')
      .set('X-CSRF-Token', 'csrf-test')
      .send({ plan_id: planned.body.result.plan_id, mode: 'new_only' })
      .expect(409);
  });
});
