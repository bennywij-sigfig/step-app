const fs = require('fs');
const path = require('path');

const readSource = file => fs.readFileSync(path.join(__dirname, '../../../', file), 'utf8');

describe('dashboard design contract', () => {
  const html = readSource('src/views/dashboard.html');
  const dashboard = readSource('src/public/dashboard.js');
  const icons = readSource('src/public/app-icons.js');
  const theme = readSource('src/public/season-theme.css');

  test('uses a neutral system sans stack for the data-dense dashboard', () => {
    const dashboardFontRule = theme.match(/body\.dashboard-page\s*\{[\s\S]*?\}/)?.[0] || '';
    expect(dashboardFontRule).toContain('-apple-system');
    expect(dashboardFontRule).toContain('"Segoe UI"');
    expect(dashboardFontRule).toContain('Helvetica');
    expect(dashboardFontRule).not.toContain('ui-rounded');
  });

  test('individual and team disclosures are accessible buttons with shared styling', () => {
    expect(dashboard).toContain('<button type="button" class="team-disclosure" data-user-id=');
    expect(dashboard).toContain('<button type="button" class="team-disclosure" data-team=');
    expect(dashboard).toContain('aria-expanded="false"');
    expect(dashboard).toContain("setAttribute('aria-expanded', 'true')");
    expect(html).toMatch(/\.user-data-list,\s*\.team-members-list\s*\{/);
  });

  test('expanded leaderboard panels avoid decorative strokes and flickering height animations', () => {
    const disclosureRule = html.match(/\/\* Individual and team disclosures[\s\S]*?\.member-item\s*\{/)?.[0] || '';
    expect(disclosureRule).not.toContain('border-left');
    expect(disclosureRule).not.toContain('border-bottom: 1px solid');
    expect(dashboard).not.toContain("style.borderLeft");
    expect(dashboard).not.toContain('style.maxHeight');
    expect(dashboard).not.toContain("max-height 0.3s");
  });

  test('recent chart shows up to 30 elapsed dates with concise summary metadata', () => {
    expect(dashboard).toContain('shiftDate(endDate, -29)');
    expect(dashboard).toContain("if (endDate < challenge.start_date)");
    expect(dashboard).toContain('steps-chart-summary');
    expect(dashboard).toContain('logged ·');
    expect(dashboard).toContain("showAxisLabel ? ' axis-label' : ''");
  });

  test('uses wider desktop layouts while retaining the compact mobile flow', () => {
    expect(html).toContain('max-width: 1100px');
    expect(html).toContain('class="my-steps-layout"');
    expect(html).toMatch(/\.my-steps-layout\s*\{[\s\S]*?grid-template-columns:/);
    expect(html).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.my-steps-layout\s*\{[\s\S]*?display: block/);
  });

  test('switches views immediately with a short reduced-motion-aware compositor animation', () => {
    expect(dashboard).toContain('function showDashboardView(viewId, tabId, refresh = null)');
    expect(dashboard).toContain("classList.toggle('hidden', id !== viewId)");
    expect(dashboard).toContain("'(prefers-reduced-motion: reduce)'");
    expect(dashboard).toContain("{ opacity: 0.94, transform: 'translateY(4px)' }");
    expect(dashboard).toContain('duration: 140');
    expect(dashboard).not.toContain('setTimeout(() => showDashboardView');
  });

  test('prefetches hidden leaderboards only after visible step content loads', () => {
    expect(dashboard).toContain('await loadSteps()');
    expect(dashboard).toContain('Promise.allSettled([loadIndividualForNavigation(), loadTeamsForNavigation()])');
    expect(dashboard).toContain('window.requestIdleCallback(preloadLeaderboards, { timeout: 1500 })');
    expect(dashboard).toContain('if (existing?.promise) return existing.promise');
    expect(dashboard).toContain('Date.now() - existing.loadedAt < 30000');
  });

  test('keeps leaderboard rankings vertical and lets Trotter expand on desktop', () => {
    expect(html).not.toMatch(/#leaderboard,\s*#teamLeaderboard\s*\{[\s\S]*?grid-template-columns/);
    expect(html).toMatch(/\.chat-panel\s*\{[\s\S]*?width: min\(860px, 78vw\)/);
    expect(html).toMatch(/@media \(max-width: 600px\)[\s\S]*?\.chat-panel\s*\{[\s\S]*?width: 100%/);
  });

  test('aligns view widths and distinguishes individual rows without recoloring teams', () => {
    expect(html).toMatch(/#myStepsView,\s*#leaderboardView,\s*#teamLeaderboardView\s*\{[\s\S]*?width: 100%/);
    expect(html).toMatch(/#leaderboard \.leaderboard-item:nth-of-type\(even\)/);
    expect(html).toMatch(/#leaderboard \.leaderboard-item\.current-user/);
    expect(html).not.toContain('content: "You"');
    expect(html).toMatch(/\.leaderboard-item\.team-identified\.current-team\s*\{[\s\S]*?var\(--team-accent\) 16%/);
    expect(dashboard).toContain('Number(user.id) === Number(currentUser.id)');
  });

  test('prevents iOS landscape text inflation without hiding leaderboard annotations', () => {
    const rootRule = html.match(/html\s*\{[\s\S]*?\}/)?.[0] || '';
    expect(rootRule).toContain('-webkit-text-size-adjust: 100%');
    expect(rootRule).toContain('text-size-adjust: 100%');
    expect(html).toMatch(/\.leaderboard-section-note\s*\{[\s\S]*?font-size: 12px/);
    expect(html).toMatch(/\.leaderboard-footer\s*\{[\s\S]*?font-size: 12px/);
  });

  test('leaderboard metadata does not rely on decorative emoji or inline colors', () => {
    const reportingFormatter = icons.match(/function formatReportingRate[\s\S]*?\n\}/)?.[0] || '';
    const memberFormatter = icons.match(/function formatMemberCount[\s\S]*?\n\}/)?.[0] || '';
    expect(reportingFormatter).not.toMatch(/📋|style=/);
    expect(memberFormatter).not.toMatch(/👥|style=/);
  });
});
