const { test, expect } = require('@playwright/test');

const baseUrl = process.env.TROTTER_VIEWPORT_URL || 'http://localhost:3100';

async function authenticate(page) {
  const email = `trotter-viewport-${Date.now()}@example.com`;
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
    const state = { height: viewport.height, offsetTop: viewport.offsetTop };
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => state.height },
      offsetTop: { configurable: true, get: () => state.offsetTop }
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5
    });
    window.__setTrotterVisualViewport = ({ height, offsetTop }) => {
      state.height = height;
      state.offsetTop = offsetTop;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
}

async function assertStableShell(page) {
  const shell = await page.locator('#stepChatOverlay').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      position: getComputedStyle(element).position,
      inlineTop: element.style.top,
      inlineHeight: element.style.height
    };
  });
  expect(shell.top).toBe(0);
  expect(shell.left).toBe(0);
  expect(shell.width).toBeGreaterThan(0);
  expect(shell.height).toBeGreaterThan(0);
  expect(shell.position).toBe('fixed');
  expect(shell.inlineTop).toBe('');
  expect(shell.inlineHeight).toBe('');
}

async function assertControlHitTargets(page, visibleTop, visibleBottom) {
  for (const selector of ['#chatClearBtn', '#chatCloseBtn', '#chatInput', '#chatSendBtn']) {
    const target = page.locator(selector);
    const box = await target.boundingBox();
    expect(box, `${selector} should have a box`).not.toBeNull();
    expect(box.y, `${selector} should be below the visual top`).toBeGreaterThanOrEqual(visibleTop - 1);
    expect(box.y + box.height, `${selector} should be above the keyboard`).toBeLessThanOrEqual(visibleBottom + 1);
    const hit = await page.evaluate(({ selector, x, layoutY, visualY }) => {
      const direct = document.elementFromPoint(x, layoutY);
      const visual = document.elementFromPoint(x, visualY);
      return Boolean(direct?.closest(selector) || visual?.closest(selector));
    }, {
      selector,
      x: box.x + box.width / 2,
      layoutY: box.y + box.height / 2,
      visualY: box.y + box.height / 2 - visibleTop
    });
    expect(hit, `${selector} should own its painted hit target`).toBeTruthy();
  }
}

test.describe('Trotter stable visual viewport shell', () => {
  test.beforeEach(async ({ page }) => {
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
    await installVisualViewportMock(page);
  });

  test('keeps controls hittable through submit and refocus across touch layouts', async ({ page }) => {
    const scenarios = [
      { name: 'portrait phone', width: 390, height: 664, visualTop: 80, visualHeight: 340 },
      { name: 'landscape phone', width: 844, height: 390, visualTop: 20, visualHeight: 250 },
      { name: 'tablet', width: 820, height: 1180, visualTop: 120, visualHeight: 650 }
    ];

    for (const scenario of scenarios) {
      await test.step(scenario.name, async () => {
        await page.setViewportSize({ width: scenario.width, height: scenario.height });
        await page.click('#chatOpenBtn');
        await expect(page.locator('#stepChatOverlay')).toBeVisible();
        await assertStableShell(page);

        await page.evaluate(({ height, offsetTop }) => {
          window.__setTrotterVisualViewport({ height, offsetTop });
        }, { height: scenario.visualHeight, offsetTop: scenario.visualTop });
        await assertStableShell(page);
        await assertControlHitTargets(page, scenario.visualTop, scenario.visualTop + scenario.visualHeight);

        await page.fill('#chatInput', 'viewport regression test');
        await page.click('#chatSendBtn');
        await expect(page.locator('#chatSendBtn')).toHaveText('Send');
        await assertStableShell(page);
        await expect(page.locator('#stepChatOverlay')).not.toHaveAttribute('style', /chat-(viewport-top|keyboard-inset)/);

        await page.click('#chatInput');
        await page.evaluate(({ height, offsetTop }) => {
          window.__setTrotterVisualViewport({ height, offsetTop });
        }, { height: scenario.visualHeight, offsetTop: scenario.visualTop });
        await assertStableShell(page);
        await assertControlHitTargets(page, scenario.visualTop, scenario.visualTop + scenario.visualHeight);

        await page.click('#chatClearBtn');
        await expect(page.locator('#chatTranscript')).toContainText('Transcript cleared');
        await page.click('#chatCloseBtn');
        await expect(page.locator('#stepChatOverlay')).toBeHidden();
      });
    }
  });

  test('preserves normal desktop modal geometry and controls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click('#chatOpenBtn');
    await assertStableShell(page);
    const panel = await page.locator('.chat-panel').boundingBox();
    expect(panel.width).toBeLessThanOrEqual(860);
    expect(panel.height).toBeLessThanOrEqual(740);
    await page.click('#chatClearBtn');
    await page.click('#chatCloseBtn');
    await expect(page.locator('#stepChatOverlay')).toBeHidden();
  });
});
