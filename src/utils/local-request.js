const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false;
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  return normalized === '::1' || normalized === '127.0.0.1';
}

/**
 * Require both a localhost Host header and a direct loopback connection.
 * Checking both prevents a remote request with a forged Host header from
 * enabling development-only responses or raw authentication-token logging.
 */
function isLocalhostRequest(req) {
  const hostname = String(req?.hostname || '').toLowerCase();
  return LOCAL_HOSTNAMES.has(hostname) && isLoopbackAddress(req?.socket?.remoteAddress);
}

module.exports = {
  isLoopbackAddress,
  isLocalhostRequest,
};
