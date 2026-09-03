const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Champions Pantheon frontend', () => {
  const dashboard = read('src/views/dashboard.html');
  const page = read('src/views/champions.html');
  const script = read('src/public/champions.js');
  const wireframe = read('src/public/champions-wireframe.js');
  const globe = read('src/public/champions-globe.js');
  const land = read('src/public/world-land-110m.js');
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

  test('animates the journey at constant speed across a draggable projected globe', () => {
    for (const id of ['routeGraphic', 'journeyGlobeCanvas', 'routeLinear', 'routeLinearMarker']) {
      expect(page).toContain(`id="${id}"`);
    }
    expect(page).toContain('class="route-globe-fallback"');
    expect(page).toContain('src="/world-land-110m.js"');
    expect(page).toContain('src="/champions-globe.js"');
    expect(page).toContain('tabindex="0"');
    expect(script).toContain('function prepareJourneyAnimation(routePercent)');
    expect(script).toContain('window.PantheonGlobe?.create');
    expect(script).toContain("linearRoute.querySelectorAll('.city-dot')");
    expect(script).toContain("linearRoute.querySelector('.route-leg.onward').getBoundingClientRect()");
    expect(script).toContain('onwardLeg.width * onwardFraction');
    expect(script).toContain('(now - startedAt) / duration');
    expect(script).not.toContain('Math.pow(1 - linearProgress');
    expect(script).toContain('observer.observe(globe)');
    expect(globe).toContain('const greatCirclePoint =');
    expect(globe).toContain('function project([longitude, latitude])');
    expect(globe).toContain('const firstLegShare = totalDistance ? firstDistance / totalDistance : 1');
    expect(globe).toContain("container.addEventListener('pointerdown'");
    expect(globe).toContain("container.addEventListener('pointermove'");
    expect(globe).toContain("container.addEventListener('keydown'");
    expect(land).toContain('Natural Earth 1:110m land polygons (public domain)');
    expect(land.length).toBeGreaterThan(50000);
    expect(styles).toContain('#journeyGlobeCanvas');
    expect(styles).toContain('.route-globe.no-canvas .route-globe-fallback');
    expect(styles).toContain('.route-globe.is-dragging');
    expect(styles).toMatch(/\.route\s*\{[\s\S]*?grid-template-columns/);
    expect(script).toContain('We assume ${data.journey.steps_per_mile_assumption} steps per mile and use fixed great-circle distances between the cities.');
    expect(script).not.toContain('This playful estimate uses');
  });

  test('ends with an ornate Pacific-time countdown to the 2026 challenge close', () => {
    for (const id of [
      'challengeCountdown', 'countdownTitle', 'countdownTimer',
      'countdownDays', 'countdownHours', 'countdownMinutes', 'countdownSeconds'
    ]) {
      expect(page).toContain(`id="${id}"`);
    }
    expect(page.indexOf('id="challengeCountdown"')).toBeGreaterThan(page.indexOf('class="next-year"'));
    expect(page).toContain('Until the final footfall is tallied');
    expect(page).toContain('THE GATES CLOSE AT MIDNIGHT PACIFIC');
    expect(script).toContain("byId('countdownTitle').textContent = 'Every step has been counted'");
    expect(script).toContain("Date.parse('2026-09-16T00:00:00-07:00')");
    expect(script).toContain('CHALLENGE_2026_CLOSE - Date.now()');
    expect(script).toContain("window.setInterval(() => {");
    expect(script).toContain("classList.add('is-complete')");
    expect(styles).toContain('.challenge-countdown');
    expect(styles).toContain('@keyframes countdown-orbit');
  });

  test('shows disclosure triangles on team podium capsules and opens first place by default', () => {
    expect(script).toContain("<details class=\"team-podium-card\" ${index === 0 ? 'open' : ''}>");
    expect(styles).toMatch(/\.team-podium-card > summary::before\s*\{[\s\S]*?content: "▶"/);
    expect(styles).toMatch(/\.team-podium-card\[open\] > summary::before\s*\{\s*transform: rotate\(90deg\)/);
    expect(styles).toMatch(/\.team-podium-card\s*\{\s*overflow: hidden/);
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
