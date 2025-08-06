const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Logs messages only when in a development environment.
 * @param  {...any} args - Arguments to pass to console.log.
 */
function devLog(...args) {
  if (isDevelopment) {
    console.log(...args);
  }
}

module.exports = {
  isDevelopment,
  devLog,
};