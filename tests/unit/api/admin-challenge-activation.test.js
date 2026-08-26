const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src/public/admin.js'), 'utf8');

describe('admin challenge activation contract', () => {
  test('inactive challenge checkbox remains interactive before team preparation', () => {
    expect(admin).not.toContain('disabled title="Use Start & Reset Teams to activate this challenge"');
    expect(admin).toContain('data-teams-prepared=');
    expect(admin).toContain('Save to activate with current teams');
  });

  test('activation distinguishes preserving teams from the explicit reset workflow', () => {
    expect(admin).toContain('Activate "${name.trim()}" with the current teams?');
    expect(admin).toContain('This keeps every current team name and player assignment.');
    expect(admin).toContain('Start & Reset Teams instead.');
  });

  test('backend deactivates other challenges successfully before activating the target', () => {
    const deactivateIndex = server.indexOf('UPDATE challenges SET is_active = 0', server.indexOf("app.put('/api/admin/challenges/:challengeId'"));
    const callbackUpdateIndex = server.indexOf('performUpdate();', deactivateIndex);
    expect(deactivateIndex).toBeGreaterThan(-1);
    expect(callbackUpdateIndex).toBeGreaterThan(deactivateIndex);
  });
});
