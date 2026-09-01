const { isLoopbackAddress, isLocalhostRequest } = require('../../../src/utils/local-request');

describe('localhost request detection', () => {
  test.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'accepts loopback address %s',
    address => expect(isLoopbackAddress(address)).toBe(true)
  );

  test.each(['10.0.0.2', '192.168.1.4', '203.0.113.8', undefined])(
    'rejects non-loopback address %s',
    address => expect(isLoopbackAddress(address)).toBe(false)
  );

  test('requires both a localhost hostname and loopback socket', () => {
    expect(isLocalhostRequest({ hostname: 'localhost', socket: { remoteAddress: '::1' } })).toBe(true);
    expect(isLocalhostRequest({ hostname: '127.0.0.1', socket: { remoteAddress: '::ffff:127.0.0.1' } })).toBe(true);
    expect(isLocalhostRequest({ hostname: 'evil.example', socket: { remoteAddress: '::1' } })).toBe(false);
    expect(isLocalhostRequest({ hostname: 'localhost', socket: { remoteAddress: '203.0.113.8' } })).toBe(false);
  });
});
