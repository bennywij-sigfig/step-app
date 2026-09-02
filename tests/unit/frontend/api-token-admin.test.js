const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const html = fs.readFileSync(path.join(root, 'src/views/admin.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/public/admin.js'), 'utf8');

describe('REST API token admin UI', () => {
  test('uses REST API labels and endpoints', () => {
    expect(html).toContain('id="apiTokensBtn">API Tokens');
    expect(html).toContain('REST API Token Management');
    expect(js).toContain("fetch('/api/admin/api-tokens')");
    expect(js).toContain("fetch('/api/admin/api-tokens/audit/recent?limit=50')");
  });

  test('treats raw tokens as create-response-only values', () => {
    expect(js).toContain("data.token?.token || 'Token created but not displayed'");
    expect(js).not.toContain('data-token-value');
    expect(js).not.toContain('api-copy-btn');
    expect(js).not.toContain('token.token}');
  });

  test('contains no active MCP interface references', () => {
    expect(html).not.toMatch(/MCP|mcp/);
    expect(js).not.toMatch(/MCP|mcp/);
  });
});
