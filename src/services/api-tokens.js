const crypto = require('crypto');
const { hashToken } = require('../utils/token');

const API_TOKEN_PREFIX = 'step_';
const API_TOKEN_PATTERN = /^step_[A-Za-z0-9_-]{43}$/;
const ALLOWED_API_SCOPES = new Set(['profile:read', 'steps:read', 'steps:write']);
const READ_ONLY_SCOPES = ['profile:read', 'steps:read'];
const READ_WRITE_SCOPES = [...READ_ONLY_SCOPES, 'steps:write'];

function generateApiToken() {
  return `${API_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

function apiTokenPrefix(token) {
  return `${token.slice(0, 13)}…`;
}

function normalizeTokenName(value) {
  if (typeof value !== 'string') throw new Error('Token name must be text');
  const name = value.normalize('NFC').trim();
  if (!name) throw new Error('Token name is required');
  if (name.length > 64) throw new Error('Token name must be 64 characters or fewer');
  if (/[\p{Cc}\p{Cs}<>]/u.test(name)) throw new Error('Token name contains unsupported characters');
  return name;
}

function normalizeScopes(value) {
  const scopes = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(',') : [];
  const normalized = [...new Set(scopes.map(scope => typeof scope === 'string' ? scope.trim() : ''))]
    .filter(Boolean)
    .sort();
  if (!normalized.length || normalized.some(scope => !ALLOWED_API_SCOPES.has(scope))) {
    throw new Error('Scopes must contain only profile:read, steps:read, and steps:write');
  }
  return normalized;
}

function extractBearerToken(req) {
  const authorization = typeof req.get === 'function'
    ? req.get('Authorization')
    : req.headers?.authorization;
  if (typeof authorization !== 'string') return null;
  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  return match && API_TOKEN_PATTERN.test(match[1]) ? match[1] : null;
}

function createApiTokenService({ db }) {
  const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
  const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
  const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });

  async function authenticate(rawToken) {
    if (!API_TOKEN_PATTERN.test(rawToken || '')) return null;
    const token = await get(`
      SELECT t.id, t.user_id, t.name, t.scopes, t.expires_at,
             u.name AS user_name, u.email AS user_email, u.archived_at
      FROM api_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?
        AND t.revoked_at IS NULL
        AND datetime(t.expires_at) > datetime('now')
      LIMIT 1
    `, [hashToken(rawToken)]);
    if (!token || token.archived_at) return null;
    return { ...token, scopes: normalizeScopes(token.scopes) };
  }

  async function touchToken(id) {
    // Avoid rewriting the token row on every API read while keeping admin
    // activity timestamps reasonably fresh.
    await run(`UPDATE api_tokens SET last_used_at = datetime('now')
      WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-5 minutes'))`, [id]);
  }

  async function createToken({ userId, name, scopes, expiresDays }) {
    if (!Number.isInteger(userId) || userId < 1) throw new Error('A valid user is required');
    const normalizedName = normalizeTokenName(name);
    const normalizedScopes = normalizeScopes(scopes);
    if (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 365) {
      throw new Error('Expiration must be between 1 and 365 days');
    }
    const user = await get('SELECT id, archived_at FROM users WHERE id = ?', [userId]);
    if (!user || user.archived_at) throw new Error('Active user not found');

    const rawToken = generateApiToken();
    const expiresAt = new Date(Date.now() + expiresDays * 86400000).toISOString();
    const result = await run(`
      INSERT INTO api_tokens (token_hash, token_prefix, user_id, name, scopes, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [hashToken(rawToken), apiTokenPrefix(rawToken), userId, normalizedName, normalizedScopes.join(','), expiresAt]);
    return {
      id: result.lastID,
      token: rawToken,
      token_prefix: apiTokenPrefix(rawToken),
      user_id: userId,
      name: normalizedName,
      scopes: normalizedScopes,
      expires_at: expiresAt
    };
  }

  async function listTokens() {
    const rows = await all(`
      SELECT t.id, t.token_prefix, t.user_id, t.name, t.scopes, t.expires_at,
             t.revoked_at, t.last_used_at, t.created_at,
             u.name AS user_name, u.email AS user_email,
             (SELECT COUNT(*) FROM api_audit_log a WHERE a.token_id = t.id) AS usage_count
      FROM api_tokens t
      JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
    `);
    return rows.map(row => ({ ...row, scopes: normalizeScopes(row.scopes) }));
  }

  async function revokeToken(id) {
    if (!Number.isInteger(id) || id < 1) return false;
    const result = await run(`
      UPDATE api_tokens SET revoked_at = datetime('now')
      WHERE id = ? AND revoked_at IS NULL
    `, [id]);
    return result.changes === 1;
  }

  async function listAudit(limit = 50) {
    return all(`
      SELECT a.id, a.action, a.status_code, a.details, a.ip_address, a.created_at,
             t.name AS token_name, t.token_prefix,
             u.name AS user_name, u.email AS user_email
      FROM api_audit_log a
      LEFT JOIN api_tokens t ON t.id = a.token_id
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  return { authenticate, touchToken, createToken, listTokens, revokeToken, listAudit };
}

module.exports = {
  ALLOWED_API_SCOPES,
  API_TOKEN_PATTERN,
  READ_ONLY_SCOPES,
  READ_WRITE_SCOPES,
  apiTokenPrefix,
  createApiTokenService,
  extractBearerToken,
  generateApiToken,
  normalizeScopes,
  normalizeTokenName
};
