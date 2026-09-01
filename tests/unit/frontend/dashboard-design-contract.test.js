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

  test('recent chart is bounded to elapsed dates and has concise summary metadata', () => {
    expect(dashboard).toContain('shiftDate(endDate, -13)');
    expect(dashboard).toContain("if (endDate < challenge.start_date)");
    expect(dashboard).toContain('steps-chart-summary');
    expect(dashboard).toContain('logged ·');
  });

  test('leaderboard metadata does not rely on decorative emoji or inline colors', () => {
    const reportingFormatter = icons.match(/function formatReportingRate[\s\S]*?\n\}/)?.[0] || '';
    const memberFormatter = icons.match(/function formatMemberCount[\s\S]*?\n\}/)?.[0] || '';
    expect(reportingFormatter).not.toMatch(/📋|style=/);
    expect(memberFormatter).not.toMatch(/👥|style=/);
  });
});
