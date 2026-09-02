const {
  createMagicLoginUrl,
  validatePublicBaseUrl
} = require('../../../src/utils/public-url');

describe('public authentication URL handling', () => {
  test('normalizes a canonical origin and safely encodes the token', () => {
    const baseUrl = validatePublicBaseUrl('https://steps.example.com/');
    const loginUrl = new URL(createMagicLoginUrl(baseUrl, 'token+/=?&value'));

    expect(loginUrl.origin).toBe('https://steps.example.com');
    expect(loginUrl.pathname).toBe('/auth/login');
    expect(loginUrl.searchParams.get('token')).toBe('token+/=?&value');
  });

  test.each([
    'not a URL',
    'javascript:alert(1)',
    'https://user:pass@steps.example.com',
    'https://steps.example.com/auth',
    'https://steps.example.com?redirect=evil',
    'https://steps.example.com/#fragment'
  ])('rejects a non-origin PUBLIC_BASE_URL: %s', value => {
    expect(() => validatePublicBaseUrl(value)).toThrow(/PUBLIC_BASE_URL/);
  });

  test('requires HTTPS for a production origin', () => {
    expect(() => validatePublicBaseUrl('http://steps.example.com', { requireHttps: true }))
      .toThrow('PUBLIC_BASE_URL must use HTTPS in production');
  });

  test('a request Host header is not an input to canonical login URL generation', () => {
    const hostileRequestHost = 'attacker.example';
    const loginUrl = createMagicLoginUrl(
      validatePublicBaseUrl('https://step-app-4x-yhw.fly.dev', { requireHttps: true }),
      'secret-token'
    );

    expect(loginUrl).toBe('https://step-app-4x-yhw.fly.dev/auth/login?token=secret-token');
    expect(loginUrl).not.toContain(hostileRequestHost);
  });
});
