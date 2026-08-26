const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const html = fs.readFileSync(path.join(root, 'src/views/admin.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/public/season-theme.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/public/admin.js'), 'utf8');

describe('admin constrained mobile layout contract', () => {
  test('uses a discoverable grid navigation and full-width mobile forms', () => {
    expect(css).toContain('body.admin-page .nav');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('body.admin-page .token-form-inputs');
    expect(css).toContain('body.admin-page .audit-filters');
    expect(css).toContain('width: 100% !important');
  });

  test('renders high-density admin tables as labeled mobile cards', () => {
    for (const id of [
      '#usersTable', '#manageTeamsTable', '#challengesTable',
      '#archivesTable', '#mcpTokensTable', '#mcpAuditTable'
    ]) {
      expect(css).toContain(`body.admin-page ${id}`);
    }
    expect(css).toContain('content: attr(data-label)');
    expect(js).toContain('function applyMobileTableLabels(container)');
    expect(js).toContain("cell.dataset.label = labels[index] || ''");
  });

  test('provides searchable user management without removing existing data escaping', () => {
    expect(html).toContain('id="userSearch"');
    expect(html).toContain('Search name, email, or team');
    expect(js).toContain("userSearchInput.addEventListener('input'");
    expect(js).toContain('function filterUsers(users)');
    expect(js).toContain('escapeHtml(user.name)');
    expect(js).toContain('escapeHtml(user.email)');
  });
});
