const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Excessive Step Analytics lab', () => {
  const page = read('src/views/champions-analytics.html');
  const script = read('src/public/champions-analytics.js');
  const styles = read('src/public/champions-analytics.css');
  const server = read('src/server.js');

  test('is an authenticated standalone champions route with dedicated assets', () => {
    expect(server).toContain("app.get('/champions/analytics', requireAuth");
    expect(page).toContain('href="/champions-analytics.css"');
    expect(page).toContain('src="/champions-analytics.js"');
    expect(page).toContain('href="/champions"');
    expect(page).not.toMatch(/return to champions/i);
    expect(script).toContain("fetch('/api/champions'");
  });

  test('renders the heatmap tapestry for teams and all participants', () => {
    expect(page).toContain('id="stepHeatmap"');
    expect(page).toContain('data-heatmap-group="teams"');
    expect(page).toContain('data-heatmap-group="people"');
    expect(script).toContain('function renderHeatmap(data');
    expect(script).toContain("class=\"heat-cell ${reported ? '' : 'missing'}\"");
    expect(styles).toContain('.heatmap-shell');
    expect(styles).toContain('.heat-cell.missing');
  });

  test('renders cumulative rank changes with animated crossing lines', () => {
    expect(page).toContain('id="rankBumpChart"');
    expect(page).toContain('data-bump-group="teams"');
    expect(page).toContain('Top 12 people');
    expect(script).toContain('function rankAtDay(entities, dayIndex)');
    expect(script).toContain('function renderBumpChart(data');
    expect(script).toContain('pathLength="1"');
    expect(styles).toContain('@keyframes draw-rank-line');
  });

  test('plots all people by intensity, reporting-aware consistency, and total steps', () => {
    expect(page).toContain('id="constellationChart"');
    expect(script).toContain('function statsForPerson(person)');
    expect(script).toContain('(reports.length / person.days.length)');
    expect(script).toContain('Math.sqrt(point.total / maxTotal)');
    expect(script).toContain('function renderConstellation(data)');
    expect(styles).toContain('.star-group:hover .star');
  });

  test('contains all three excessive experiments and responsive contained scrollers', () => {
    expect(page).toContain('THE WOVEN TAPESTRY OF FOOTFALLS');
    expect(page).toContain('THE GREAT JOSTLING');
    expect(page).toContain('THE CALF CONSTELLATION');
    expect(styles).toContain('.heatmap-shell {');
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.chart-shell \{ overflow-x: auto;/);
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
