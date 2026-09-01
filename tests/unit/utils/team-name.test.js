const {
  MAX_TEAM_NAME_GRAPHEMES,
  MAX_TEAM_NAME_BYTES,
  normalizeTeamName,
  teamNameKey,
  graphemeCount
} = require('../../../src/utils/team-name');

describe('team name validation', () => {
  test('normalizes Unicode and surrounding/repeated whitespace', () => {
    expect(normalizeTeamName('  Cafe\u0301   Walkers  ')).toBe('Café Walkers');
    expect(teamNameKey('ＴＥＡＭ  Seven')).toBe('team seven');
  });

  test('allows printable Unicode and joined emoji', () => {
    const name = 'Hot Steppers 👨‍👩‍👧‍👦🔥';
    expect(normalizeTeamName(name)).toBe(name);
    expect(graphemeCount('👨‍👩‍👧‍👦')).toBe(1);
  });

  test('enforces grapheme and UTF-8 byte limits independently', () => {
    expect(normalizeTeamName('a'.repeat(MAX_TEAM_NAME_GRAPHEMES))).toHaveLength(MAX_TEAM_NAME_GRAPHEMES);
    expect(() => normalizeTeamName('a'.repeat(MAX_TEAM_NAME_GRAPHEMES + 1))).toThrow('32 characters or fewer');
    const byteHeavy = '👨‍👩‍👧‍👦'.repeat(8);
    expect(Buffer.byteLength(byteHeavy, 'utf8')).toBeGreaterThan(MAX_TEAM_NAME_BYTES);
    expect(() => normalizeTeamName(byteHeavy)).toThrow('128 UTF-8 bytes or fewer');
  });

  test.each([
    ['', 'required'],
    ['   ', 'required'],
    ['line\nbreak', 'control'],
    ['bad\u0000name', 'control'],
    ['<img onerror=alert(1)>', 'markup'],
    ['spoof\u202Ename', 'invisible'],
    ['zero\u200Bwidth', 'invisible'],
    [123, 'must be text']
  ])('rejects unsafe name %#', (value, message) => {
    expect(() => normalizeTeamName(value)).toThrow(message);
  });

  test('uses compatibility/case normalization for duplicate detection', () => {
    expect(teamNameKey('Team ７')).toBe(teamNameKey('team 7'));
  });
});
