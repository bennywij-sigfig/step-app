const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../../', file), 'utf8');

describe('normalized live team source contract', () => {
  const server = read('src/server.js');
  const chat = read('src/services/step-chat.js');
  const shadow = read('src/shadow-api.js');
  const database = read('src/database.js');
  const restApi = read('src/routes/rest-api.js');

  test('live query paths do not read or write the deprecated copied name', () => {
    for (const source of [server, chat, shadow, restApi]) {
      expect(source).not.toMatch(/\bu\.team\b/);
      expect(source).not.toMatch(/UPDATE\s+users\s+SET\s+team\s*=/i);
      expect(source).not.toMatch(/GROUP\s+BY\s+u\.team/i);
    }
  });

  test('live team names are resolved through users.team_id', () => {
    expect(server).toContain('t.id = u.team_id');
    expect(chat).toContain('t.id = u.team_id');
    expect(shadow).toContain('t.id = u.team_id');
    expect(restApi).toContain('t.id = u.team_id');
  });

  test('migration is transactional, validates mappings, and clears duplicate names', () => {
    expect(database).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_key');
    expect(database).toContain('Duplicate normalized team name');
    expect(database).toContain("await run('BEGIN IMMEDIATE')");
    expect(database).toContain('legacy team assignments could not be normalized');
    expect(database).toContain("await run('UPDATE users SET team = NULL WHERE team IS NOT NULL')");
    expect(database).toContain("await run('COMMIT')");
    expect(database).toContain("await run('ROLLBACK')");
  });

  test('historical snapshots intentionally retain copied names', () => {
    expect(database).toContain('user_team TEXT');
    expect(database).toContain('team_name TEXT');
    expect(server).toContain('step.user_team');
    expect(server).toContain('player.team_name');
  });
});
