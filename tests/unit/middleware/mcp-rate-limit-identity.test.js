const {
  getMcpCredential,
  getMcpCredentialRateLimitKey,
  getMcpBurstRateLimitKey
} = require('../../../src/middleware/rateLimiters');

function request({ authorization, token, ip = '203.0.113.10' } = {}) {
  return {
    ip,
    headers: authorization ? { authorization } : {},
    get(name) {
      return name.toLowerCase() === 'authorization' ? authorization : undefined;
    },
    body: token ? { params: { arguments: { token } } } : {}
  };
}

describe('MCP rate-limit identity', () => {
  test('recognizes Bearer credentials case-insensitively', () => {
    expect(getMcpCredential(request({ authorization: 'bearer mcp_secret' }))).toBe('mcp_secret');
  });

  test('recognizes the legacy JSON-RPC tool argument location', () => {
    expect(getMcpCredential(request({ token: 'mcp_legacy' }))).toBe('mcp_legacy');
  });

  test('hashes credentials so raw MCP tokens are never limiter keys', () => {
    const key = getMcpCredentialRateLimitKey(request({ authorization: 'Bearer mcp_secret' }));
    expect(key).toMatch(/^mcp_hourly_token_[a-f0-9]{64}$/);
    expect(key).not.toContain('mcp_secret');
  });

  test('gives different credentials separate hourly buckets', () => {
    const one = getMcpCredentialRateLimitKey(request({ authorization: 'Bearer mcp_one' }));
    const two = getMcpCredentialRateLimitKey(request({ authorization: 'Bearer mcp_two' }));
    expect(one).not.toBe(two);
  });

  test('scopes requests without a bounded credential to their IP', () => {
    const noCredential = getMcpCredentialRateLimitKey(request({ ip: '203.0.113.10' }));
    const oversized = getMcpCredentialRateLimitKey(request({
      authorization: `Bearer ${'x'.repeat(513)}`,
      ip: '203.0.113.10'
    }));
    expect(noCredential).toBe('mcp_hourly_ip_203.0.113.10');
    expect(oversized).toBe(noCredential);
  });

  test('keeps the burst bucket IP-scoped even when fabricated credentials rotate', () => {
    const one = getMcpBurstRateLimitKey(request({ authorization: 'Bearer fake_one' }));
    const two = getMcpBurstRateLimitKey(request({ authorization: 'Bearer fake_two' }));
    const otherIp = getMcpBurstRateLimitKey(request({ authorization: 'Bearer fake_one', ip: '203.0.113.11' }));
    expect(one).toBe('mcp_burst_ip_203.0.113.10');
    expect(two).toBe(one);
    expect(otherIp).not.toBe(one);
  });
});
