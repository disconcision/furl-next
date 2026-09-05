const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'furl-values-'));
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}, colorScheme: 'dark'});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForTimeout(200);
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8766/furl.html');
  await page.waitForTimeout(500);
  async function paste(editor, text) {
    await editor.click(); await settle(); await page.keyboard.press('Meta+a'); await settle();
    await page.evaluate(text => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: {readText: () => Promise.resolve(text)}
    }), text);
    await page.keyboard.press('Meta+v'); await settle();
  }
  async function program(text) {
    await page.getByRole('button', {name: 'Toggle whole-program Hazel source'}).click(); await settle();
    await paste(page.locator('#active-code-editor'), text);
    await page.getByRole('button', {name: 'Furl all lets, functions, and matches'}).click(); await settle();
  }
  const row = name => page.locator('.furl-row').filter({has: page.locator('.furl-pattern', {hasText: new RegExp('^' + name + '$')})});
  async function checkBounds() {
    const values = await page.locator('.furl-value').evaluateAll(es => es.map(e => {
      const ink = e.querySelector('.furl-value-text') || e;
      const range = document.createRange(); range.selectNodeContents(ink);
      const r = range.getBoundingClientRect(), cell = e.getBoundingClientRect();
      return {text: ink.textContent, height: r.height, right: r.right, edge: cell.right,
        scrollWidth: e.scrollWidth, width: e.clientWidth, cellHeight: cell.height};
    }));
    for (const value of values.filter(v => v.text)) {
      assert.ok(value.cellHeight <= 22, JSON.stringify(value));
      assert.ok(value.right <= value.edge + 1, JSON.stringify(value));
      assert.ok(value.scrollWidth <= value.width + 1, JSON.stringify(value));
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await program('let xs = [1, 2, 3, 4] in let ys = (xs, xs, xs) in let huge = (ys, ys, ys) in huge');
  assert.match(await page.locator('.furl-problem-totals').innerText(), /^0 errors/);
  const ys = row('ys').locator('.furl-value'), huge = row('huge').locator('.furl-value');
  assert.equal(await ys.innerText(), '([1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4])');
  const fullWidth = await huge.innerText();
  assert.ok(fullWidth.includes('…')); assert.ok(fullWidth.startsWith('((')); assert.ok(fullWidth.endsWith(')')); 
  await checkBounds();
  assert.ok(await page.locator('.furl-program').evaluate(e => e.scrollWidth <= e.clientWidth + 1));
  const saved = await page.evaluate(() => localStorage.getItem('furl.live.v1.0'));
  await page.setViewportSize({width: 760, height: 900}); await settle();
  const narrow = await huge.innerText(); assert.notEqual(narrow, fullWidth); assert.ok(narrow.length < fullWidth.length);
  await checkBounds();
  assert.equal(await page.evaluate(() => localStorage.getItem('furl.live.v1.0')), saved);
  await page.setViewportSize({width: 1280, height: 900}); await settle();
  assert.equal(await huge.innerText(), fullWidth);
  await page.screenshot({path: path.join(output, 'nested-dark.png'), fullPage: true});
  await page.emulateMedia({colorScheme: 'light'});
  await page.screenshot({path: path.join(output, 'nested-light.png'), fullPage: true});
  // Hiding source attributes gives values that newly available space.
  await page.getByRole('button', {name: 'Expressions', exact: true}).click(); await settle();
  assert.ok((await huge.innerText()).length > fullWidth.length); await checkBounds();
  await page.getByRole('button', {name: 'Expressions', exact: true}).click(); await settle();
  // Code may scroll on a small screen, but values remain bounded in its grid.
  await page.setViewportSize({width: 390, height: 844}); await settle(); await checkBounds();
  await page.setViewportSize({width: 1280, height: 900}); await settle();
  await page.getByRole('combobox', {name: 'Example'}).selectOption('3'); await settle();
  const param = page.locator('.furl-parameter .furl-value-text');
  const columnStarts = () => page.locator('.furl-row').evaluateAll(es => es.map(e => [...e.children].filter(c => /^(furl-pattern|furl-expression|furl-value)$/.test(c.className)).map(c => c.getBoundingClientRect().left)));
  const before = await columnStarts();
  await param.click(); await settle(); await page.keyboard.press('ArrowRight'); await settle();
  assert.deepEqual(await columnStarts(), before); await checkBounds();
  await page.getByRole('button', {name: 'Show one match branch at a time'}).click(); await settle();
  const singleWidth = await param.evaluate(e => e.closest('.furl-value').clientWidth);
  await page.getByRole('button', {name: 'Show all match branches as columns'}).click(); await settle();
  assert.ok(singleWidth > await param.evaluate(e => e.closest('.furl-value').clientWidth));
  await checkBounds();
  // Named function placeholders obey the same tiny budget as lists/tuples.
  await program('let f = fun x -> x in let fs = [f, f, f] in fs');
  await page.setViewportSize({width: 390, height: 844}); await settle(); await checkBounds();
  assert.deepEqual(errors, []);
  console.log('PASS values: available width, structural nested abbreviation, responsive restoration, no value wrapping/overflow, attribute toggles, branch lanes, call stability, function placeholders.');
  console.log('Screenshots:', output);
  await browser.close();
})().catch(e => {console.error(e); process.exit(1);});
