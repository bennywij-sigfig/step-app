const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const database = fs.readFileSync(path.join(root, 'src/database.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src/public/admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/views/admin.html'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

describe('manual champions publication contract', () => {
  test('offers a production-safe localhost clock override for previewing the ended state', () => {
    expect(packageJson).toContain('"preview:champions"');
    expect(packageJson).toContain('CHAMPIONS_PREVIEW_NOW=2026-09-17T12:00:00Z');
    expect(server).toContain("process.env.NODE_ENV !== 'production'");
    expect(server).toContain('getChampionsWorkflowNow()');
    expect(server).toContain('champions_preview_now:');
  });

  test('stores a season publication as a pointer to an immutable challenge archive', () => {
    expect(database).toContain('CREATE TABLE IF NOT EXISTS champions_publications');
    expect(database).toContain('season INTEGER PRIMARY KEY');
    expect(database).toContain('archive_id INTEGER NOT NULL UNIQUE');
    expect(database).toContain('published_by_user_id INTEGER NOT NULL');
  });

  test('publishes only through an authenticated, CSRF-protected admin action', () => {
    expect(server).toContain("app.post('/api/admin/challenges/:challengeId/publish-champions'");
    expect(server).toContain('requireApiAdmin, validateCSRFToken');
    expect(server).toContain("getChallengeStatus(challenge, getChampionsWorkflowNow()) !== 'ended'");
    expect(server).toContain('INSERT INTO champions_publications');
    expect(server).toContain('ON CONFLICT(season) DO UPDATE SET');
    expect(server).toContain('championsCache.set(season, champions)');
  });

  test('makes the seasonless Pantheon URL follow the latest publication while keeping explicit years stable', () => {
    expect(server).toContain("SELECT season FROM champions_publications ORDER BY season DESC LIMIT 1");
    expect(server).toContain('return res.redirect(`/champions?season=${publication.season}`)');
    expect(server).toContain('if (req.query.season !== undefined)');
    expect(server).toContain('latest_champions: publication || null');
  });

  test('explains the retroactive deadline and offers publish or refresh after challenge end', () => {
    expect(html).toContain('Publishing champions is always manual.');
    expect(html).toContain('retroactive step-entry deadline');
    expect(admin).toContain("challenge.status === 'ended'");
    expect(admin).toContain('publish-champions-btn');
    expect(admin).toContain('Later corrections will not appear unless an administrator refreshes');
    expect(admin).toContain('Open the ${data.season} page');
  });
});
