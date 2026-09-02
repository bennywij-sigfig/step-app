const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const js = fs.readFileSync(path.join(root, 'src/public/step-chat.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/views/dashboard.html'), 'utf8');

describe('Trotter mobile visual viewport contract', () => {
  test('keeps the fixed hit-test shell stable and adjusts only internal padding', () => {
    expect(js).toContain('function isChatEditorFocused(overlay)');
    expect(js).toContain('if (!overlay || !viewport || !isChatEditorFocused(overlay)) return;');
    expect(js).toContain("overlay.style.removeProperty('--chat-viewport-top')");
    expect(js).toContain("overlay.style.removeProperty('--chat-keyboard-inset')");
    expect(js).toContain("overlay.style.setProperty('--chat-viewport-top'");
    expect(js).toContain("overlay.style.setProperty('--chat-keyboard-inset'");
    expect(html).toContain('position: fixed;\n            inset: 0;');
    expect(html).toContain('max(16px, env(safe-area-inset-top), var(--chat-viewport-top, 0px))');
    expect(html).toContain('max(16px, env(safe-area-inset-bottom), var(--chat-keyboard-inset, 0px))');
    expect(html).toContain('padding: var(--chat-viewport-top, 0px) 0 var(--chat-keyboard-inset, 0px);');
    expect(html).not.toContain('top: var(--chat-visual-top');
    expect(html).not.toContain('height: var(--chat-visual-height');
  });

  test('uses a minimal event-driven viewport lifecycle without delayed global focus writes', () => {
    expect(js).toContain("window.visualViewport?.addEventListener('resize', syncVisualViewport)");
    expect(js).toContain("window.visualViewport?.addEventListener('scroll', syncVisualViewport)");
    expect(js).toContain("window.addEventListener('orientationchange', () => {");
    expect(js).toContain('window.requestAnimationFrame(captureChatLayoutHeight)');
    expect(js).not.toContain('scheduleVisualViewportSync');
    expect(js).not.toContain("document.addEventListener('focusin'");
    expect(js).not.toContain("document.addEventListener('focusout'");
    expect(js).not.toContain('[80, 250, 500]');
    expect(js).not.toContain("input.addEventListener('blur', resetVisualViewport)");
    expect(js).toContain("} else if (!isChatEditorFocused(overlay)) {");
    expect(js).toContain("input.addEventListener('pointerdown', () => {");
    expect(js).toContain('if (document.activeElement !== input) captureChatLayoutHeight();');
  });

  test('dismisses touch keyboards in portrait and landscape and never asynchronously refocuses them', () => {
    expect(js).toContain('function usesTouchKeyboard()');
    expect(js).toContain('navigator.maxTouchPoints > 0');
    expect(js).toContain('if (usesTouchKeyboard()) {\n                input.blur();\n                resetVisualViewport();');
    expect(js).toContain('if (!usesTouchKeyboard()) input.focus();');
    expect(js).not.toContain("sendButton.textContent = 'Send';\n                input.focus();");
  });

  test('avoids extra mobile compositor masks and matches Safari chrome to the chat', () => {
    expect(html).not.toContain('body.dashboard-page.trotter-open::after');
    expect(html).not.toContain('body.dashboard-page.trotter-open > :not(.chat-overlay)');
    expect(html).toContain('background: var(--surface, #fff);\n                backdrop-filter: none;');
    expect(js).toContain("themeColor.content = '#ffffff'");
    expect(js).toContain('open && state.themeColorBeforeChat === null');
    expect(js).toContain('setChatBrowserColor(false)');
    expect(js).not.toContain("classList.add('trotter-open')");
  });
});
