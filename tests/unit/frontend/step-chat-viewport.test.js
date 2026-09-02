const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const js = fs.readFileSync(path.join(root, 'src/public/step-chat.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/views/dashboard.html'), 'utf8');

describe('Trotter mobile visual viewport contract', () => {
  test('uses VisualViewport dimensions only while a chat editor is focused', () => {
    expect(js).toContain('function isChatEditorFocused(overlay)');
    expect(js).toContain('if (!viewport || !isChatEditorFocused(overlay))');
    expect(js).toContain("overlay.style.removeProperty('--chat-visual-height')");
    expect(js).toContain("overlay.style.removeProperty('--chat-visual-top')");
    expect(js).toContain("overlay.style.setProperty('--chat-visual-height'");
    expect(js).toContain("overlay.style.setProperty('--chat-visual-top'");
    expect(html).toContain('height: var(--chat-visual-height, 100dvh);');
  });

  test('resynchronizes throughout keyboard and orientation animations', () => {
    expect(js).toContain('function scheduleVisualViewportSync()');
    expect(js).toContain('window.cancelAnimationFrame(viewportSyncFrame)');
    expect(js).toContain('viewportSyncTimers.forEach(timer => window.clearTimeout(timer))');
    expect(js).toContain('window.requestAnimationFrame(() => {');
    expect(js).toContain('[80, 250, 500].map');
    expect(js).toContain("window.addEventListener('orientationchange', scheduleVisualViewportSync)");
    expect(js).toContain("document.addEventListener('focusout', scheduleVisualViewportSync)");
  });

  test('dismisses touch keyboards in portrait and landscape and never asynchronously refocuses them', () => {
    expect(js).toContain('function usesTouchKeyboard()');
    expect(js).toContain('navigator.maxTouchPoints > 0');
    expect(js).toContain('if (usesTouchKeyboard()) {\n                input.blur();\n                scheduleVisualViewportSync();');
    expect(js).toContain('if (!usesTouchKeyboard()) input.focus();');
    expect(js).not.toContain("sendButton.textContent = 'Send';\n                input.focus();");
  });
});
