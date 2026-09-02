const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const js = fs.readFileSync(path.join(root, 'src/public/step-chat.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/views/dashboard.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/views/chat.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/public/step-chat.css'), 'utf8');

describe('Trotter standalone mobile layout contract', () => {
  test('uses an authenticated standalone page instead of a dashboard overlay', () => {
    expect(dashboard).toContain('id="trotterNav" href="/chat"');
    expect(dashboard).not.toContain('id="stepChatOverlay"');
    expect(dashboard).not.toContain('/step-chat.js');
    expect(page).toContain('id="stepChatOverlay" class="chat-page-shell"');
    expect(page).toContain('id="chatCloseBtn"');
    expect(page).toContain('href="/dashboard"');
  });

  test('does not model keyboard or fixed-overlay geometry in JavaScript', () => {
    expect(js).not.toContain('visualViewport');
    expect(js).not.toContain('captureChatLayoutHeight');
    expect(js).not.toContain('syncVisualViewport');
    expect(js).not.toContain('resetVisualViewport');
    expect(js).not.toContain('document.body.appendChild');
    expect(css).not.toContain('position: fixed');
    expect(css).not.toContain('--chat-keyboard-inset');
    expect(css).not.toContain('--chat-viewport-top');
  });

  test('gives document ownership to the page and vertical scrolling to the transcript', () => {
    expect(css).toMatch(/html,\s*body\s*\{[\s\S]*?overflow: hidden/);
    expect(css).toMatch(/\.chat-transcript\s*\{[\s\S]*?overflow-y: auto/);
    expect(css).toContain('-webkit-overflow-scrolling: touch;');
    expect(css).toContain('touch-action: pan-y;');
    expect(css).toContain('overscroll-behavior: contain;');
  });

  test('dismisses touch keyboards after submit without asynchronous mobile refocus', () => {
    expect(js).toContain('function usesTouchKeyboard()');
    expect(js).toContain('if (usesTouchKeyboard()) input.blur();');
    expect(js).toContain('if (!usesTouchKeyboard()) input.focus();');
    expect(js).not.toContain("sendButton.textContent = 'Send';\n                input.focus();");
  });

  test('uses versioned chat assets and responsive desktop/mobile shells', () => {
    expect(page).toContain('/step-chat.css?v=20260902-standalone');
    expect(page).toContain('/step-chat.js?v=20260902-standalone');
    expect(css).toContain('width: min(920px, 100%);');
    expect(css).toContain('height: min(780px, calc(100dvh - clamp(24px, 6vw, 56px)));');
    expect(css).toMatch(/@media \(max-width: 600px\)[\s\S]*?height: 100dvh/);
    expect(css).toContain('@media (max-height: 520px) and (orientation: landscape)');
  });
});
