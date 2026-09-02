const {
  getApiPreAuthRateLimitKey,
  getApiTokenRateLimitKey
} = require('../../../src/middleware/rateLimiters');

describe('REST API rate-limit identity', () => {
  test('pre-authentication limits are IP-scoped', () => {
    expect(getApiPreAuthRateLimitKey({ ip: '203.0.113.10' })).toBe('rest_api_ip_203.0.113.10');
    expect(getApiPreAuthRateLimitKey({ ip: '203.0.113.11' })).not.toBe('rest_api_ip_203.0.113.10');
  });

  test('authenticated limits use the database token ID, not bearer material', () => {
    const request = { ip: '203.0.113.10', apiToken: { id: 42 } };
    expect(getApiTokenRateLimitKey(request)).toBe('rest_api_token_42');
  });

  test('falls back to the IP key before authentication', () => {
    expect(getApiTokenRateLimitKey({ ip: '203.0.113.10' })).toBe('rest_api_ip_203.0.113.10');
  });
});
