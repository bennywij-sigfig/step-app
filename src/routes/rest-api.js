const express = require('express');
const { extractBearerToken } = require('../services/api-tokens');
const { isValidDate } = require('../utils/validation');
const {
  getCurrentChallengeDay,
  getChallengeStatus,
  getTotalChallengeDays,
  getLatestSupportedLocalDate,
  isDateInChallengePeriod
} = require('../utils/challenge');

class RestApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function createRestApiRouter({
  db,
  tokenService,
  preAuthLimiter,
  tokenLimiter,
  createTransactionConnection,
  getIndividualLeaderboard,
  getTeamLeaderboard
}) {
  const router = express.Router();
  const getFrom = (connection, sql, params = []) => new Promise((resolve, reject) => {
    connection.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
  const allFrom = (connection, sql, params = []) => new Promise((resolve, reject) => {
    connection.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
  const runOn = (connection, sql, params = []) => new Promise((resolve, reject) => {
    connection.run(sql, params, function(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });

  router.use(preAuthLimiter);
  router.use(async (req, res, next) => {
    try {
      const rawToken = extractBearerToken(req);
      if (!rawToken) return res.status(401).json({ error: 'Valid Bearer token required' });
      const token = await tokenService.authenticate(rawToken);
      if (!token) return res.status(401).json({ error: 'Invalid, expired, revoked, or inactive API token' });
      req.apiToken = token;
      res.set('Cache-Control', 'no-store');
      next();
    } catch (error) {
      console.error('REST API authentication failed:', error.message);
      res.status(500).json({ error: 'API authentication unavailable' });
    }
  });
  router.use(tokenLimiter);
  router.use(async (req, res, next) => {
    try {
      await tokenService.touchToken(req.apiToken.id);
      next();
    } catch (error) {
      console.error('REST API token usage update failed:', error.message);
      res.status(500).json({ error: 'API authentication unavailable' });
    }
  });
  router.use((req, res, next) => {
    res.on('finish', () => {
      if (!req.apiToken || !req.apiAction) return;
      const details = req.apiAuditDetails ? JSON.stringify(req.apiAuditDetails).slice(0, 4000) : null;
      db.run(`
        INSERT INTO api_audit_log
          (token_id, user_id, action, status_code, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [req.apiToken.id, req.apiToken.user_id, req.apiAction, res.statusCode, details, req.ip], error => {
        if (error) console.error('REST API audit write failed:', error.message);
      });
    });
    next();
  });

  const requireScope = scope => (req, res, next) => {
    if (!req.apiToken.scopes.includes(scope)) {
      req.apiAction = `denied:${scope}`;
      return res.status(403).json({ error: `Token requires ${scope} scope` });
    }
    next();
  };

  function validateStepInput(date, count) {
    if (!isValidDate(date)) throw new RestApiError(400, 'Date must use YYYY-MM-DD format');
    if (!Number.isInteger(count) || count < 0 || count > 70000) {
      throw new RestApiError(400, 'Count must be a whole number from 0 to 70,000');
    }
    if (date > getLatestSupportedLocalDate()) throw new RestApiError(400, 'Future dates are not allowed');
  }

  async function validateChallengeDate(connection, date) {
    const challenge = await getFrom(connection, 'SELECT * FROM challenges WHERE is_active = 1 LIMIT 1');
    if (challenge && !isDateInChallengePeriod(date, challenge)) {
      throw new RestApiError(400, `Date must be within the active challenge (${challenge.start_date} to ${challenge.end_date})`, {
        challenge_start: challenge.start_date,
        challenge_end: challenge.end_date
      });
    }
    return challenge;
  }

  async function withTransaction(work) {
    const connection = await createTransactionConnection();
    try {
      await runOn(connection, 'BEGIN IMMEDIATE TRANSACTION');
      try {
        const result = await work(connection);
        await runOn(connection, 'COMMIT');
        return result;
      } catch (error) {
        await runOn(connection, 'ROLLBACK').catch(() => {});
        throw error;
      }
    } finally {
      await new Promise(resolve => connection.close(() => resolve()));
    }
  }

  router.get('/me', requireScope('profile:read'), async (req, res) => {
    req.apiAction = 'profile.read';
    try {
      const [user, challenge] = await Promise.all([
        getFrom(db, `SELECT u.id, u.name, u.email, t.name AS team
          FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?`, [req.apiToken.user_id]),
        getFrom(db, `SELECT id, name, start_date, end_date, reporting_threshold
          FROM challenges WHERE is_active = 1 LIMIT 1`)
      ]);
      if (!user) return res.status(401).json({ error: 'Token user no longer exists' });
      res.json({ user, active_challenge: challenge || null });
    } catch (error) {
      console.error('REST profile read failed:', error.message);
      res.status(500).json({ error: 'Unable to load profile' });
    }
  });

  function summarizeChallenge(challenge, currentDay, now) {
    const totalDays = getTotalChallengeDays(challenge);
    const status = getChallengeStatus(challenge, now);
    if (status === 'invalid' || totalDays === 0) throw new Error('Active challenge dates are invalid');
    return {
      id: challenge.id,
      name: challenge.name,
      start_date: challenge.start_date,
      end_date: challenge.end_date,
      reporting_threshold: challenge.reporting_threshold,
      status,
      current_day: currentDay,
      total_days: totalDays,
      remaining_days: status === 'upcoming' ? totalDays : status === 'active' ? totalDays - currentDay + 1 : 0
    };
  }

  const individualFields = (row, position, ranked) => ({
    position,
    ranked,
    participant_id: row.id,
    name: row.name,
    team: row.team || null,
    total_steps: Number(row.total_steps) || 0,
    days_logged: Number(row.days_logged) || 0,
    steps_per_day_reported: Number(row.steps_per_day_reported) || 0,
    reporting_rate: Number(row.personal_reporting_rate) || 0
  });

  const teamFields = (row, position, ranked) => ({
    position,
    ranked,
    team_id: row.team_id,
    name: row.team,
    member_count: Number(row.member_count) || 0,
    total_steps: Number(row.total_steps) || 0,
    entries_logged: Number(row.team_entries) || 0,
    steps_per_day_reported: Number(row.team_steps_per_day_reported) || 0,
    reporting_rate: Number(row.team_reporting_rate) || 0
  });

  async function loadLeaderboard(req, res, type) {
    req.apiAction = `leaderboard.${type}.read`;
    try {
      const challenge = await getFrom(db, `SELECT id, name, start_date, end_date, reporting_threshold
        FROM challenges WHERE is_active = 1 LIMIT 1`);
      if (!challenge) {
        req.apiAuditDetails = { challenge_id: null, ranked: 0, unranked: 0 };
        return res.json({ challenge: null, ranked: [], unranked: [] });
      }
      const now = new Date();
      const currentDay = getCurrentChallengeDay(challenge, now);
      const challengeSummary = summarizeChallenge(challenge, currentDay, now);
      const loader = type === 'individual' ? getIndividualLeaderboard : getTeamLeaderboard;
      if (typeof loader !== 'function') throw new Error('Leaderboard service unavailable');
      const standings = await loader(challenge.id, currentDay, challenge.reporting_threshold, db);
      const mapFields = type === 'individual' ? individualFields : teamFields;
      const ranked = standings.ranked.map((row, index) => mapFields(row, index + 1, true));
      const unranked = standings.unranked.map((row, index) => mapFields(row, index + 1, false));
      req.apiAuditDetails = { challenge_id: challenge.id, ranked: ranked.length, unranked: unranked.length };
      return res.json({ challenge: challengeSummary, ranked, unranked });
    } catch (error) {
      console.error(`REST ${type} leaderboard read failed:`, error.message);
      return res.status(500).json({ error: `Unable to load ${type} leaderboard` });
    }
  }

  router.get('/leaderboards/individual', requireScope('leaderboard:read'), (req, res) =>
    loadLeaderboard(req, res, 'individual'));

  router.get('/leaderboards/team', requireScope('leaderboard:read'), (req, res) =>
    loadLeaderboard(req, res, 'team'));

  router.get('/steps', requireScope('steps:read'), async (req, res) => {
    req.apiAction = 'steps.read';
    try {
      const startDate = req.query.start_date || null;
      const endDate = req.query.end_date || null;
      if (startDate && !isValidDate(startDate)) throw new RestApiError(400, 'start_date must use YYYY-MM-DD format');
      if (endDate && !isValidDate(endDate)) throw new RestApiError(400, 'end_date must use YYYY-MM-DD format');
      if (startDate && endDate && startDate > endDate) throw new RestApiError(400, 'start_date must be on or before end_date');

      const conditions = ['user_id = ?'];
      const params = [req.apiToken.user_id];
      if (startDate) { conditions.push('date >= ?'); params.push(startDate); }
      if (endDate) { conditions.push('date <= ?'); params.push(endDate); }
      const entries = await allFrom(db, `
        SELECT date, count, challenge_id, updated_at
        FROM steps WHERE ${conditions.join(' AND ')}
        ORDER BY date DESC LIMIT 1000
      `, params);
      req.apiAuditDetails = { start_date: startDate, end_date: endDate, returned: entries.length };
      res.json({ entries });
    } catch (error) {
      if (error instanceof RestApiError) return res.status(error.status).json({ error: error.message });
      console.error('REST step read failed:', error.message);
      res.status(500).json({ error: 'Unable to load steps' });
    }
  });

  router.post('/steps', requireScope('steps:write'), async (req, res) => {
    req.apiAction = 'steps.create';
    try {
      const keys = Object.keys(req.body || {});
      if (keys.some(key => !['date', 'count'].includes(key))) throw new RestApiError(400, 'Only date and count are supported');
      const { date, count } = req.body || {};
      validateStepInput(date, count);
      const result = await withTransaction(async connection => {
        const challenge = await validateChallengeDate(connection, date);
        const existing = await getFrom(connection, 'SELECT count FROM steps WHERE user_id = ? AND date = ?', [req.apiToken.user_id, date]);
        if (existing) throw new RestApiError(409, 'An entry already exists for this date; use PUT to replace it', { existing_count: existing.count });
        await runOn(connection, `INSERT INTO steps (user_id, date, count, challenge_id, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))`, [req.apiToken.user_id, date, count, challenge?.id || null]);
        return { date, count, challenge_id: challenge?.id || null };
      });
      req.apiAuditDetails = result;
      res.status(201).json({ entry: result });
    } catch (error) {
      if (error instanceof RestApiError) {
        req.apiAuditDetails = error.details;
        return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
      }
      console.error('REST step create failed:', error.message);
      res.status(500).json({ error: 'Unable to create step entry' });
    }
  });

  router.put('/steps/:date', requireScope('steps:write'), async (req, res) => {
    req.apiAction = 'steps.replace';
    try {
      const keys = Object.keys(req.body || {});
      if (keys.some(key => key !== 'count')) throw new RestApiError(400, 'Only count is supported in the request body');
      const date = req.params.date;
      const { count } = req.body || {};
      validateStepInput(date, count);
      const result = await withTransaction(async connection => {
        const challenge = await validateChallengeDate(connection, date);
        const existing = await getFrom(connection, 'SELECT count FROM steps WHERE user_id = ? AND date = ?', [req.apiToken.user_id, date]);
        if (!existing) throw new RestApiError(404, 'No entry exists for this date; use POST to create it');
        await runOn(connection, `UPDATE steps SET count = ?, challenge_id = ?, updated_at = datetime('now')
          WHERE user_id = ? AND date = ?`, [count, challenge?.id || null, req.apiToken.user_id, date]);
        return { date, previous_count: Number(existing.count), count, challenge_id: challenge?.id || null };
      });
      req.apiAuditDetails = result;
      res.json({ entry: result });
    } catch (error) {
      if (error instanceof RestApiError) {
        req.apiAuditDetails = error.details;
        return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
      }
      console.error('REST step replace failed:', error.message);
      res.status(500).json({ error: 'Unable to replace step entry' });
    }
  });

  return router;
}

module.exports = { RestApiError, createRestApiRouter };
