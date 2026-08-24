const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../../../src/public/season-theme.css');
const css = fs.readFileSync(cssPath, 'utf8');
const themeIds = ['default', 'golden-hour', 'evergreen', 'berry-pace', 'tidepool', 'night-run'];

function themeBlock(themeId) {
  const selector = themeId === 'default' ? ':root' : `[data-theme="${themeId}"]`;
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] || '';
}

function variable(block, name) {
  return block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('2026 seasonal themes', () => {
  test.each(themeIds)('%s primary and secondary colors meet WCAG AA on white', themeId => {
    const block = themeBlock(themeId);
    const primary = variable(block, 'primary-color');
    const secondary = variable(block, 'secondary-color');

    expect(primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(primary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(secondary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  test('all primary views load the shared seasonal stylesheet', () => {
    for (const file of ['src/public/index.html', 'src/views/dashboard.html', 'src/views/admin.html', 'src/views/mcp-setup.html']) {
      const html = fs.readFileSync(path.join(__dirname, '../../..', file), 'utf8');
      expect(html).toContain('href="/season-theme.css"');
    }
  });
});
