const { isValidDate } = require('../utils/validation');
const {
  getCurrentChallengeDay,
  getTotalChallengeDays,
  getChallengeStatus,
  getLatestSupportedLocalDate,
  isDateInChallengePeriod
} = require('../utils/challenge');

const MAX_BATCH_SIZE = 31;

class StepChatUserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StepChatUserError';
    this.code = 'STEP_CHAT_USER_ERROR';
  }
}

const userError = message => new StepChatUserError(message);

function createStepChatService({
  db,
  getIndividualLeaderboard,
  getTeamLeaderboard,
  createTransactionConnection = null
}) {
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
  const get = (sql, params = []) => getFrom(db, sql, params);
  const all = (sql, params = []) => allFrom(db, sql, params);

  async function getActiveChallenge(connection = db) {
    return getFrom(connection, 'SELECT * FROM challenges WHERE is_active = 1 LIMIT 1');
  }

  async function getContext() {
    const challenge = await getActiveChallenge();
    return {
      currentDate: getLatestSupportedLocalDate(),
      challenge: challenge ? {
        id: challenge.id,
        name: challenge.name,
        start_date: challenge.start_date,
        end_date: challenge.end_date,
        reporting_threshold: challenge.reporting_threshold,
        current_day: getCurrentChallengeDay(challenge),
        total_days: getTotalChallengeDays(challenge)
      } : null
    };
  }

  function validateEntries(entries, challenge) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_BATCH_SIZE) {
      throw userError(`Enter between 1 and ${MAX_BATCH_SIZE} dates at a time`);
    }

    const seenDates = new Set();
    const latestDate = getLatestSupportedLocalDate();
    return entries.map(entry => {
      if (!entry || !isValidDate(entry.date)) throw userError('Every date must use YYYY-MM-DD format');
      if (!Number.isInteger(entry.count) || entry.count < 0 || entry.count > 70000) {
        throw userError('Every step count must be an integer from 0 to 70,000');
      }
      if (seenDates.has(entry.date)) throw userError(`Date ${entry.date} appears more than once`);
      seenDates.add(entry.date);
      if (entry.date > latestDate) throw userError(`Cannot enter steps for future date ${entry.date}`);
      if (challenge && !isDateInChallengePeriod(entry.date, challenge)) {
        throw userError(`${entry.date} is outside ${challenge.name} (${challenge.start_date} to ${challenge.end_date})`);
      }
      return { date: entry.date, count: entry.count };
    });
  }

  async function previewEntries(userId, entries) {
    const [user, challenge] = await Promise.all([
      get('SELECT id, archived_at FROM users WHERE id = ?', [userId]),
      getActiveChallenge()
    ]);
    if (!user) throw userError('User not found');
    if (user.archived_at) throw userError('Archived users cannot record steps');

    const validated = validateEntries(entries, challenge);
    const placeholders = validated.map(() => '?').join(',');
    const existingRows = await all(
      `SELECT date, count FROM steps WHERE user_id = ? AND date IN (${placeholders})`,
      [userId, ...validated.map(entry => entry.date)]
    );
    const existingByDate = new Map(existingRows.map(row => [row.date, Number(row.count)]));

    const preview = validated.map(entry => {
      const existingCount = existingByDate.has(entry.date) ? existingByDate.get(entry.date) : null;
      const status = existingCount === null ? 'new' : existingCount === entry.count ? 'unchanged' : 'conflict';
      return { ...entry, existing_count: existingCount, status };
    });

    return {
      challengeId: challenge?.id || null,
      entries: preview,
      summary: {
        new: preview.filter(entry => entry.status === 'new').length,
        unchanged: preview.filter(entry => entry.status === 'unchanged').length,
        conflicts: preview.filter(entry => entry.status === 'conflict').length
      }
    };
  }

  async function assertPlanIsFresh(userId, plan, connection = db) {
    const challenge = await getActiveChallenge(connection);
    if ((challenge?.id || null) !== plan.challengeId) throw userError('The active challenge changed; preview again');

    const placeholders = plan.entries.map(() => '?').join(',');
    const currentRows = await allFrom(
      connection,
      `SELECT date, count FROM steps WHERE user_id = ? AND date IN (${placeholders})`,
      [userId, ...plan.entries.map(entry => entry.date)]
    );
    const current = new Map(currentRows.map(row => [row.date, Number(row.count)]));

    for (const entry of plan.entries) {
      const currentCount = current.has(entry.date) ? current.get(entry.date) : null;
      if (currentCount !== entry.existing_count) {
        throw userError(`Steps for ${entry.date} changed after the preview; preview again`);
      }
    }
  }

  async function commitPlan(userId, plan, mode) {
    if (!['new_only', 'overwrite_conflicts'].includes(mode)) throw userError('Invalid confirmation mode');
    if (!plan || !Array.isArray(plan.entries) || plan.entries.length === 0) throw userError('Invalid step plan');

    const user = await get('SELECT archived_at FROM users WHERE id = ?', [userId]);
    if (!user || user.archived_at) throw userError('This account cannot record steps');
    const entriesToSave = plan.entries.filter(entry =>
      entry.status === 'new' || (mode === 'overwrite_conflicts' && entry.status === 'conflict')
    );

    // Production supplies a dedicated connection so unrelated Express writes
    // can never be absorbed into this transaction. Unit tests may use the
    // shared in-memory connection when no factory is supplied.
    const transactionDb = createTransactionConnection ? await createTransactionConnection() : db;
    const shouldClose = transactionDb !== db;
    try {
      await runOn(transactionDb, 'BEGIN IMMEDIATE TRANSACTION');
      try {
        // Recheck inside the write transaction so a stale preview cannot race an update.
        await assertPlanIsFresh(userId, plan, transactionDb);
        for (const entry of entriesToSave) {
          await runOn(transactionDb, `
            INSERT INTO steps (user_id, date, count, challenge_id, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, date) DO UPDATE SET
              count = excluded.count,
              challenge_id = excluded.challenge_id,
              updated_at = datetime('now')
          `, [userId, entry.date, entry.count, plan.challengeId]);
        }
        await runOn(transactionDb, 'COMMIT');
      } catch (error) {
        await runOn(transactionDb, 'ROLLBACK').catch(() => {});
        throw error;
      }
    } finally {
      if (shouldClose) {
        await new Promise(resolve => transactionDb.close(() => resolve()));
      }
    }

    return {
      saved: entriesToSave.length,
      skipped: plan.entries.length - entriesToSave.length,
      entries: entriesToSave.map(({ date, count }) => ({ date, count }))
    };
  }

  async function getMySteps(userId, startDate, endDate) {
    const conditions = ['user_id = ?'];
    const params = [userId];
    const challenge = await getActiveChallenge();
    let scope = 'all_time';

    // Unqualified questions default to the active challenge so old challenge
    // records do not silently distort totals or averages.
    if (!startDate && !endDate && challenge) {
      conditions.push('challenge_id = ?');
      params.push(challenge.id);
      scope = 'active_challenge';
    } else {
      if (startDate) { conditions.push('date >= ?'); params.push(startDate); }
      if (endDate) { conditions.push('date <= ?'); params.push(endDate); }
      if (startDate || endDate) scope = 'requested_range';
    }

    const where = conditions.join(' AND ');
    const [summary, rows] = await Promise.all([
      get(`SELECT COALESCE(SUM(count), 0) AS total_steps, COUNT(*) AS days_logged,
        CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(count), 0) * 1.0 / COUNT(*) ELSE 0 END AS daily_average
        FROM steps WHERE ${where}`, params),
      all(`SELECT date, count FROM steps WHERE ${where} ORDER BY date DESC LIMIT 100`, params)
    ]);

    return {
      kind: 'steps',
      scope,
      challenge: scope === 'active_challenge' ? {
        id: challenge.id,
        name: challenge.name,
        start_date: challenge.start_date,
        end_date: challenge.end_date
      } : null,
      summary: {
        total_steps: Number(summary.total_steps) || 0,
        days_logged: Number(summary.days_logged) || 0,
        daily_average: Number(summary.daily_average) || 0
      },
      entries: rows,
      truncated: rows.length === 100
    };
  }

  async function individualLeaderboard() {
    const challenge = await getActiveChallenge();
    if (challenge) {
      const data = await getIndividualLeaderboard(
        challenge.id,
        getCurrentChallengeDay(challenge),
        challenge.reporting_threshold,
        db
      );
      return { kind: 'leaderboard', leaderboard: 'individual', challenge, ...data };
    }
    const rows = await all(`
      SELECT u.id, u.name, u.team, COALESCE(SUM(s.count), 0) AS total_steps,
        COUNT(s.id) AS days_logged,
        CASE WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.count), 0) / COUNT(s.id) ELSE 0 END AS steps_per_day_reported,
        1 AS meets_threshold
      FROM users u LEFT JOIN steps s ON u.id = s.user_id
      WHERE u.archived_at IS NULL
      GROUP BY u.id
      ORDER BY steps_per_day_reported DESC, u.name ASC
    `);
    return { kind: 'leaderboard', leaderboard: 'individual', challenge: null, ranked: rows, unranked: [] };
  }

  async function teamLeaderboard() {
    const challenge = await getActiveChallenge();
    if (challenge) {
      const data = await getTeamLeaderboard(
        challenge.id,
        getCurrentChallengeDay(challenge),
        challenge.reporting_threshold,
        db
      );
      return { kind: 'leaderboard', leaderboard: 'team', challenge, ...data };
    }
    const rows = await all(`
      SELECT u.team, COUNT(DISTINCT u.id) AS member_count, COALESCE(SUM(s.count), 0) AS total_steps,
        COUNT(s.id) AS team_entries,
        CASE WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.count), 0) / COUNT(s.id) ELSE 0 END AS team_steps_per_day_reported,
        1 AS meets_threshold
      FROM users u LEFT JOIN steps s ON u.id = s.user_id
      WHERE u.archived_at IS NULL AND u.team IS NOT NULL AND u.team != ''
      GROUP BY u.team
      ORDER BY team_steps_per_day_reported DESC, u.team ASC
    `);
    return { kind: 'leaderboard', leaderboard: 'team', challenge: null, ranked: rows, unranked: [] };
  }

  async function getProjectionDays(challenge, requestedDays, userId) {
    if (!challenge) return requestedDays || 7;
    const status = getChallengeStatus(challenge);
    if (status === 'ended') {
      throw userError('The active challenge has ended, so there are no remaining days for a projection');
    }

    const totalDays = getTotalChallengeDays(challenge);
    const currentDay = status === 'upcoming' ? 1 : getCurrentChallengeDay(challenge);
    const firstAvailable = new Date(`${challenge.start_date}T00:00:00Z`);
    firstAvailable.setUTCDate(firstAvailable.getUTCDate() + currentDay - 1);
    const firstAvailableDate = firstAvailable.toISOString().slice(0, 10);
    const remainingCalendarDays = status === 'upcoming' ? totalDays : Math.max(0, totalDays - currentDay + 1);
    const alreadyLogged = await get(
      `SELECT COUNT(*) AS count FROM steps
       WHERE user_id = ? AND challenge_id = ? AND date >= ? AND date <= ?`,
      [userId, challenge.id, firstAvailableDate, challenge.end_date]
    );
    const availableEntryDays = Math.max(0, remainingCalendarDays - (Number(alreadyLogged?.count) || 0));
    if (availableEntryDays === 0) {
      throw userError('There are no unlogged challenge dates left for this projection');
    }

    const days = requestedDays || availableEntryDays;
    if (days > availableEntryDays) {
      throw userError(`Only ${availableEntryDays} unlogged challenge date${availableEntryDays === 1 ? '' : 's'} remain`);
    }
    return days;
  }

  async function calculateTargetAverage(userId, targetAverage, requestedDays) {
    const history = await getMySteps(userId, null, null);
    const challenge = await getActiveChallenge();
    const days = await getProjectionDays(challenge, requestedDays, userId);
    const currentTotal = history.summary.total_steps;
    const currentDays = history.summary.days_logged;
    const requiredAdditional = Math.max(0, Math.ceil(targetAverage * (currentDays + days) - currentTotal));
    const requiredDailyAverage = Math.ceil(requiredAdditional / days);

    return {
      kind: 'target_average',
      scope: history.scope,
      challenge: history.challenge,
      target_average: targetAverage,
      current: {
        total: currentTotal,
        days: currentDays,
        average: history.summary.daily_average
      },
      days,
      required_total: requiredAdditional,
      required_daily_average: requiredDailyAverage,
      feasible_under_daily_limit: requiredDailyAverage <= 70000,
      assumption: 'Each projected day is logged and counts toward the reported-day average.'
    };
  }

  async function challengeInfo(asOfDate = null) {
    const challenge = await getActiveChallenge();
    if (!challenge) return { kind: 'challenge_info', has_challenge: false, as_of_date: asOfDate };
    const totalDays = getTotalChallengeDays(challenge);
    let status;
    let currentDay;
    let remainingDays;

    if (asOfDate) {
      status = asOfDate < challenge.start_date ? 'upcoming' : asOfDate > challenge.end_date ? 'ended' : 'active';
      if (status === 'upcoming') {
        currentDay = 0;
        remainingDays = totalDays;
      } else if (status === 'ended') {
        currentDay = totalDays;
        remainingDays = 0;
      } else {
        const start = Date.parse(`${challenge.start_date}T00:00:00Z`);
        const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
        currentDay = Math.floor((asOf - start) / 86400000) + 1;
        remainingDays = totalDays - currentDay + 1;
      }
    } else {
      status = getChallengeStatus(challenge);
      currentDay = getCurrentChallengeDay(challenge);
      remainingDays = status === 'ended'
        ? 0
        : status === 'upcoming'
          ? totalDays
          : Math.max(0, totalDays - currentDay + 1);
    }
    return {
      kind: 'challenge_info',
      has_challenge: true,
      as_of_date: asOfDate,
      challenge: {
        id: challenge.id,
        name: challenge.name,
        start_date: challenge.start_date,
        end_date: challenge.end_date
      },
      status,
      current_day: currentDay,
      total_days: totalDays,
      remaining_days: remainingDays
    };
  }

  async function challengeOutlook(userId, leaderboardType) {
    const leaderboard = leaderboardType === 'team'
      ? await teamLeaderboard()
      : await individualLeaderboard();
    const ranked = leaderboard.ranked;
    const challenge = leaderboard.challenge;
    const status = challenge ? getChallengeStatus(challenge) : 'all_time';
    const remainingDays = !challenge || status === 'ended'
      ? 0
      : status === 'upcoming'
        ? getTotalChallengeDays(challenge)
        : Math.max(0, getTotalChallengeDays(challenge) - getCurrentChallengeDay(challenge) + 1);

    if (leaderboardType === 'team') {
      const user = await get('SELECT team FROM users WHERE id = ?', [userId]);
      if (!user?.team) {
        return { kind: 'outlook', leaderboard: 'team', status, remaining_days: remainingDays, has_entry: false, reason: 'no_team' };
      }
      const allRows = [...ranked, ...leaderboard.unranked];
      const mine = allRows.find(row => row.team === user.team);
      const rankIndex = ranked.findIndex(row => row.team === user.team);
      const leader = ranked[0] || null;
      const myAverage = Number(mine?.team_steps_per_day_reported) || 0;
      return {
        kind: 'outlook', leaderboard: 'team', status, remaining_days: remainingDays,
        has_entry: Boolean(mine), name: user.team, ranked: rankIndex >= 0,
        rank: rankIndex >= 0 ? rankIndex + 1 : null, ranked_count: ranked.length,
        average: myAverage,
        leader: leader ? { name: leader.team, average: Number(leader.team_steps_per_day_reported) || 0 } : null,
        gap_to_leader: leader ? Math.max(0, (Number(leader.team_steps_per_day_reported) || 0) - myAverage) : 0
      };
    }

    const allRows = [...ranked, ...leaderboard.unranked];
    const mine = allRows.find(row => Number(row.id) === Number(userId));
    const rankIndex = ranked.findIndex(row => Number(row.id) === Number(userId));
    const leader = ranked[0] || null;
    const myAverage = Number(mine?.steps_per_day_reported) || 0;
    return {
      kind: 'outlook', leaderboard: 'individual', status, remaining_days: remainingDays,
      has_entry: Boolean(mine), ranked: rankIndex >= 0,
      rank: rankIndex >= 0 ? rankIndex + 1 : null, ranked_count: ranked.length,
      average: myAverage,
      reporting_rate: Number(mine?.personal_reporting_rate) || 0,
      leader: leader ? { name: leader.name, average: Number(leader.steps_per_day_reported) || 0 } : null,
      gap_to_leader: leader ? Math.max(0, (Number(leader.steps_per_day_reported) || 0) - myAverage) : 0
    };
  }

  async function encouragement(userId) {
    const history = await getMySteps(userId, null, null);
    return {
      kind: 'encouragement',
      scope: history.scope,
      challenge: history.challenge,
      summary: history.summary
    };
  }

  async function calculateOvertake(userId, targetName, requestedDays) {
    const leaderboard = await individualLeaderboard();
    const everyone = [...leaderboard.ranked, ...leaderboard.unranked];
    const query = targetName.toLocaleLowerCase();
    const exact = everyone.filter(row => String(row.name || '').toLocaleLowerCase() === query);
    const matches = exact.length ? exact : everyone.filter(row => String(row.name || '').toLocaleLowerCase().includes(query));
    if (matches.length !== 1) {
      return {
        kind: 'clarification',
        message: matches.length ? 'More than one participant matched that name.' : 'No participant matched that name.',
        candidates: matches.slice(0, 5).map(row => row.name)
      };
    }

    const target = matches[0];
    if (Number(target.id) === Number(userId)) throw userError('Choose someone other than yourself to overtake');
    const me = everyone.find(row => Number(row.id) === Number(userId)) || { total_steps: 0, days_logged: 0, steps_per_day_reported: 0 };
    const days = await getProjectionDays(leaderboard.challenge, requestedDays, userId);
    const targetAverage = Number(target.steps_per_day_reported) || 0;
    const myTotal = Number(me.total_steps) || 0;
    const myDays = Number(me.days_logged) || 0;
    const requiredAdditional = Math.max(0, Math.floor(targetAverage * (myDays + days) - myTotal) + 1);

    return {
      kind: 'overtake',
      target: { id: target.id, name: target.name, average: targetAverage },
      current: { total: myTotal, days: myDays, average: Number(me.steps_per_day_reported) || 0 },
      days,
      required_total: requiredAdditional,
      required_daily_average: Math.ceil(requiredAdditional / days),
      feasible_under_daily_limit: Math.ceil(requiredAdditional / days) <= 70000,
      assumption: `${target.name}'s current reported-day average does not change.`
    };
  }

  async function executeIntent(userId, intent) {
    switch (intent.intent) {
      case 'record_steps': return { kind: 'step_preview', ...(await previewEntries(userId, intent.entries)) };
      case 'show_my_steps': return getMySteps(userId, intent.start_date, intent.end_date);
      case 'individual_leaderboard': return individualLeaderboard();
      case 'team_leaderboard': return teamLeaderboard();
      case 'calculate_overtake': return calculateOvertake(userId, intent.target_name, intent.days);
      case 'calculate_target_average': return calculateTargetAverage(userId, intent.target_average, intent.days);
      case 'challenge_outlook': return challengeOutlook(userId, intent.leaderboard);
      case 'challenge_info': return challengeInfo(intent.as_of_date);
      case 'encouragement': return encouragement(userId);
      case 'step_chitchat': return { kind: 'chitchat' };
      default:
        return {
          kind: 'help',
          message: 'I can record steps, show your step history or average, query individual or team leaderboards, and calculate a pace for a target average or to overtake someone.'
        };
    }
  }

  return {
    MAX_BATCH_SIZE,
    commitPlan,
    executeIntent,
    getContext,
    previewEntries
  };
}

module.exports = { createStepChatService, MAX_BATCH_SIZE, StepChatUserError };
