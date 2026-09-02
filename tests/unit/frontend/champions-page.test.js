const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Champions Pantheon frontend', () => {
  const dashboard = read('src/views/dashboard.html');
  const page = read('src/views/champions.html');
  const script = read('src/public/champions.js');
  const wireframe = read('src/public/champions-wireframe.js');
  const styles = read('src/public/champions.css');

  test('puts the Pantheon first and the Trotter game last in Tidbits', () => {
    const tidbits = dashboard.match(/<details id="tidbitsSection"[\s\S]*?<\/details>/)?.[0] || '';
    expect(tidbits).toContain('href="/champions"');
    expect(tidbits).toContain('Enter the Pantheon');
    expect(tidbits.indexOf('championsCta')).toBeLessThan(tidbits.indexOf('userThemeSelector'));
    expect(tidbits.indexOf('pigGameBtn')).toBeGreaterThan(tidbits.indexOf('csvDownloadBtn'));
  });

  test('provides podiums, aggregate story, and complete standings', () => {
    for (const id of [
      'teamChampion', 'individualChampion', 'teamPodium', 'individualPodium',
      'club200KTitle', 'club200KDecree', 'club200KMembers',
      'totalSteps', 'routeGraphic', 'supportingStats', 'teamStandings',
      'participantStandings'
    ]) {
      expect(page).toContain(`id="${id}"`);
    }
    expect(page).toContain('Most Improved');
    expect(page).toContain('Most Consistent');
    expect(page).toContain('2026 vs. 2025');
    expect(page).toContain('200K Club · Class of 2026');
    expect(page).toContain('reach 200,000 steps with 100% reporting');
    expect(script).toContain("fetch('/api/champions'");
    expect(script).toContain('function renderClub200K(data)');
    expect(script).toContain('team.members');
    expect(script).toContain('--podium-height');
    expect(styles).toContain('min-height: var(--podium-height, 190px)');
  });

  test('shows disclosure triangles on team podium capsules and opens first place by default', () => {
    expect(script).toContain("<details class=\"team-podium-card\" ${index === 0 ? 'open' : ''}>");
    expect(styles).toMatch(/\.team-podium-card > summary::before\s*\{[\s\S]*?content: "▶"/);
    expect(styles).toMatch(/\.team-podium-card\[open\] > summary::before\s*\{\s*transform: rotate\(90deg\)/);
  });

  test('lets mouse and touch pointers directly rotate the trophy foot', () => {
    expect(wireframe).toContain("stage.addEventListener('pointerdown'");
    expect(wireframe).toContain("stage.addEventListener('pointermove'");
    expect(wireframe).toContain("stage.addEventListener('pointerup'");
    expect(wireframe).toContain('stage.setPointerCapture?.(event.pointerId)');
    expect(wireframe).toContain('rotationAngle = dragStartAngle');
    expect(styles).toMatch(/\.wireframe-stage\s*\{[\s\S]*?cursor: grab/);
    expect(styles).toMatch(/\.wireframe-stage\s*\{[\s\S]*?touch-action: pan-y/);
    expect(styles).toContain('.wireframe-stage.is-dragging { cursor: grabbing; }');
  });

  test('keeps the WebGL spectacle lightweight and accessible', () => {
    expect(wireframe).toContain("powerPreference: 'low-power'");
    expect(wireframe).toContain('Math.min(window.devicePixelRatio || 1, 1.5)');
    expect(wireframe).toContain("'(prefers-reduced-motion: reduce)'");
    expect(wireframe).toContain('IntersectionObserver');
    expect(wireframe).toContain('document.hidden');
    expect(wireframe).toContain('running = false;');
    expect(wireframe).toContain('contextLost = true;');
    const drawFunction = wireframe.match(/function draw[\s\S]*?\n    \}/)?.[0] || '';
    expect(drawFunction).not.toContain('getBoundingClientRect');
    expect(drawFunction).not.toContain('resize()');
    expect(wireframe).not.toMatch(/\bTHREE\b|\bBABYLON\b|model-viewer/);
    expect(page).toContain('THE TROPHY FOOT');
    expect(page).toContain('wireframe-fallback');
    expect(styles).toContain('.wireframe-stage.no-webgl .wireframe-fallback');
  });
});
