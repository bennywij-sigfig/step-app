const FEATURED_CHALLENGE = Object.freeze({
  season: 2025,
  name: 'SigFig Step Challenge 2025',
  startDate: '2025-08-01',
  endDate: '2025-08-15'
});
const EXCLUDED_PARTICIPANT_NAMES = new Set(['benny+test']);

const STEPS_PER_MILE = 2000;
const KM_PER_MILE = 1.609344;
const MARATHON_KM = 42.195;
const CLUB_200K_MIN_STEPS = 200000;
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

function buildConsistencyHonors(rows, participants, totalDays) {
  const stepsByUser = new Map();
  rows.forEach(row => {
    const key = String(row.user_id);
    const values = stepsByUser.get(key) || [];
    values.push(Number(row.count) || 0);
    stepsByUser.set(key, values);
  });

  return participants
    .filter(person => person.days_reported === totalDays)
    .map(person => {
      const values = stepsByUser.get(String(person.id)) || [];
      const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      const variance = values.length
        ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
        : 0;
      const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : Infinity;
      return {
        ...person,
        consistency_score: Number.isFinite(coefficientOfVariation)
          ? 100 / (1 + coefficientOfVariation)
          : 0,
        coefficient_of_variation: Number.isFinite(coefficientOfVariation)
          ? coefficientOfVariation
          : null
      };
    })
    .sort((left, right) =>
      right.consistency_score - left.consistency_score || compareAverage(left, right)
    );
}

function buildComparison(currentParticipants, baselineParticipants, currentTotals, baselineTotals) {
  const baselineById = new Map(baselineParticipants.map(person => [String(person.id), person]));
  const improved = currentParticipants
    .filter(person => person.ranked && baselineById.get(String(person.id))?.ranked)
    .map(person => {
      const baseline = baselineById.get(String(person.id));
      return {
        ...person,
        baseline_average_steps: baseline.average_steps,
        average_step_change: person.average_steps - baseline.average_steps,
        average_step_change_percent: baseline.average_steps > 0
          ? ((person.average_steps / baseline.average_steps) - 1) * 100
          : null
      };
    })
    .sort((left, right) =>
      right.average_step_change - left.average_step_change || compareAverage(left, right)
    );

  return {
    baseline_season: FEATURED_CHALLENGE.season,
    most_improved: improved[0] || null,
    returning_ranked_participants: improved.length,
    totals: {
      steps_change: currentTotals.steps - baselineTotals.steps,
      steps_change_percent: baselineTotals.steps > 0
        ? ((currentTotals.steps / baselineTotals.steps) - 1) * 100
        : null,
      participants_change: currentTotals.participants - baselineTotals.participants,
      reporting_rate_change_points: currentTotals.reporting_rate - baselineTotals.reporting_rate
    }
  };
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

function buildRaceTimeline(rows, startDate, endDate) {
  const dates = [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let instant = start; Number.isFinite(instant) && instant <= end; instant += 86400000) {
    dates.push(new Date(instant).toISOString().slice(0, 10));
  }

  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const people = new Map();
  for (const row of rows) {
    const index = dateIndex.get(row.date);
    if (index === undefined) continue;
    const key = String(row.user_id);
    const person = people.get(key) || {
      id: row.user_id,
      name: row.user_name,
      team: row.user_team || null,
      steps: Array(dates.length).fill(0),
      reported: Array(dates.length).fill(false)
    };
    person.steps[index] += Number(row.count) || 0;
    person.reported[index] = true;
    people.set(key, person);
  }

  const personSeries = [...people.values()].map(person => {
    let cumulative = 0;
    let cumulativeReports = 0;
    return {
      id: person.id,
      name: person.name,
      team: person.team,
      days: person.steps.map((steps, index) => {
        cumulative += steps;
        if (person.reported[index]) cumulativeReports += 1;
        return {
          steps,
          cumulative,
          reported: person.reported[index],
          cumulative_reports: cumulativeReports,
          cumulative_average: cumulativeReports > 0 ? cumulative / cumulativeReports : 0
        };
      })
    };
  });

  const teams = new Map();
  for (const person of personSeries) {
    if (!person.team) continue;
    const team = teams.get(person.team) || {
      name: person.team,
      member_count: 0,
      steps: Array(dates.length).fill(0),
      reports: Array(dates.length).fill(0)
    };
    team.member_count += 1;
    person.days.forEach((day, index) => {
      team.steps[index] += day.steps;
      if (day.reported) team.reports[index] += 1;
    });
    teams.set(person.team, team);
  }

  const teamSeries = [...teams.values()].map(team => {
    let cumulative = 0;
    let cumulativeReports = 0;
    return {
      name: team.name,
      member_count: team.member_count,
      days: team.steps.map((steps, index) => {
        cumulative += steps;
        cumulativeReports += team.reports[index];
        return {
          steps,
          cumulative,
          reports: team.reports[index],
          average: team.reports[index] > 0 ? steps / team.reports[index] : 0,
          cumulative_reports: cumulativeReports,
          cumulative_average: cumulativeReports > 0 ? cumulative / cumulativeReports : 0
        };
      })
    };
  });

  return { dates, people: personSeries, teams: teamSeries };
}

async function findChampionsArchive(database, season) {
  if (season === FEATURED_CHALLENGE.season) {
    // Keep the original 2025 Pantheon available without requiring a data
    // migration on the production database.
    return get(database, `
      SELECT ca.*, NULL AS published_at
      FROM challenge_archives ca
      WHERE ca.challenge_name = ?
        AND ca.challenge_start_date = ?
        AND ca.challenge_end_date = ?
      ORDER BY ca.archive_timestamp DESC, ca.id DESC
      LIMIT 1
    `, [FEATURED_CHALLENGE.name, FEATURED_CHALLENGE.startDate, FEATURED_CHALLENGE.endDate]);
  }

  return get(database, `
    SELECT ca.*, cp.published_at
    FROM champions_publications cp
    JOIN challenge_archives ca ON ca.id = cp.archive_id
    WHERE cp.season = ?
    LIMIT 1
  `, [season]);
}

async function getChampions(database, season = FEATURED_CHALLENGE.season) {
  if (!Number.isInteger(season) || season < 2025 || season > 9999) {
    const error = new Error('Invalid champions season');
    error.code = 'INVALID_CHAMPIONS_SEASON';
    throw error;
  }

  const archive = await findChampionsArchive(database, season);
  if (!archive) {
    const error = new Error(`The ${season} champions have not been published`);
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
    !EXCLUDED_PARTICIPANT_NAMES.has(String(row.user_name).toLowerCase())
  );
  const totalDays = challengeDays(archive.challenge_start_date, archive.challenge_end_date);
  const threshold = archive.reporting_threshold === null || archive.reporting_threshold === undefined
    ? 100
    : Number(archive.reporting_threshold);
  const participants = buildParticipants(rows, totalDays, threshold);
  const teams = buildTeams(participants, totalDays, threshold);
  const daily = buildDailyStats(rows);
  const race = buildRaceTimeline(rows, archive.challenge_start_date, archive.challenge_end_date);
  const totalSteps = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const totalDistanceKm = (totalSteps / STEPS_PER_MILE) * KM_PER_MILE;
  const firstLegProgressKm = Math.min(totalDistanceKm, ROUTE.delhiToSingaporeKm);
  const secondLegProgressKm = Math.max(0, totalDistanceKm - ROUTE.delhiToSingaporeKm);
  const biggestDay = [...daily].sort((a, b) => b.total_steps - a.total_steps || a.date.localeCompare(b.date))[0] || null;
  const averageCollectiveDay = totalDays > 0 ? totalSteps / totalDays : 0;
  const perfectReporters = participants.filter(row => row.days_reported === totalDays).length;
  const expectedReports = participants.length * totalDays;
  const club200KMembers = participants.filter(participant =>
    participant.days_reported === totalDays && participant.total_steps >= CLUB_200K_MIN_STEPS
  );
  const club200KTotalSteps = club200KMembers.reduce((sum, participant) => sum + participant.total_steps, 0);
  const consistencyHonors = buildConsistencyHonors(rows, participants, totalDays);
  let comparison = null;
  if (season > FEATURED_CHALLENGE.season) {
    const baselineArchive = await findChampionsArchive(database, FEATURED_CHALLENGE.season);
    if (baselineArchive) {
      const baselineArchiveRows = await all(database, `
        SELECT user_id, user_name, user_team, date, count
        FROM challenge_archive_steps
        WHERE archive_id = ?
        ORDER BY date, user_id
      `, [baselineArchive.id]);
      const baselineRows = baselineArchiveRows.filter(row =>
        !EXCLUDED_PARTICIPANT_NAMES.has(String(row.user_name).toLowerCase())
      );
      const baselineDays = challengeDays(baselineArchive.challenge_start_date, baselineArchive.challenge_end_date);
      const baselineThreshold = Number(baselineArchive.reporting_threshold ?? 100);
      const baselineParticipants = buildParticipants(baselineRows, baselineDays, baselineThreshold);
      const baselineExpectedReports = baselineParticipants.length * baselineDays;
      comparison = buildComparison(participants, baselineParticipants, {
        steps: totalSteps,
        participants: participants.length,
        reporting_rate: expectedReports > 0 ? (rows.length * 100) / expectedReports : 0
      }, {
        steps: baselineRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
        participants: baselineParticipants.length,
        reporting_rate: baselineExpectedReports > 0
          ? (baselineRows.length * 100) / baselineExpectedReports
          : 0
      });
    }
  }

  return {
    season,
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
    honors: {
      most_consistent: consistencyHonors[0] || null,
      comparison
    },
    next_challenge: {
      season: season + 1,
      start_date: `${season + 1}-09-01`,
      end_date: `${season + 1}-09-15`,
      provisional: true
    },
    clubs: {
      two_hundred_k: {
        threshold_steps: CLUB_200K_MIN_STEPS,
        required_reporting_rate: 100,
        members: club200KMembers,
        total_steps: club200KTotalSteps,
        share_of_challenge_steps: totalSteps > 0 ? (club200KTotalSteps * 100) / totalSteps : 0
      }
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
    race,
    team_standings: teams,
    participant_standings: participants,
    provenance: {
      archive_id: archive.id,
      archive_timestamp: archive.archive_timestamp,
      published_at: archive.published_at || null,
      excluded_test_records: archiveRows.length - rows.length,
      roster_source: 'archive_step_team_snapshot'
    }
  };
}

function getFeaturedChampions(database) {
  return getChampions(database, FEATURED_CHALLENGE.season);
}

module.exports = {
  getChampions,
  getFeaturedChampions,
  challengeDays,
  buildParticipants,
  buildTeams,
  buildRaceTimeline,
  buildConsistencyHonors,
  buildComparison,
  FEATURED_CHALLENGE,
  CLUB_200K_MIN_STEPS
};
