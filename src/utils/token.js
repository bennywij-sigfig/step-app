const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateSecureToken() {
  return uuidv4();
}

module.exports = {
  hashToken,
  generateSecureToken,
};