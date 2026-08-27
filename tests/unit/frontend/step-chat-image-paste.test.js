const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const html = fs.readFileSync(path.join(root, 'src/views/dashboard.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/public/step-chat.js'), 'utf8');

describe('Trotter image paste contract', () => {
  test('advertises image paste in the composer', () => {
    expect(html).toContain('aria-label="Upload or paste a step screenshot"');
    expect(html).toContain('placeholder="Message Trotter or paste a step screenshot"');
  });

  test('routes pasted image files through the shared image workflow', () => {
    expect(js).toContain("input.addEventListener('paste', event => {");
    expect(js).toContain("item.kind === 'file'");
    expect(js).toContain("startsWith('image/')");
    expect(js).toContain('event.preventDefault();\n            processImageFile(file);');
    expect(js).toContain("imageInput.addEventListener('change', () => {");
    expect(js).toContain('if (file) processImageFile(file);');
  });

  test('does not intercept ordinary text paste and prevents concurrent image processing', () => {
    const noFileGuard = js.indexOf('if (!file) return;', js.indexOf("input.addEventListener('paste'"));
    const preventDefault = js.indexOf('event.preventDefault();', noFileGuard);
    expect(noFileGuard).toBeGreaterThan(-1);
    expect(preventDefault).toBeGreaterThan(noFileGuard);
    expect(js).toContain('if (state.imageBusy) {');
    expect(js).toContain('Trotter is already inspecting an image.');
  });
});
