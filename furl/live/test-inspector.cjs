const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'furl-inspector-'));
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}, colorScheme: 'dark'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.waitForTimeout(180);
  const details = page.locator('.furl-cursor-details');
  const totals = page.locator('.furl-problem-totals');
  async function focus(editor) { await editor.click(); await settle(); }
  async function paste(editor, source) {
    await focus(editor); await page.keyboard.press('Meta+a'); await settle();
    await page.evaluate(source => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: {readText: () => Promise.resolve(source)}
    }), source);
    await page.keyboard.press('Meta+v'); await settle();
  }
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8766/furl.html');
  await page.waitForTimeout(400);
  assert.match(await details.innerText(), /Select a term/);
  assert.equal(await totals.innerText(), '0 errors');
  await focus(page.locator('.furl-pattern .code-editor').first());
  assert.match(await details.innerText(), /Pat\s*\/\s*Variable binding\s*:\s*Int/);
  await page.keyboard.press('Meta+a'); await page.keyboard.press('ArrowRight'); await settle();
  await page.keyboard.press('ArrowRight'); await settle();
  assert.match(await details.innerText(), /Exp\s*\/\s*Number literal\s*:\s*Int/);
  await paste(page.locator('#active-code-editor'), 'missing');
  assert.match(await details.innerText(), /missing\s+not found/);
  assert.match(await totals.innerText(), /^1 error(?:\n|$)/);
  await page.locator('#active-code-editor').click({position: {x: 25, y: 10}}); await settle();
  for (let i = 0; i < 20; i++) { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(20); }
  await settle();
  assert.match(await details.innerText(), /missing\s+not found/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'active-code-editor');
  await page.screenshot({path: path.join(output, 'error-dark.png'), fullPage: true});
  await page.emulateMedia({colorScheme: 'light'});
  await page.screenshot({path: path.join(output, 'error-light.png'), fullPage: true});
  await page.getByRole('button', {name: 'Undo', exact: true}).click(); await settle();
  assert.equal(await totals.innerText(), '0 errors');
  await page.getByRole('combobox', {name: 'Example'}).selectOption('2'); await settle();
  await paste(page.locator('.furl-branch > [data-row^="branch-"] .furl-expression .code-editor').last(), 'missing');
  assert.match(await totals.innerText(), /^1 error(?:\n|$)/);
  await page.getByRole('button', {name: 'Show one match branch at a time'}).click(); await settle();
  assert.match(await totals.innerText(), /^1 error(?:\n|$)/);
  await page.getByRole('button', {name: 'Toggle whole-program Hazel source'}).click(); await settle();
  assert.match(await totals.innerText(), /^1 error(?:\n|$)/);
  await paste(page.locator('#active-code-editor'), '1');
  await focus(page.locator('#active-code-editor')); await page.keyboard.press('Meta+a');
  await page.keyboard.press('Backspace'); await settle();
  assert.match(await totals.innerText(), /0 errors\s+1 hole/);
  assert.match(await details.innerText(), /hole/i);
  // Evaluation feedback remains available even when the program typechecks.
  await paste(page.locator('#active-code-editor'), 'let loop = fun x -> loop(x) in loop(0)');
  assert.match(await details.innerText(), /Evaluation paused at the step limit/);
  await page.getByRole('combobox', {name: 'Example'}).selectOption('3'); await settle();
  await focus(page.locator('.furl-parameter .code-editor'));
  assert.match(await details.innerText(), /Pat\s*\/\s*Variable binding/);
  assert.ok(await details.locator('.code-box-container').count() > 0);
  await page.locator('.furl-parameter .furl-value-text').click(); await settle();
  assert.match(await details.innerText(), /Recorded value/);
  await page.keyboard.press('Escape'); await settle();
  assert.match(await details.innerText(), /Pat/);
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await totals.evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS inspector: native term/type/error info, caret handoff, shared-match counts, source projection, holes, undo, evaluation feedback, value focus and mobile.');
  console.log('Screenshots:', output);
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
