const { test, expect } = require('@playwright/test');

const baseUrl = process.env.TROTTER_VIEWPORT_URL || 'http://localhost:3100';

async function authenticate(page) {
  const email = `trotter-page-${Date.now()}@example.com`;
  const response = await fetch(`${baseUrl}/dev/get-magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  expect(response.ok).toBeTruthy();
  const { magicLink } = await response.json();
  const loginUrl = new URL(magicLink);
  const target = new URL(baseUrl);
  loginUrl.protocol = target.protocol;
  loginUrl.host = target.host;
  await page.goto(loginUrl.toString());
  await expect(page.locator('#chatOpenBtn')).toBeVisible();
}

async function installVisualViewportMock(page) {
  await page.evaluate(() => {
    const viewport = window.visualViewport;
    const state = { height: viewport.height };
    Object.defineProperty(viewport, 'height', { configurable: true, get: () => state.height });
    window.__setChatViewportHeight = height => {
      state.height = height;
      viewport.dispatchEvent(new Event('resize'));
    };
  });
}

async function setViewportHeight(page, height) {
  await page.evaluate(value => window.__setChatViewportHeight(value), height);
}

async function assertComposerInsideShell(page, visibleHeight = null) {
  const [shell, composer] = await Promise.all([
    page.locator('.chat-page-shell').boundingBox(),
    page.locator('.chat-composer').boundingBox()
  ]);
  expect(composer.y + composer.height).toBeLessThanOrEqual(shell.y + shell.height + 1);
  if (visibleHeight !== null) expect(shell.y + shell.height).toBeLessThanOrEqual(visibleHeight + 1);
}

async function assertControlHitTargets(page) {
  for (const selector of ['#chatClearBtn', '#chatCloseBtn', '#chatInput', '#chatSendBtn']) {
    const target = page.locator(selector);
    const box = await target.boundingBox();
    expect(box, `${selector} should have a box`).not.toBeNull();
    const hit = await page.evaluate(({ selector, x, y }) => {
      return Boolean(document.elementFromPoint(x, y)?.closest(selector));
    }, { selector, x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit, `${selector} should own its painted hit target`).toBeTruthy();
  }
}

async function assertSingleDocumentScroller(page) {
  const layout = await page.evaluate(() => ({
    bodyOverflow: getComputedStyle(document.body).overflow,
    transcriptOverflow: getComputedStyle(document.getElementById('chatTranscript')).overflowY,
    shellPosition: getComputedStyle(document.getElementById('stepChatOverlay')).position,
    visualViewportListenersAbsent: !document.documentElement.innerHTML.includes('--chat-keyboard-inset')
  }));
  expect(layout.bodyOverflow).toBe('hidden');
  expect(layout.transcriptOverflow).toBe('auto');
  expect(layout.shellPosition).not.toBe('fixed');
  expect(layout.visualViewportListenersAbsent).toBeTruthy();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
}

test.describe('Trotter standalone responsive page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    });
    await page.route('**/api/chat/config', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: true, image_upload: false, transcript_scope: 'viewport-e2e' })
    }));
    await page.route('**/api/chat', async route => {
      if (new URL(route.request().url()).pathname !== '/api/chat') return route.continue();
      await new Promise(resolve => setTimeout(resolve, 40));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tone: 'neutral', result: { kind: 'chitchat' } })
      });
    });
    await authenticate(page);
  });

  test('keeps chat controls and scrolling usable across responsive touch layouts', async ({ page }) => {
    const scenarios = [
      { name: 'small phone', width: 360, height: 640 },
      { name: 'portrait phone', width: 390, height: 844 },
      { name: 'landscape phone', width: 844, height: 390 },
      { name: 'tablet', width: 820, height: 1180 }
    ];

    for (const scenario of scenarios) {
      await test.step(scenario.name, async () => {
        await page.setViewportSize({ width: scenario.width, height: scenario.height });
        await expect(page.locator('#chatOpenBtn')).toBeVisible();
        await page.click('#chatOpenBtn');
        await expect(page.locator('#chatSendBtn')).toBeEnabled();
        await installVisualViewportMock(page);
        const closedShellHeight = (await page.locator('.chat-page-shell').boundingBox()).height;
        const keyboardHeight = Math.max(220, Math.floor(scenario.height * 0.55));
        await setViewportHeight(page, keyboardHeight);
        await expect.poll(async () => (await page.locator('.chat-page-shell').boundingBox()).height).toBeLessThan(closedShellHeight);
        await assertComposerInsideShell(page, keyboardHeight);
        await assertSingleDocumentScroller(page);
        await assertControlHitTargets(page);

        await page.fill('#chatInput', 'standalone page regression test');
        await page.click('#chatSendBtn');
        await setViewportHeight(page, scenario.height);
        await expect(page.locator('#chatSendBtn')).toHaveText('Send');
        await expect(page.locator('#chatTranscript')).toContainText('I’m Trotter');
        await assertComposerInsideShell(page);

        await page.click('#chatInput');
        await setViewportHeight(page, keyboardHeight);
        await page.click('#chatClearBtn');
        await setViewportHeight(page, scenario.height);
        await expect(page.locator('#chatTranscript')).toContainText('Transcript cleared');
        await page.click('#chatInput');
        await expect(page.locator('#chatInput')).toBeFocused();

        await page.evaluate(() => {
          const transcript = document.getElementById('chatTranscript');
          for (let index = 0; index < 40; index += 1) {
            const message = document.createElement('div');
            message.className = 'chat-message assistant';
            message.textContent = `Scroll regression message ${index + 1}`;
            transcript.appendChild(message);
          }
          transcript.scrollTop = 0;
        });
        const transcript = page.locator('#chatTranscript');
        await expect.poll(() => transcript.evaluate(element => element.scrollHeight > element.clientHeight)).toBeTruthy();
        await transcript.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect.poll(() => transcript.evaluate(element => element.scrollTop > 0)).toBeTruthy();
        await assertControlHitTargets(page);

        await page.click('#chatCloseBtn');
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.locator('#chatOpenBtn')).toBeVisible();
      });
    }
  });

  test('uses a centered, bounded chat workspace on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/chat`);
    await expect(page.locator('#chatSendBtn')).toBeEnabled();
    await installVisualViewportMock(page);
    const shell = await page.locator('.chat-page-shell').boundingBox();
    expect(shell.width).toBeLessThanOrEqual(920);
    expect(shell.height).toBeLessThanOrEqual(780);
    expect(shell.x).toBeGreaterThan(0);
    await assertSingleDocumentScroller(page);
    await assertControlHitTargets(page);
  });
});
