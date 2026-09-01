const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const chat = fs.readFileSync(path.join(root, 'src/public/step-chat.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/public/dashboard.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/views/dashboard.html'), 'utf8');

describe('team rename and identity UI contract', () => {
  test('renders a review with explicit confirm and cancel actions', () => {
    expect(chat).toContain("result.kind === 'team_rename_preview'");
    expect(chat).toContain("actionButton('Rename team'");
    expect(chat).toContain("actionButton('Cancel'");
    expect(chat).toContain("postJson('/api/chat/team-rename/confirm'");
    expect(chat).toContain("new CustomEvent('team-renamed')");
  });

  test('refreshes live dashboard identity after a confirmed rename', () => {
    expect(dashboard).toContain("window.addEventListener('team-renamed'");
    expect(dashboard).toContain('loadCurrentUser()');
    expect(dashboard).toContain('loadTeamLeaderboard()');
  });

  test('derives subtle team color from immutable team ID rather than name', () => {
    expect(dashboard).toContain('function teamAccentStyle(teamId)');
    expect(dashboard).toContain('team.team_id');
    expect(html).toContain('var(--team-accent) 5%');
    expect(html).not.toContain('.team-identified .leaderboard-name::before');
    expect(dashboard).toContain('members · reporting');
  });

  test('always renders verified outlook facts without reparsing the user’s wording', () => {
    expect(chat).not.toContain('asksForNumbers');
    expect(chat).toContain('`Current average: ${formatNumber(Math.round(result.average || 0))} steps/day`');
  });

  test('keeps the emoji app icon paint independent from transparent heading text', () => {
    const iconRule = html.match(/\.app-icon\s*\{[\s\S]*?\}/)?.[0] || '';
    expect(iconRule).toContain('-webkit-text-fill-color: initial');
    expect(iconRule).toContain('color: initial');
  });
});
