const { getFeaturedChampions, challengeDays, buildParticipants } = require('../../../src/services/champions');

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
    addComplete(1, 'alice.walker', 'Scrambled Legs', 100);
    addComplete(2, 'sam.strider', 'Scrambled Legs', 80);
    addComplete(3, 'indy.champion', 'Walkaholics', 120);
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
    expect(result.provenance).toMatchObject({
      archive_id: 2,
      excluded_test_records: 1,
      roster_source: 'archive_step_team_snapshot'
    });
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
