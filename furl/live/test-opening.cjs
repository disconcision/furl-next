const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-word-opening-"));

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      colorScheme: "dark",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(process.env.TEST_URL || "http://127.0.0.1:8876/live/");
    await page.waitForSelector(".reference-wire", { state: "attached" });
    await page.getByRole("combobox", { name: "Example" }).selectOption("5");
    await page.locator("button[data-tool=connect]").click();
    await page.waitForTimeout(300);
    const binder = (name) =>
      page.locator(`.furl-hit[data-kind=binder][data-name=${name}]`);
    const holes = () => page.locator(".furl-hit[data-kind=hole]");
    const use = (name) =>
      page.locator(`.furl-hit[data-kind=reference][data-name=${name}]`);
    const area = page.locator(".furl-binding").filter({ has: binder("area") });
    const expression = area.locator(".furl-expression");
    const glyph = (name) =>
      expression
        .locator(".code-text .token")
        .filter({ hasText: new RegExp(`^${name}$`) });
    const box = (n) => n.boundingBox();
    const near = (a, b, label) =>
      assert.ok(Math.abs(a - b) < 0.6, `${label}: ${a} vs ${b}`);
    const frames = () =>
      page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    const freeze = async () =>
      page.evaluate(() => {
        const original = Element.prototype.animate;
        window.restoreOpeningAnimate = () => {
          Element.prototype.animate = original;
        };
        Element.prototype.animate = function (...args) {
          const a = original.apply(this, args);
          if (this.closest(".furl-native-cell")) {
            a.pause();
            a.currentTime = 0;
          }
          return a;
        };
      });
    const seek = async (ms) => {
      await expression.evaluate(
        (n, ms) =>
          n.getAnimations({ subtree: true }).forEach((a) => {
            a.currentTime = ms;
          }),
        ms,
      );
      await frames();
    };
    const finish = async () => {
      await page.evaluate(() => window.restoreOpeningAnimate());
      await expression.evaluate((n) =>
        n.getAnimations({ subtree: true }).forEach((a) => a.finish()),
      );
      await page.waitForTimeout(260);
    };
    const screenshot = (name) =>
      page.screenshot({
        path: path.join(output, `${name}.png`),
        clip: { x: 120, y: 270, width: 470, height: 110 },
      });
    const wireEnd = async (name) => {
      const endpoint = await page.locator(".reference-wire").evaluate((n) => {
        const p = n
          .querySelector("path")
          .getAttribute("d")
          .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)
          .map(Number);
        const r = n.getBoundingClientRect();
        return { x: p.at(-2) + r.left, y: p.at(-1) + r.top };
      });
      const r = await box(glyph(name));
      near(endpoint.x, r.x + r.width / 2, "wire follows opening word center x");
      near(
        endpoint.y,
        r.y + r.height / 2,
        "wire follows opening word center y",
      );
    };
    const before = {
      op: await box(glyph("\\*")),
      hole: await box(expression.locator(".empty-hole").last()),
      hit: await box(holes().last()),
    };
    await binder("width").click();
    await freeze();
    await holes().first().click();
    await frames();
    const initial = await box(glyph("width"));
    near(
      initial.width,
      before.hit.width,
      "word starts at the hole's painted width",
    );
    near(
      (await box(glyph("\\*"))).x,
      before.op.x,
      "operator starts at its old painted position",
    );
    near(
      (await box(expression.locator(".empty-hole"))).x,
      before.hole.x,
      "SVG hole starts at its old painted position",
    );
    near(
      (await box(holes().first())).x,
      before.hit.x,
      "hit region follows the SVG hole",
    );
    await wireEnd("width");
    await screenshot("opening-0ms");
    await seek(45);
    const middle = {
      word: await box(glyph("width")),
      op: await box(glyph("\\*")),
      hole: await box(expression.locator(".empty-hole")),
    };
    assert.ok(middle.word.width > initial.width + 1, "the real glyph expands");
    assert.ok(
      middle.op.x > before.op.x + 1,
      "neighboring syntax moves during the animation",
    );
    near(
      middle.op.x - before.op.x,
      middle.hole.x - before.hole.x,
      "operator and SVG travel together",
    );
    near(
      (await box(holes().first())).x,
      middle.hole.x,
      "click target stays on the painted hole",
    );
    await wireEnd("width");
    await screenshot("opening-45ms");
    await seek(110);
    await screenshot("opening-110ms");
    await finish();
    const full = await box(glyph("width"));
    assert.ok(full.width > middle.word.width);
    near(full.x, initial.x, "word's left edge stays anchored");
    near(
      (await box(glyph("\\*"))).x - before.op.x,
      full.width - initial.width,
      "word expansion supplies exactly the new spacing",
    );
    await screenshot("opening-settled");
    // A second insertion still opens while the first word and operator stay put.
    const op = await box(glyph("\\*"));
    await binder("height").click();
    await freeze();
    await holes().first().click();
    await frames();
    assert.ok((await box(glyph("height"))).width < full.width);
    near((await box(glyph("\\*"))).x, op.x, "earlier syntax stays fixed");
    await finish();
    assert.equal(
      await page.locator(".furl-row").last().locator(".furl-value").innerText(),
      "24",
    );

    // Replacing a longer reference uses its previous width, rather than assuming a one-cell hole.
    await page.locator("button[data-policy=free]").click();
    const old = await box(glyph("height"));
    await binder("width").click();
    await freeze();
    await use("height").click();
    await frames();
    near(
      (await box(glyph("width").last())).width,
      old.width,
      "replacement starts at the old reference width",
    );
    await finish();
    assert.equal(
      await page.locator(".furl-row").last().locator(".furl-value").innerText(),
      "36",
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForTimeout(260);
    assert.equal(
      await page.locator(".furl-row").last().locator(".furl-value").innerText(),
      "24",
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForTimeout(260);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await binder("height").click();
    await holes().first().click();
    await frames();
    assert.equal(
      await expression.evaluate(
        (n) => n.getAnimations({ subtree: true }).length,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS native word opening: painted glyph growth, operator/SVG/hit movement, wire attachment, later insertion, replacement width, Undo and reduced motion.",
    );
    console.log("Screenshots:", output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
