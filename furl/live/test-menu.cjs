const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'furl-menu-'));
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}, colorScheme: 'dark'});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForTimeout(200);
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8766/furl.html');
  await page.waitForTimeout(500);
  const menu = page.locator('.context-menu');
  async function open(editor) {await editor.click({button: 'right'}); await settle(); await menu.waitFor({state: 'visible'});}
  async function bounds() {
    const state = await menu.evaluate(e => {
      const r = e.getBoundingClientRect(), p = e.closest('.furl-program').getBoundingClientRect();
      return {r: r.toJSON(), panel: p.toJSON(), vw: innerWidth, vh: innerHeight,
        popover: e.matches(':popover-open'), position: getComputedStyle(e).position,
        hit: e.contains(document.elementFromPoint(r.left + 12, r.bottom - 12))};
    });
    assert.equal(state.popover, true); assert.equal(state.position, 'fixed'); assert.equal(state.hit, true);
    assert.ok(state.r.left >= 7 && state.r.top >= 7);
    assert.ok(state.r.right <= state.vw - 7 && state.r.bottom <= state.vh - 7, JSON.stringify(state));
    return state;
  }
  await open(page.locator('.furl-expression .code-editor').first());
  const initial = await bounds(); assert.ok(initial.r.bottom > initial.panel.bottom);
  const first = await menu.locator('.selected').innerText();
  await page.keyboard.press('ArrowDown'); await settle();
  assert.notEqual(await menu.locator('.selected').innerText(), first);
  assert.match(await menu.locator('.selected').innerText(), /^Paste/);
  await page.screenshot({path: path.join(output, 'menu-dark.png'), fullPage: true});
  await page.keyboard.press('Escape'); await settle(); assert.equal(await menu.count(), 0);
  // Keyboard invocation uses the active editor too.
  await page.keyboard.press('Shift+F10'); await settle(); await bounds();
  await page.mouse.click(20, 20); await settle(); assert.equal(await menu.count(), 0);
  // Preserve a Hazel selection while opening the menu, then execute Copy.
  const editor = page.locator('.furl-expression .code-editor').nth(2);
  await editor.click(); await settle(); await page.keyboard.press('Meta+a'); await settle();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true,
    value: {writeText: text => {window.copied = text; return Promise.resolve();}}}));
  await open(editor); await menu.locator('.named-menu-item').filter({hasText: /^Copy/}).click(); await settle();
  assert.equal(await page.evaluate(() => window.copied), 'width * height');
  assert.equal(await menu.count(), 0);
  // Bottom-row anchoring must use this cell, not the first editor on the page.
  const last = page.locator('.furl-expression .code-editor').last(); await open(last);
  const low = await bounds(); const rect = await last.boundingBox();
  assert.ok(low.r.top > rect.y); assert.ok(low.r.top < rect.y + rect.height + 8);
  await page.emulateMedia({colorScheme: 'light'});
  await page.screenshot({path: path.join(output, 'menu-light.png'), fullPage: true});
  await page.keyboard.press('Escape'); await settle();
  // Short windows flip/clamp the menu and keep long menus scrollable.
  await page.setViewportSize({width: 390, height: 240});
  await open(last); await bounds();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown'); await settle(); await bounds();
  const scroll = await menu.evaluate(e => ({height: e.clientHeight, content: e.scrollHeight}));
  assert.ok(scroll.height <= 224); assert.ok(scroll.content > scroll.height);
  assert.ok(await menu.locator('.selected').evaluate(e => {const row=e.getBoundingClientRect(), box=e.closest('.context-menu').getBoundingClientRect();return row.top >= box.top && row.bottom <= box.bottom;}));
  await page.keyboard.press('Escape'); await settle();
  await page.setViewportSize({width: 1280, height: 900});
  await page.getByRole('combobox', {name: 'Example'}).selectOption('3'); await settle();
  await page.getByRole('button', {name: 'Show one match branch at a time'}).click(); await settle();
  await open(page.locator('.furl-branch .furl-expression .code-editor').first()); await bounds();
  await page.keyboard.press('Escape'); await settle();
  // Captured outer scrolling dismisses the anchored menu, not its own scrolling.
  await open(page.locator('.furl-expression .code-editor').first());
  await page.evaluate(() => document.querySelector('.furl-program').dispatchEvent(new Event('scroll'))); await settle();
  assert.equal(await menu.count(), 0);
  // Unmounting the menu releases its capture listener: ordinary typing works.
  await page.locator('.furl-expression .code-editor').last().click(); await settle();
  await page.keyboard.press('Meta+a'); await page.keyboard.type('9'); await settle();
  assert.equal(await page.locator('.furl-expression .code-editor').last().innerText(), '9');
  assert.deepEqual(errors, []);
  console.log('PASS menus: top-layer hit testing beyond panel, active-cell anchoring, viewport bounds, themes, keyboard/open/close, copy, outer scrolling and listener cleanup.');
  console.log('Screenshots:', output); await browser.close();
})().catch(e => {console.error(e); process.exit(1);});
