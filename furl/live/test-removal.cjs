const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const output = fs.mkdtempSync(
  path.join(os.tmpdir(), "furl-reference-removal-"),
);
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
    await page.waitForSelector(".reference-wire");
    await page.getByRole("combobox", { name: "Example" }).selectOption("5");
    await page.locator("button[data-tool=connect]").click();
    const binder = (name) =>
      page.locator(`.furl-hit[data-kind=binder][data-name=${name}]`);
    const use = (name) =>
      page.locator(`.furl-hit[data-kind=reference][data-name=${name}]`);
    const holes = () => page.locator(".furl-hit[data-kind=hole]");
    const expression = page
      .locator(".furl-binding")
      .filter({ has: binder("area") })
      .locator(".furl-expression");
    const token = (text) =>
      expression
        .locator(".code-text .token")
        .filter({ hasText: new RegExp(`^${text}$`) });
    const ghosts = () => page.locator(".furl-exiting-reference");
    const box = (n) => n.boundingBox();
    const near = (a, b, label) =>
      assert.ok(Math.abs(a - b) < 0.6, `${label}: ${a} vs ${b}`);
    const frames = () =>
      page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
    const pause = () =>
      page.evaluate(() => {
        const original = Element.prototype.animate;
        window.restoreRemovalAnimate = () => {
          Element.prototype.animate = original;
        };
        Element.prototype.animate = function (...args) {
          const a = original.apply(this, args);
          if (
            this.closest(".furl-native-cell") ||
            this.matches(".furl-floating-reference")
          ) {
            a.pause();
            a.currentTime = 0;
          }
          return a;
        };
      });
    const seek = async (t) => {
      await page.evaluate(
        (t) =>
          document.getAnimations().forEach((a) => {
            if (a.playState === "paused") a.currentTime = t;
          }),
        t,
      );
      await frames();
    };
    const finish = async () => {
      await page.evaluate(() => {
        window.restoreRemovalAnimate();
        document.getAnimations().forEach((a) => {
          if (a.playState === "paused") a.finish();
        });
      });
      await page.waitForTimeout(240);
    };
    const undo = async () => {
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page.waitForTimeout(240);
    };
    const value = () =>
      page.locator(".furl-row").last().locator(".furl-value").innerText();
    const shot = (name) =>
      page.screenshot({
        path: path.join(output, name + ".png"),
        clip: { x: 120, y: 270, width: 470, height: 110 },
      });
    for (const name of ["width", "height"]) {
      await binder(name).click();
      await holes().first().click();
      await page.waitForTimeout(240);
    }
    assert.equal(await value(), "24");
    await page.locator("button[data-policy=free]").click();
    const before = {
      word: await box(token("width")),
      op: await box(token("\\*")),
      height: await box(token("height")),
    };
    await use("width").focus();
    await pause();
    await page.keyboard.press("Delete");
    await frames();
    assert.equal(await use("width").count(), 0, "source commits immediately");
    assert.equal(await holes().count(), 1);
    assert.equal(
      await ghosts().count(),
      1,
      "retired word stays briefly as a visual only",
    );
    near(
      (await box(ghosts())).width,
      before.word.width,
      "exit starts at the original word width",
    );
    near(
      (await box(ghosts())).x,
      before.word.x,
      "exit starts in its original position",
    );
    near(
      (await box(token("\\*"))).x,
      before.op.x,
      "operator starts at its old position",
    );
    near(
      (await box(token("height"))).x,
      before.height.x,
      "following use starts at its old position",
    );
    assert.equal(await ghosts().getAttribute("aria-hidden"), "true");
    assert.equal(
      await ghosts().evaluate((n) => getComputedStyle(n).pointerEvents),
      "none",
    );
    await shot("removal-0ms");
    await seek(45);
    const middle = { word: await box(ghosts()), op: await box(token("\\*")) };
    assert.ok(
      middle.word.width < before.word.width - 1 && middle.word.width > 9,
    );
    assert.ok(middle.op.x < before.op.x - 1);
    near(
      (await box(use("height"))).x,
      (await box(token("height"))).x,
      "moving use remains clickable at its painted location",
    );
    await shot("removal-45ms");
    await seek(110);
    await shot("removal-110ms");
    await finish();
    assert.equal(await ghosts().count(), 0);
    near(
      before.op.x - (await box(token("\\*"))).x,
      before.word.width - (await box(holes().first())).width,
      "space closes by exactly the removed width",
    );
    await shot("removal-settled");
    await undo();
    assert.equal(await value(), "24");

    // A move closes its source and expands/replaces its destination, including
    // when both are in one cell and therefore shift each other's coordinates.
    await use("width").focus();
    await page.keyboard.press("Space");
    await use("height").focus();
    await pause();
    await page.keyboard.press("Enter");
    await frames();
    assert.equal(await ghosts().count(), 2);
    near(
      (await box(token("\\*"))).x,
      before.op.x,
      "move's source reflow begins in place",
    );
    near(
      (await box(token("width"))).x,
      before.height.x,
      "destination begins where its prior word was",
    );
    near(
      (await box(token("width"))).width,
      before.height.width,
      "replacement begins at the old destination width",
    );
    await seek(45);
    await shot("move-both-ends-45ms");
    await finish();
    assert.equal(await use("width").count(), 1);
    assert.equal(await holes().count(), 1);
    await undo();
    assert.equal(await value(), "24");

    // Reverse direction: growth before the source moves the new source hole.
    await use("height").focus();
    await page.keyboard.press("Space");
    await use("width").focus();
    await pause();
    await page.keyboard.press("Enter");
    await frames();
    near(
      (await box(token("\\*"))).x,
      before.op.x,
      "reverse move's operator starts in place",
    );
    near(
      (await box(holes().first())).x,
      before.height.x,
      "source hole starts at the source's old position",
    );
    await finish();
    await undo();
    assert.equal(await value(), "24");

    // Undo during the exit must remove the visual immediately, never restore it later.
    await use("width").focus();
    await pause();
    await page.keyboard.press("Backspace");
    await frames();
    await seek(45);
    await undo();
    assert.equal(await ghosts().count(), 0);
    assert.equal(await value(), "24");
    await finish();
    assert.equal(await ghosts().count(), 0);

    // Drag-away has both a shrinking source and a departing pointer word.
    const a = await box(use("width")),
      panel = await box(page.locator(".furl-program"));
    await page.mouse.move(a.x + a.width / 2, a.y + 11);
    await page.mouse.down();
    await page.mouse.move(panel.x + panel.width - 40, a.y + 40, { steps: 5 });
    await pause();
    await page.mouse.up();
    await frames();
    assert.equal(await ghosts().count(), 1);
    assert.equal(await page.locator(".furl-floating-reference").count(), 1);
    assert.equal(
      await page.locator(".reference-wire").getAttribute("data-kind"),
      "retract",
    );
    await finish();
    assert.equal(await page.locator(".furl-floating-reference").count(), 0);
    await undo();
    assert.equal(await value(), "24");
    // Refusal changes neither source nor its visual; reduced motion commits without ghosts.
    await page.locator("button[data-policy=refine]").click();
    await use("width").focus();
    await page.keyboard.press("Delete");
    await frames();
    assert.equal(await value(), "24");
    assert.equal(await ghosts().count(), 0);
    await page.locator("button[data-policy=free]").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await use("width").focus();
    await page.keyboard.press("Delete");
    await frames();
    assert.equal(await ghosts().count(), 0);
    assert.equal(
      await expression.evaluate(
        (n) => n.getAnimations({ subtree: true }).length,
      ),
      0,
    );
    // Independent native cells also participate in the same transaction.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("combobox", { name: "Example" }).selectOption("4");
    await page.waitForTimeout(260);
    const sourceId = await use("n").getAttribute("data-id");
    const sourceCell = await use("n").evaluate(
      (n) => n.closest("[data-cell]").dataset.cell,
    );
    const targetCell = await use("bonus").evaluate(
      (n) => n.closest("[data-cell]").dataset.cell,
    );
    await use("n").focus();
    await page.keyboard.press("Space");
    await use("bonus").focus();
    await pause();
    await page.keyboard.press("Enter");
    await frames();
    assert.equal(await ghosts().count(), 2);
    assert.equal(await use("n").getAttribute("data-id"), sourceId);
    assert.equal(
      await use("n").evaluate((n) => n.closest("[data-cell]").dataset.cell),
      targetCell,
    );
    assert.equal(
      await page
        .locator(
          `.furl-native-cell[data-cell="${sourceCell}"] .furl-hit[data-kind=hole]`,
        )
        .count(),
      1,
    );
    await seek(45);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await frames();
    assert.equal(
      await ghosts().count(),
      0,
      "enabling reduced motion clears an active exit",
    );
    await finish();
    assert.deepEqual(errors, []);
    console.log(
      "PASS reference exits: painted shrinking/closure, move in both directions, replacement, SVG/hit alignment, immediate source, Undo during exit, drag-away, refusal and reduced motion.",
    );
    console.log("Screenshots:", output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
