const {
  DEFAULT_ABSOLUTE_MAX_AGE,
  createSessionLifetimeMiddleware
} = require('../../../src/middleware/sessionLifetime');

describe('session lifetime middleware', () => {
  const loginTime = Date.UTC(2026, 0, 1);

  function createResponse() {
    return { clearCookie: jest.fn() };
  }

  test('does not modify anonymous sessions', () => {
    const middleware = createSessionLifetimeMiddleware({ now: () => loginTime });
    const req = { session: {} };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(req.session.authenticatedAt).toBeUndefined();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('anchors an authenticated session created before the policy deployment', () => {
    const middleware = createSessionLifetimeMiddleware({ now: () => loginTime });
    const req = { session: { userId: 42 } };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(req.session.authenticatedAt).toBe(loginTime);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('allows a session immediately before the absolute limit', () => {
    const middleware = createSessionLifetimeMiddleware({
      now: () => loginTime + DEFAULT_ABSOLUTE_MAX_AGE - 1
    });
    const req = { session: { userId: 42, authenticatedAt: loginTime } };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('destroys and clears a session at the 15-day absolute limit', () => {
    const destroy = jest.fn(callback => callback());
    const middleware = createSessionLifetimeMiddleware({
      now: () => loginTime + DEFAULT_ABSOLUTE_MAX_AGE,
      cookieOptions: { path: '/', httpOnly: true }
    });
    const req = {
      session: { userId: 42, authenticatedAt: loginTime, destroy }
    };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith('connect.sid', {
      path: '/',
      httpOnly: true
    });
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects malformed or future authentication timestamps', () => {
    const middleware = createSessionLifetimeMiddleware({ now: () => loginTime });

    for (const authenticatedAt of ['bad timestamp', NaN, loginTime + 1]) {
      const destroy = jest.fn(callback => callback());
      const req = { session: { userId: 42, authenticatedAt, destroy } };
      const res = createResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(res.clearCookie).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    }
  });

  test('passes session-store destruction errors to Express', () => {
    const error = new Error('store unavailable');
    const destroy = jest.fn(callback => callback(error));
    const middleware = createSessionLifetimeMiddleware({
      now: () => loginTime + DEFAULT_ABSOLUTE_MAX_AGE
    });
    const req = {
      session: { userId: 42, authenticatedAt: loginTime, destroy }
    };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(error);
  });
});
