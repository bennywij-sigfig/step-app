const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'src/public/leaderboard-rank-history.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/public/dashboard.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/views/dashboard.html'), 'utf8');

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    values
  };
}

function makeRow(key) {
  const attributes = {};
  const rank = {
    classList: classList(),
    setAttribute: (name, value) => { attributes[name] = value; },
    attributes,
    title: ''
  };
  return {
    dataset: { rankKey: String(key) },
    classList: classList(),
    style: { setProperty: jest.fn() },
    parentElement: { appendChild: jest.fn() },
    getBoundingClientRect: () => ({ top: Number(key) * 50 }),
    querySelector: selector => selector === '.rank' ? rank : null,
    rank
  };
}

function setup(reducedMotion = true, preciseHover = true) {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const window = {
    localStorage: storage,
    matchMedia: query => ({
      matches: query === '(hover: hover) and (pointer: fine)' ? preciseHover : reducedMotion
    }),
    setTimeout: callback => { callback(); return 1; },
    clearTimeout: () => {}
  };
  vm.runInNewContext(source, { window, JSON, Date, Object, Number });
  return { api: window.LeaderboardRankHistory, storage, values };
}

describe('device-local leaderboard rank history', () => {
  test('stores the first challenge snapshot without presenting false movement', () => {
    const { api, storage } = setup();
    const rows = [makeRow(1), makeRow(2)];
    const container = { querySelectorAll: () => rows };

    expect(api.apply({
      container, kind: 'individual', scope: 'challenge:9', viewerId: 4,
      entries: [{ key: 1, rank: 1 }, { key: 2, rank: 2 }], storage
    })).toEqual([]);
    expect(JSON.parse(storage.getItem(api.storageKey('individual', 4))).ranks).toEqual({ 1: 1, 2: 2 });
  });

  test('colors improved and declined ranks without adding arrows', () => {
    const { api, storage } = setup();
    const rows = [makeRow(1), makeRow(2)];
    const container = { querySelectorAll: () => rows };
    const common = { container, kind: 'team', scope: 'challenge:9', viewerId: 4, storage };
    api.apply({ ...common, entries: [{ key: 1, rank: 1 }, { key: 2, rank: 2 }] });

    const changes = api.apply({ ...common, entries: [{ key: 2, rank: 1 }, { key: 1, rank: 2 }] });

    expect(changes).toEqual([
      { key: '2', previousRank: 2, rank: 1, direction: 'up' },
      { key: '1', previousRank: 1, rank: 2, direction: 'down' }
    ]);
    expect(rows[1].rank.classList.contains('rank-improved')).toBe(true);
    expect(rows[0].rank.classList.contains('rank-declined')).toBe(true);
    expect(rows[1].rank.attributes['aria-label']).toBe('Rank 1, improved from rank 2');
    expect(rows[1].rank.attributes['data-rank-context']).toBe('Previously #2 · improved');
    expect(rows[1].rank.attributes.tabindex).toBe('0');
    expect(rows[0].rank.title).toBe('Previously #1');
    expect(page).not.toContain('content: "↑"');
    expect(page).not.toContain('content: "↓"');
  });

  test('keeps tooltip behavior off touch-oriented devices', () => {
    const { api, storage } = setup(true, false);
    const rows = [makeRow(1), makeRow(2)];
    const container = { querySelectorAll: () => rows };
    const common = { container, kind: 'team', scope: 'challenge:9', viewerId: 4, storage };
    api.apply({ ...common, entries: [{ key: 1, rank: 1 }, { key: 2, rank: 2 }] });

    api.apply({ ...common, entries: [{ key: 2, rank: 1 }, { key: 1, rank: 2 }] });

    expect(rows[1].rank.attributes['aria-label']).toBe('Rank 1, improved from rank 2');
    expect(rows[1].rank.attributes['data-rank-context']).toBeUndefined();
    expect(rows[1].rank.attributes.tabindex).toBeUndefined();
    expect(rows[1].rank.title).toBe('');
    expect(page).toMatch(/@media \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.rank-history-tooltip\s*\{[\s\S]*?display: none !important/);
  });

  test('does not compare ranks across challenge boundaries', () => {
    const { api, storage } = setup();
    const row = makeRow(1);
    const container = { querySelectorAll: () => [row] };
    api.apply({ container, kind: 'individual', scope: 'challenge:8', viewerId: 4, entries: [{ key: 1, rank: 5 }], storage });
    expect(api.apply({ container, kind: 'individual', scope: 'challenge:9', viewerId: 4, entries: [{ key: 1, rank: 1 }], storage })).toEqual([]);
    expect(row.rank.classList.contains('rank-improved')).toBe(false);
  });

  test('replay restores the previous state before creating fresh movement animations', () => {
    const { api, storage } = setup(false);
    const rows = [makeRow(1), makeRow(2)];
    rows.forEach(row => { row.animate = jest.fn(); });
    const container = { classList: classList(), querySelectorAll: () => rows };
    const common = { container, kind: 'team', scope: 'challenge:9', viewerId: 4, storage };
    api.apply({ ...common, entries: [{ key: 1, rank: 1 }, { key: 2, rank: 2 }] });
    api.apply({ ...common, entries: [{ key: 2, rank: 1 }, { key: 1, rank: 2 }] });
    rows.forEach(row => row.animate.mockClear());

    expect(api.replay(container)).toBe(true);
    rows.forEach(row => {
      expect(row.animate).toHaveBeenCalledTimes(1);
      expect(row.animate.mock.calls[0][0][0].transform).toContain('translateY(');
      expect(row.animate.mock.calls[0][1]).toMatchObject({ duration: 900, easing: 'linear' });
    });
    expect(rows.map(row => row.animate.mock.calls[0][1].delay).sort((a, b) => a - b)).toEqual([0, 100]);
  });

  test('dashboard wires stable ranked identities and separate individual/team histories', () => {
    expect(page).toContain('src="/leaderboard-rank-history.js"');
    expect(page.indexOf('/leaderboard-rank-history.js')).toBeLessThan(page.indexOf('/dashboard.js'));
    expect(page).toContain('@keyframes rank-change-flip');
    expect(page).toContain('animation: rank-change-flip 900ms linear');
    expect(page).toContain('.rank-history-tooltip');
    expect(source).toContain('function attachRankContext(row, rank)');
    expect(source).toContain("window.matchMedia?.('(hover: hover) and (pointer: fine)')");
    expect(source).toContain("row.addEventListener('pointerenter', show)");
    expect(page).toContain('.rank.rank-improved');
    expect(page).toContain('.rank.rank-declined');
    expect(dashboard).toContain('function applyRankHistory(');
    expect(dashboard).toContain("applyRankHistory(leaderboardDiv, 'individual'");
    expect(dashboard).toContain("applyRankHistory(teamLeaderboard, 'team'");
    expect(dashboard).toContain('data-rank-key="${Number(user.id)}"');
    expect(dashboard).toContain('data-rank-key="${Number(team.team_id)}"');
  });
});
