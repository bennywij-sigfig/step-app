const DEFAULT_ABSOLUTE_MAX_AGE = 15 * 24 * 60 * 60 * 1000;

/**
 * Enforce a hard authentication lifetime independently of the rolling idle
 * timeout configured by express-session.
 *
 * Sessions created before this policy was deployed are anchored on their next
 * authenticated request so existing users are not logged out immediately.
 */
function createSessionLifetimeMiddleware({
  absoluteMaxAge = DEFAULT_ABSOLUTE_MAX_AGE,
  now = Date.now,
  cookieName = 'connect.sid',
  cookieOptions = { path: '/' }
} = {}) {
  return function enforceSessionLifetime(req, res, next) {
    if (!req.session?.userId) {
      return next();
    }

    if (req.session.authenticatedAt === undefined) {
      req.session.authenticatedAt = now();
      return next();
    }

    const authenticatedAt = req.session.authenticatedAt;
    const currentTime = now();
    const isInvalid = typeof authenticatedAt !== 'number'
      || !Number.isFinite(authenticatedAt)
      || authenticatedAt > currentTime;
    const isExpired = !isInvalid && currentTime - authenticatedAt >= absoluteMaxAge;

    if (!isInvalid && !isExpired) {
      return next();
    }

    req.session.destroy((error) => {
      if (error) {
        return next(error);
      }

      res.clearCookie(cookieName, cookieOptions);
      return next();
    });
  };
}

module.exports = {
  DEFAULT_ABSOLUTE_MAX_AGE,
  createSessionLifetimeMiddleware
};
