function validatePublicBaseUrl(value, { requireHttps = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('PUBLIC_BASE_URL is required');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch (_) {
    throw new Error('PUBLIC_BASE_URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_BASE_URL must use HTTP or HTTPS');
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new Error('PUBLIC_BASE_URL must use HTTPS in production');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new Error('PUBLIC_BASE_URL must contain only an origin');
  }

  return url.origin;
}

function createMagicLoginUrl(baseUrl, token) {
  if (typeof token !== 'string' || !token) throw new Error('Magic-link token is required');
  const loginUrl = new URL('/auth/login', baseUrl);
  loginUrl.searchParams.set('token', token);
  return loginUrl.toString();
}

module.exports = {
  createMagicLoginUrl,
  validatePublicBaseUrl
};
