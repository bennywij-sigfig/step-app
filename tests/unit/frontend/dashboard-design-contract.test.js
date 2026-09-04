const fs = require('fs');
const path = require('path');

const readSource = file => fs.readFileSync(path.join(__dirname, '../../../', file), 'utf8');

describe('dashboard design contract', () => {
  const html = readSource('src/views/dashboard.html');
  const dashboard = readSource('src/public/dashboard.js');
  const icons = readSource('src/public/app-icons.js');
  const theme = readSource('src/public/season-theme.css');
  const chat = readSource('src/public/step-chat.css');

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

  test('keeps long leaderboard names in a two-line truncating identity column', () => {
    const identityRule = html.match(/\.leaderboard-identity\s*\{[\s\S]*?\}/)?.[0] || '';
    const nameRule = html.match(/\.leaderboard-name\s*\{[\s\S]*?\}/)?.[0] || '';

    expect(identityRule).toContain('grid-template-columns: 42px 34px minmax(0, 1fr)');
    expect(nameRule).toContain('text-overflow: ellipsis');
    expect(nameRule).toContain('white-space: nowrap');
    expect(dashboard).toContain('<span class="leaderboard-label">');
    expect(dashboard).toContain('<span class="leaderboard-supporting">');
    expect(html).toMatch(/@media \(max-width: 480px\)[\s\S]*?grid-template-columns: 34px 30px minmax\(0, 1fr\)/);
  });

  test('attaches disclosure handlers only within the freshly rendered leaderboard', () => {
    expect(dashboard).toContain('attachDisclosureListeners(leaderboardDiv)');
    expect(dashboard).toContain('attachDisclosureListeners(teamLeaderboard)');
    expect(dashboard).toContain("container.querySelectorAll('.team-disclosure')");
    expect(dashboard).not.toContain("document.querySelectorAll('.team-disclosure')");
  });

  test('expanded leaderboard panels avoid decorative strokes and flickering height animations', () => {
    const disclosureRule = html.match(/\/\* Individual and team disclosures[\s\S]*?\.member-item\s*\{/)?.[0] || '';
    expect(disclosureRule).not.toContain('border-left');
    expect(disclosureRule).not.toContain('border-bottom: 1px solid');
    expect(dashboard).not.toContain("style.borderLeft");
    expect(dashboard).not.toContain('style.maxHeight');
    expect(dashboard).not.toContain("max-height 0.3s");
  });

  test('chart renders the full challenge calendar with zero and future days plus benchmarks', () => {
    expect(dashboard).toContain('startDate = currentUser.current_challenge.start_date');
    expect(dashboard).toContain('endDate = currentUser.current_challenge.end_date');
    expect(dashboard).toContain('shiftDate(endDate, -29)');
    expect(dashboard).toContain('hasEntry: stepsByDate.has(date)');
    expect(dashboard).toContain("day.isFuture ? ' future' : ''");
    expect(dashboard).toContain("fetch('/api/chart-benchmarks')");
    expect(dashboard).toContain("className: 'user-average'");
    expect(dashboard).toContain("className: 'team-average'");
    expect(dashboard).toContain("label: 'Leading team avg'");
    expect(dashboard).toContain('steps-chart-summary');
    expect(dashboard).not.toContain('loggedSummary');
    expect(dashboard).not.toContain('dateRange');
    expect(html).toMatch(/\.steps-chart-legend\s*\{[\s\S]*?white-space: nowrap/);
    expect(dashboard).toContain("showAxisLabel ? ' axis-label' : ''");
    expect(html).toMatch(/\.chart-benchmark\s*\{[\s\S]*?border-top: 1px dashed/);
    expect(html).toMatch(/\.chart-benchmark\s*\{[\s\S]*?opacity: 0/);
    expect(html).toMatch(/\.chart-benchmark-toggle\s*\{[\s\S]*?font-weight: 400/);
    expect(dashboard).toContain("toggle.addEventListener('pointerenter', showLine)");
    expect(dashboard).toContain("toggle.addEventListener('click'");
    expect(dashboard).not.toContain('<span>${line.label}</span>');
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

  test('keeps each dashboard view directly addressable and follows browser history', () => {
    expect(dashboard).toContain("'/individuals': { viewId: 'leaderboardView'");
    expect(dashboard).toContain("'/teams': { viewId: 'teamLeaderboardView'");
    expect(dashboard).toContain("window.history.pushState({}, '', pathname)");
    expect(dashboard).toContain("window.addEventListener('popstate'");
    expect(dashboard).toContain('showDashboardRoute(window.location.pathname)');
    expect(dashboard).toContain("tab.setAttribute('aria-current', 'page')");
  });

  test('prefetches hidden leaderboards only after visible step content loads', () => {
    expect(dashboard).toContain('await loadSteps()');
    expect(dashboard).toContain('Promise.allSettled([loadIndividualForNavigation(), loadTeamsForNavigation()])');
    expect(dashboard).toContain('window.requestIdleCallback(preloadLeaderboards, { timeout: 1500 })');
    expect(dashboard).toContain('if (existing?.promise) return existing.promise');
    expect(dashboard).toContain('Date.now() - existing.loadedAt < 10000');
    expect(dashboard).toContain('if (succeeded) {');
    expect(dashboard).toContain('navigationLoads.delete(key)');
    expect(dashboard).toContain('return false;');
  });

  test('keeps leaderboard rankings vertical and links to a responsive standalone Trotter page', () => {
    expect(html).not.toMatch(/#leaderboard,\s*#teamLeaderboard\s*\{[\s\S]*?grid-template-columns/);
    expect(html).toContain('id="chatOpenBtn" class="chat-beta-btn" href="/chat"');
    expect(html).not.toContain('id="trotterNav"');
    expect(html).not.toContain('id="stepChatOverlay"');
    expect(chat).toMatch(/\.chat-page-shell\s*\{[\s\S]*?width: min\(920px, 100%\)/);
    expect(chat).toMatch(/@media \(max-width: 600px\)[\s\S]*?\.chat-page-shell\s*\{[\s\S]*?width: 100%/);
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

  test('keeps step and leaderboard metric labels concise', () => {
    expect(dashboard).toContain('<span><strong>${step.count.toLocaleString()}</strong></span>');
    expect(dashboard).toContain('const fullLabel = `${total} steps / ${formatDayCount(days)}`');
    expect(dashboard).toContain('<span class="rate-detail-compact" aria-label="${fullLabel}">${total}/${days}</span>');
    expect(dashboard.match(/formatStepRateDetail\([^)]*\.total_steps[^)]*\.days_logged\)/g)).toHaveLength(4);
    expect(dashboard).toContain('${team.total_steps.toLocaleString()} total');
    expect(dashboard).toContain('members · reporting · steps/day');
    expect(dashboard).not.toContain('${step.count.toLocaleString()} steps</strong>');
    expect(dashboard).not.toContain('</span> steps/day</div>');
    expect(dashboard).not.toContain(' total steps</div>');
    expect(html).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.rate-detail-full\s*\{\s*display: none/);
    expect(html).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.rate-detail-compact\s*\{\s*display: inline/);
  });

  test('formats reported day counts with singular and plural grammar', () => {
    const dayFormatter = dashboard.match(/function formatDayCount[\s\S]*?\n\}/)?.[0] || '';
    expect(dayFormatter).toContain("count === 1 ? '' : 's'");
    expect(dashboard).not.toMatch(/days_logged\} days/);
  });
});
