const {
  getChampions,
  getFeaturedChampions,
  challengeDays,
  buildParticipants,
  buildRaceTimeline,
  buildConsistencyHonors,
  buildComparison
} = require('../../../src/services/champions');

function archiveRow(userId, name, team, day, count) {
  return {
    user_id: userId,
    user_name: name,
    user_team: team,
    date: `2025-08-${String(day).padStart(2, '0')}`,
    count
  };
}

function fakeDatabase(rows) {
  return {
    get: (_sql, _params, callback) => callback(null, {
      id: 2,
      challenge_name: 'SigFig Step Challenge 2025',
      challenge_start_date: '2025-08-01',
      challenge_end_date: '2025-08-15',
      reporting_threshold: 100,
      archive_timestamp: '2025-08-21 21:44:20'
    }),
    all: (_sql, _params, callback) => callback(null, rows)
  };
}

describe('featured champions archive service', () => {
  test('counts the inclusive championship period', () => {
    expect(challengeDays('2025-08-01', '2025-08-15')).toBe(15);
  });

  test('builds podiums and totals from the final archive while excluding the known test row', async () => {
    const rows = [];
    const addComplete = (id, name, team, dailySteps) => {
      for (let day = 1; day <= 15; day += 1) rows.push(archiveRow(id, name, team, day, dailySteps));
    };
    addComplete(1, 'alice.walker', 'Scrambled Legs', 15000);
    addComplete(2, 'sam.strider', 'Scrambled Legs', 14000);
    addComplete(3, 'indy.champion', 'Walkaholics', 20000);
    addComplete(4, 'walker.two', 'Walkaholics', 40);
    addComplete(5, 'third.place', 'Game of Soles', 70);
    rows.push(archiveRow(6, 'incomplete.walker', 'Game of Soles', 1, 1000));
    rows.push(archiveRow(99, 'benny+test', null, 13, 69999));

    const result = await getFeaturedChampions(fakeDatabase(rows));

    expect(result.podiums.individuals.map(row => row.name)).toEqual([
      'indy.champion', 'alice.walker', 'sam.strider'
    ]);
    expect(result.podiums.teams.map(row => row.name)).toEqual([
      'Scrambled Legs', 'Walkaholics'
    ]);
    expect(result.team_standings.find(row => row.name === 'Game of Soles')).toMatchObject({
      ranked: false,
      rank: null
    });
    expect(result.clubs.two_hundred_k).toMatchObject({
      threshold_steps: 200000,
      required_reporting_rate: 100
    });
    expect(result.clubs.two_hundred_k.members.map(row => row.name)).toEqual([
      'indy.champion', 'alice.walker', 'sam.strider'
    ]);
    expect(result.participant_standings.at(-1)).toMatchObject({
      name: 'incomplete.walker',
      ranked: false,
      days_reported: 1
    });
    expect(result.totals).toMatchObject({
      participants: 6,
      teams: 3,
      reports: 76,
      expected_reports: 90,
      perfect_reporters: 5
    });
    expect(result.race).toMatchObject({
      dates: expect.arrayContaining(['2025-08-01', '2025-08-15']),
      people: expect.any(Array),
      teams: expect.any(Array)
    });
    for (const team of result.team_standings) {
      const timeline = result.race.teams.find(candidate => candidate.name === team.name);
      expect(timeline.days.at(-1).cumulative_average).toBeCloseTo(team.average_steps, 8);
    }
    for (const person of result.participant_standings) {
      const timeline = result.race.people.find(candidate => candidate.id === person.id);
      expect(timeline.days.at(-1).cumulative_average).toBeCloseTo(person.average_steps, 8);
    }
    expect(result.provenance).toMatchObject({
      archive_id: 2,
      excluded_test_records: 1,
      roster_source: 'archive_step_team_snapshot'
    });
  });

  test('can render an explicitly selected published season from the same archive format', async () => {
    const rows = [];
    for (let day = 1; day <= 15; day += 1) {
      rows.push(archiveRow(1, 'season.winner', 'Future Soles', day, 20000));
    }
    const result = await getChampions(fakeDatabase(rows), 2026);
    expect(result.season).toBe(2026);
    expect(result.podiums.individuals[0].name).toBe('season.winner');
    expect(result.podiums.teams[0].name).toBe('Future Soles');
    expect(result.next_challenge).toEqual({
      season: 2027,
      start_date: '2027-09-01',
      end_date: '2027-09-15',
      provisional: true
    });
    expect(result.honors.most_consistent.name).toBe('season.winner');
    expect(result.honors.comparison).toBeTruthy();
    expect(result.journey.reverse_route).toMatchObject({
      calgary_to_san_francisco_km: expect.any(Number),
      san_francisco_to_singapore_km: expect.any(Number),
      singapore_to_delhi_km: expect.any(Number),
      total_route_km: expect.any(Number)
    });
  });

  test('awards consistency to the lowest-variation perfect reporter', () => {
    const rows = [
      archiveRow(1, 'steady', 'A', 1, 100), archiveRow(1, 'steady', 'A', 2, 100),
      archiveRow(2, 'swingy', 'A', 1, 10), archiveRow(2, 'swingy', 'A', 2, 190)
    ];
    const participants = buildParticipants(rows, 2, 100);
    const honors = buildConsistencyHonors(rows, participants, 2);
    expect(honors[0]).toMatchObject({ name: 'steady', consistency_score: 100 });
    expect(honors[1].consistency_score).toBeLessThan(100);
  });

  test('compares improvement only among participants ranked in both seasons', () => {
    const current = [
      { id: 1, name: 'improved', ranked: true, average_steps: 200, total_steps: 200, days_reported: 1 },
      { id: 2, name: 'unranked', ranked: true, average_steps: 500, total_steps: 500, days_reported: 1 }
    ];
    const baseline = [
      { id: 1, name: 'improved', ranked: true, average_steps: 100, total_steps: 100, days_reported: 1 },
      { id: 2, name: 'unranked', ranked: false, average_steps: 1, total_steps: 1, days_reported: 1 }
    ];
    const comparison = buildComparison(current, baseline);
    expect(comparison.most_improved).toMatchObject({
      name: 'improved',
      average_step_change: 100,
      average_step_change_percent: 100
    });
    expect(comparison.returning_ranked_participants).toBe(1);
    expect(comparison.cumulative_daily_average).toMatchObject({
      current: 350,
      baseline: 50.5,
      change: 299.5,
      participant_count: 2,
      baseline_participant_count: 2,
      reported_person_days: 2,
      baseline_reported_person_days: 2
    });
    expect(comparison.cumulative_daily_average.change_percent).toBeCloseTo(593.069, 3);
  });

  test('weights the collective cumulative daily average by reported person-days', () => {
    const comparison = buildComparison([
      { id: 1, name: 'two.days', ranked: true, total_steps: 200, days_reported: 2, average_steps: 100 },
      { id: 2, name: 'one.day', ranked: true, total_steps: 300, days_reported: 1, average_steps: 300 }
    ], [
      { id: 1, name: 'two.days', ranked: true, total_steps: 150, days_reported: 2, average_steps: 75 },
      { id: 2, name: 'one.day', ranked: true, total_steps: 150, days_reported: 1, average_steps: 150 }
    ]);
    expect(comparison.cumulative_daily_average).toMatchObject({
      current: 500 / 3,
      baseline: 100,
      reported_person_days: 3,
      baseline_reported_person_days: 3
    });
  });

  test('Club 200K requires both 200,000 steps and every daily report', async () => {
    const rows = [];
    for (let day = 1; day <= 15; day += 1) {
      rows.push(archiveRow(1, 'exact.member', 'A', day, day === 15 ? 13338 : 13333));
      rows.push(archiveRow(2, 'under.member', 'A', day, 13333));
      if (day < 15) rows.push(archiveRow(3, 'incomplete.member', 'B', day, 15000));
    }

    const result = await getFeaturedChampions(fakeDatabase(rows));

    expect(result.clubs.two_hundred_k.members.map(row => row.name)).toEqual(['exact.member']);
    expect(result.clubs.two_hundred_k.members[0]).toMatchObject({
      total_steps: 200000,
      days_reported: 15,
      reporting_rate: 100
    });
  });

  test('builds day-by-day cumulative person and team race series', () => {
    const timeline = buildRaceTimeline([
      archiveRow(1, 'one', 'A', 1, 100),
      archiveRow(2, 'two', 'A', 1, 300),
      archiveRow(1, 'one', 'A', 2, 300)
    ], '2025-08-01', '2025-08-03');

    expect(timeline.dates).toEqual(['2025-08-01', '2025-08-02', '2025-08-03']);
    expect(timeline.people.find(person => person.name === 'one').days).toEqual([
      { steps: 100, cumulative: 100, reported: true, cumulative_reports: 1, cumulative_average: 100 },
      { steps: 300, cumulative: 400, reported: true, cumulative_reports: 2, cumulative_average: 200 },
      { steps: 0, cumulative: 400, reported: false, cumulative_reports: 2, cumulative_average: 200 }
    ]);
    expect(timeline.teams[0]).toMatchObject({ name: 'A', member_count: 2 });
    expect(timeline.teams[0].days).toEqual([
      { steps: 400, cumulative: 400, reports: 2, average: 200, cumulative_reports: 2, cumulative_average: 200 },
      { steps: 300, cumulative: 700, reports: 1, average: 300, cumulative_reports: 3, cumulative_average: 700 / 3 },
      { steps: 0, cumulative: 700, reports: 0, average: 0, cumulative_reports: 3, cumulative_average: 700 / 3 }
    ]);
  });

  test('assigns shared places to exact average ties', () => {
    const participants = buildParticipants([
      archiveRow(1, 'one', 'A', 1, 100),
      archiveRow(2, 'two', 'B', 1, 100),
      archiveRow(3, 'three', 'C', 1, 90)
    ], 1, 100);
    expect(participants.map(({ name, rank }) => [name, rank])).toEqual([
      ['one', 1], ['two', 1], ['three', 3]
    ]);
  });

  test('returns a specific error when the 2025 archive is missing', async () => {
    const database = {
      get: (_sql, _params, callback) => callback(null, undefined),
      all: jest.fn()
    };
    await expect(getFeaturedChampions(database)).rejects.toMatchObject({
      code: 'CHAMPIONS_ARCHIVE_NOT_FOUND'
    });
    expect(database.all).not.toHaveBeenCalled();
  });
});
