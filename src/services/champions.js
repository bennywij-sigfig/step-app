const FEATURED_CHALLENGE = Object.freeze({
  season: 2025,
  name: 'SigFig Step Challenge 2025',
  startDate: '2025-08-01',
  endDate: '2025-08-15',
  excludedParticipantNames: new Set(['benny+test'])
});

const STEPS_PER_MILE = 2000;
const KM_PER_MILE = 1.609344;
const MARATHON_KM = 42.195;
const ROUTE = Object.freeze({
  delhiToSingaporeKm: 4142.4938597351265,
  singaporeToSanFranciscoKm: 13582.096535722669
});

function all(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function get(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function challengeDays(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? Math.floor((end - start) / 86400000) + 1
    : 0;
}

function compareAverage(left, right) {
  const comparison = (right.total_steps * left.days_reported) - (left.total_steps * right.days_reported);
  return comparison || String(left.name || '').localeCompare(String(right.name || ''));
}

function assignRanks(rows) {
  let previous = null;
  return rows.map((row, index) => {
    const tied = previous &&
      row.total_steps * previous.days_reported === previous.total_steps * row.days_reported;
    const rank = tied ? previous.rank : index + 1;
    const ranked = { ...row, rank };
    previous = ranked;
    return ranked;
  });
}

function buildParticipants(rows, totalDays, threshold) {
  const byUser = new Map();
  for (const row of rows) {
    const key = String(row.user_id);
    const participant = byUser.get(key) || {
      id: row.user_id,
      name: row.user_name,
      team: row.user_team || null,
      total_steps: 0,
      days_reported: 0
    };
    participant.total_steps += Number(row.count) || 0;
    participant.days_reported += 1;
    byUser.set(key, participant);
  }

  const participants = [...byUser.values()].map(participant => ({
    ...participant,
    average_steps: participant.days_reported > 0
      ? participant.total_steps / participant.days_reported
      : 0,
    reporting_rate: totalDays > 0
      ? (participant.days_reported * 100) / totalDays
      : 0,
    ranked: totalDays > 0 && (participant.days_reported * 100) / totalDays >= threshold
  }));

  const ranked = assignRanks(participants.filter(row => row.ranked).sort(compareAverage));
  const unranked = participants
    .filter(row => !row.ranked)
    .sort((a, b) => b.reporting_rate - a.reporting_rate || compareAverage(a, b))
    .map(row => ({ ...row, rank: null }));
  return [...ranked, ...unranked];
}

function buildTeams(participants, totalDays, threshold) {
  const byTeam = new Map();
  for (const participant of participants) {
    if (!participant.team) continue;
    const team = byTeam.get(participant.team) || {
      name: participant.team,
      total_steps: 0,
      reported_person_days: 0,
      members: []
    };
    team.total_steps += participant.total_steps;
    team.reported_person_days += participant.days_reported;
    team.members.push(participant);
    byTeam.set(participant.team, team);
  }

  const teams = [...byTeam.values()].map(team => {
    const expected = team.members.length * totalDays;
    return {
      ...team,
      member_count: team.members.length,
      average_steps: team.reported_person_days > 0
        ? team.total_steps / team.reported_person_days
        : 0,
      reporting_rate: expected > 0 ? (team.reported_person_days * 100) / expected : 0,
      ranked: expected > 0 && (team.reported_person_days * 100) / expected >= threshold,
      members: [...team.members].sort(compareAverage)
    };
  });

  const compareTeams = (left, right) => {
    const comparison = (right.total_steps * left.reported_person_days) -
      (left.total_steps * right.reported_person_days);
    return comparison || String(left.name || '').localeCompare(String(right.name || ''));
  };
  const ranked = assignRanks(teams.filter(team => team.ranked).sort(compareTeams).map(team => ({
    ...team,
    days_reported: team.reported_person_days
  }))).map(({ days_reported, ...team }) => team);
  const unranked = teams
    .filter(team => !team.ranked)
    .sort((a, b) => b.reporting_rate - a.reporting_rate || compareTeams(a, b))
    .map(team => ({ ...team, rank: null }));
  return [...ranked, ...unranked];
}

function buildDailyStats(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const day = byDate.get(row.date) || { date: row.date, total_steps: 0, reports: 0 };
    day.total_steps += Number(row.count) || 0;
    day.reports += 1;
    byDate.set(row.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function getFeaturedChampions(database) {
  const archive = await get(database, `
    SELECT *
    FROM challenge_archives
    WHERE challenge_name = ?
      AND challenge_start_date = ?
      AND challenge_end_date = ?
    ORDER BY archive_timestamp DESC, id DESC
    LIMIT 1
  `, [FEATURED_CHALLENGE.name, FEATURED_CHALLENGE.startDate, FEATURED_CHALLENGE.endDate]);

  if (!archive) {
    const error = new Error('The 2025 champions archive is not available');
    error.code = 'CHAMPIONS_ARCHIVE_NOT_FOUND';
    throw error;
  }

  const archiveRows = await all(database, `
    SELECT user_id, user_name, user_team, date, count
    FROM challenge_archive_steps
    WHERE archive_id = ?
    ORDER BY date, user_id
  `, [archive.id]);
  const rows = archiveRows.filter(row =>
    !FEATURED_CHALLENGE.excludedParticipantNames.has(String(row.user_name).toLowerCase())
  );
  const totalDays = challengeDays(archive.challenge_start_date, archive.challenge_end_date);
  const threshold = archive.reporting_threshold === null || archive.reporting_threshold === undefined
    ? 100
    : Number(archive.reporting_threshold);
  const participants = buildParticipants(rows, totalDays, threshold);
  const teams = buildTeams(participants, totalDays, threshold);
  const daily = buildDailyStats(rows);
  const totalSteps = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const totalDistanceKm = (totalSteps / STEPS_PER_MILE) * KM_PER_MILE;
  const firstLegProgressKm = Math.min(totalDistanceKm, ROUTE.delhiToSingaporeKm);
  const secondLegProgressKm = Math.max(0, totalDistanceKm - ROUTE.delhiToSingaporeKm);
  const biggestDay = [...daily].sort((a, b) => b.total_steps - a.total_steps || a.date.localeCompare(b.date))[0] || null;
  const averageCollectiveDay = totalDays > 0 ? totalSteps / totalDays : 0;
  const perfectReporters = participants.filter(row => row.days_reported === totalDays).length;
  const expectedReports = participants.length * totalDays;

  return {
    season: FEATURED_CHALLENGE.season,
    challenge: {
      name: archive.challenge_name,
      start_date: archive.challenge_start_date,
      end_date: archive.challenge_end_date,
      days: totalDays,
      reporting_threshold: threshold
    },
    podiums: {
      individuals: participants.filter(row => row.ranked && row.rank <= 3),
      teams: teams.filter(row => row.ranked && row.rank <= 3)
    },
    totals: {
      steps: totalSteps,
      participants: participants.length,
      teams: teams.length,
      reports: rows.length,
      expected_reports: expectedReports,
      reporting_rate: expectedReports > 0 ? (rows.length * 100) / expectedReports : 0,
      average_steps_per_report: rows.length > 0 ? totalSteps / rows.length : 0,
      perfect_reporters: perfectReporters
    },
    journey: {
      estimated_km: totalDistanceKm,
      estimated_miles: totalSteps / STEPS_PER_MILE,
      marathon_equivalents: totalDistanceKm / MARATHON_KM,
      steps_per_mile_assumption: STEPS_PER_MILE,
      delhi_to_singapore_km: ROUTE.delhiToSingaporeKm,
      singapore_to_san_francisco_km: ROUTE.singaporeToSanFranciscoKm,
      first_leg_progress_km: firstLegProgressKm,
      second_leg_progress_km: secondLegProgressKm,
      second_leg_progress_percent: (secondLegProgressKm * 100) / ROUTE.singaporeToSanFranciscoKm
    },
    supporting: {
      biggest_day: biggestDay,
      average_collective_day: averageCollectiveDay,
      biggest_day_lift_percent: biggestDay && averageCollectiveDay > 0
        ? ((biggestDay.total_steps / averageCollectiveDay) - 1) * 100
        : 0
    },
    team_standings: teams,
    participant_standings: participants,
    provenance: {
      archive_id: archive.id,
      archive_timestamp: archive.archive_timestamp,
      excluded_test_records: archiveRows.length - rows.length,
      roster_source: 'archive_step_team_snapshot'
    }
  };
}

module.exports = {
  getFeaturedChampions,
  challengeDays,
  buildParticipants,
  buildTeams,
  FEATURED_CHALLENGE
};
