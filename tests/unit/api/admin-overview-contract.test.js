const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src/public/admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/views/admin.html'), 'utf8');

describe('challenge-aware admin overview contract', () => {
  test('backend scopes challenge totals and participants by challenge_id', () => {
    expect(server).toContain("app.get('/api/admin/overview'");
    expect(server).toContain('s.user_id = u.id AND s.challenge_id = ?');
    expect(server).toContain('average_steps_per_participant');
    expect(server).toContain('participation_rate');
    expect(server).toContain('current_day: getCurrentChallengeDay(challenge)');
  });

  test('frontend uses the overview endpoint instead of deriving challenge metrics from all-time users', () => {
    expect(admin).toContain("fetch('/api/admin/overview')");
    expect(admin).toContain("document.getElementById('totalStepsLabel').textContent = 'Challenge Steps'");
    expect(admin).toContain("document.getElementById('activeUsersLabel').textContent = 'Participants'");
    expect(admin).not.toContain('return user.days_logged > 0; // This is a simplification');
  });

  test('overview labels can clearly distinguish active-challenge and system scopes', () => {
    for (const id of ['totalUsersLabel', 'totalStepsLabel', 'avgStepsLabel', 'activeUsersLabel']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(admin).toContain("'All-Time Steps'");
    expect(admin).toContain("'Challenge Steps'");
  });
});
