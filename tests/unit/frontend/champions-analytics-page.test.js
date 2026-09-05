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
    expect(script).toContain('class="heat-cell heat-${heatLevel(day.steps)}');
    expect(script).toContain('const thresholds = [.12, .3, .5, .7, .87]');
    expect(page).toContain('id="heatTooltip"');
    expect(script).toContain('function prepareHeatmapTooltip()');
    expect(script).toContain('data-heat-note');
    expect(styles).toContain('.heatmap-shell');
    expect(styles).toContain('.heat-cell.heat-6');
    expect(styles).toContain('.heat-cell.missing');
    expect(styles).toContain('.heat-tooltip');
  });

  test('renders cumulative daily-average rank changes with animated crossing lines', () => {
    expect(page).toContain('id="rankBumpChart"');
    expect(page).toContain('data-bump-group="teams"');
    expect(page).toContain('Top 12 people');
    expect(script).toContain('function rankAtDay(entities, dayIndex)');
    expect(script).toContain('days[dayIndex].cumulative_average');
    expect(script).toContain('days.at(-1).cumulative_average');
    expect(page).toContain('ranked by cumulative daily average');
    expect(script).toContain('function renderBumpChart(data');
    expect(script).toContain('pathLength="1"');
    expect(styles).toContain('@keyframes draw-rank-line');
  });

  test('plots people, teams, or both by intensity and explicitly defined consistency', () => {
    expect(page).toContain('id="constellationChart"');
    expect(page).toContain('data-constellation-group="people"');
    expect(page).toContain('data-constellation-group="teams"');
    expect(page).toContain('data-constellation-group="both"');
    expect(page).toContain('What does “consistency” mean?');
    expect(page).toContain('coefficient of variation');
    expect(script).toContain('function weightedStats(observations, reportingRate)');
    expect(script).toContain('function statsForPerson(person)');
    expect(script).toContain('function statsForTeam(team)');
    expect(script).toContain('reports.length / person.days.length');
    expect(script).toContain('Math.sqrt(point.total / maxPersonTotal)');
    expect(script).toContain('function renderConstellation(data');
    expect(styles).toContain('.star-group:hover .star');
    expect(styles).toContain('.team-nebula .star');
  });

  test('uses p50 metric dividers, in-chart quadrant labels, and randomized excessive titles', () => {
    expect(script).toContain('function median(values)');
    expect(script).toContain('medianMean');
    expect(script).toContain('medianConsistency');
    expect(script).toContain('STEADY PILGRIMS');
    expect(script).toContain('RELENTLESS TITANS');
    expect(script).toContain('P50 CONSISTENCY');
    expect(script).toContain('The Foot Nebula');
    expect(script).toContain('The Calves of Creation');
    expect(styles).toContain('.median-line');
    expect(styles).toContain('.quadrant-label');
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
