// Browser-level checks for the offline proposal. Never touches live editor storage.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const url =
  process.env.TEST_URL ||
  pathToFileURL(path.resolve(__dirname, "../../docs/interactions.html")).href;
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-interactions-"));
  try {
    const page = await browser.newPage({
        viewport: { width: 1200, height: 950 },
        colorScheme: "dark",
      }),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) requests.push(r.url());
    });
    if (url.startsWith("file:")) await page.route(/^https?:/, (r) => r.abort());
    const order = () =>
      page
        .locator("#row-lab .edit-row")
        .evaluateAll((ns) => ns.map((n) => n.dataset.id));
    const text = () => page.locator("#row-lab .row-source").textContent();
    const rowTarget = (id) => page.locator(`#row-lab [data-id="${id}"]`);
    const expr = (id) => page.locator(`#row-lab [data-id="${id}"] .expression`);
    const status = () => page.locator("#row-lab .lab-status").textContent();
    const activate = () => page.locator("#row-lab .structure-toggle").click();
    const reset = async () => {
      await page.goto(url);
      await page.locator("#row-lab").scrollIntoViewIfNeeded();
    };
    await reset();
    await require("./tool-test.cjs")(page, output);
    await reset();
    await require("./wire-test.cjs")(page, output);
    await reset();
    await require("./cell-mode-test.cjs")(page, output);
    await reset();
    await require("./motion-test.cjs")(page, output);
    await reset();
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total", "result"]);
    assert.equal(
      await page.locator("#inventory-count").textContent(),
      "26 of 26 actions",
    );
    // Normal hover/click does not insert; modifier reveals the same overlay without layout changes.
    const gap = page.locator('#row-lab .gap[data-slot="1"]');
    const box = await gap.boundingBox();
    const columns = await expr("n").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal((await order()).length, 5);
    await page.mouse.move(box.x + 15, box.y + 4);
    await page.keyboard.down("Alt");
    assert.equal(
      await page
        .locator("#row-lab")
        .evaluate((n) => n.classList.contains("armed")),
      true,
    );
    await page.mouse.click(box.x + box.width / 2, box.y + 4);
    assert.equal((await order()).length, 6);
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.field),
      "expression",
    );
    await page.keyboard.up("Alt");
    assert.equal(
      await page
        .locator("#row-lab .structure-toggle")
        .getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await page
        .locator("#row-lab")
        .evaluate((n) => n.classList.contains("armed")),
      false,
    );
    assert.equal((await expr("n").boundingBox()).x, columns.x);
    await page.locator("#row-lab [data-action=undo]").click();
    assert.equal((await order()).length, 5);
    // Cmd/Ctrl+Enter is independent of Structure; terminal insertion is before result.
    await expr("twice").focus();
    await page.keyboard.press("Meta+Enter");
    assert.equal((await order())[2], "draft2");
    await page.keyboard.press("Control+z");
    assert.equal((await order()).length, 5);
    await expr("result").focus();
    await page.keyboard.press("Control+Shift+Enter");
    assert.equal((await order()).at(-2), "draft3");
    await page.locator("#row-lab [data-action=undo]").click();
    // Typing retains focus and changes dependent values without executing arbitrary JS.
    await expr("n").fill("8");
    assert.equal(
      await page.locator("#row-lab [data-id=twice] .value").textContent(),
      "16",
    );
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      ),
      "Expression for n",
    );
    await expr("n").fill("window.alert(1)");
    assert.match(await status(), /Unsupported|Unexpected|not bound/);
    await reset();
    // Keyboard pickup previews, cancels, and commits exactly one undo entry.
    await rowTarget("bonus").focus();
    await page.keyboard.press("Space");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      ),
      "bonus row",
    );
    await page.keyboard.press("ArrowUp");
    assert.deepEqual(await order(), ["n", "bonus", "twice", "total", "result"]);
    await page.keyboard.press("Escape");
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total", "result"]);
    assert.equal(
      await page.locator("#row-lab [data-action=undo]").isDisabled(),
      true,
    );
    await rowTarget("bonus").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    assert.deepEqual(await order(), ["bonus", "n", "twice", "total", "result"]);
    await page.locator("#row-lab [data-action=undo]").click();
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total", "result"]);
    assert.equal(
      await page.locator("#row-lab [data-action=undo]").isDisabled(),
      true,
    );
    // A dependency-blocked candidate never commits; free editing exposes the actual error.
    await rowTarget("twice").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    assert.match(await status(), /Blocked.*n is not bound/);
    await page.keyboard.press("Enter");
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total", "result"]);
    await page.locator("[data-policy=free]").click();
    await rowTarget("twice").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    assert.deepEqual(await order(), ["twice", "n", "bonus", "total", "result"]);
    assert.equal(
      await page.locator("#row-lab [data-id=twice] .value").textContent(),
      "?",
    );
    await page.locator("#row-lab [data-action=undo]").click();
    // Pointer move, keyboard pickup/click-to-place, quasimode latch/release, and cancel-on-blur.
    await reset();
    await activate();
    let h = await rowTarget("bonus").boundingBox();
    await page.mouse.move(h.x + 11, h.y + 11);
    await page.mouse.down();
    await page.mouse.move(h.x + 11, h.y - 33, { steps: 8 });
    await page.mouse.up();
    assert.deepEqual(await order(), ["bonus", "n", "twice", "total", "result"]);
    await page.locator("#row-lab [data-action=undo]").click();
    await rowTarget("bonus").click();
    await page.keyboard.press("Space");
    await page.locator('#row-lab .gap[data-slot="0"]').click();
    assert.deepEqual(await order(), ["bonus", "n", "twice", "total", "result"]);
    await reset();
    h = await rowTarget("bonus").boundingBox();
    await page.mouse.move(h.x + 11, h.y + 11);
    await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(h.x + 11, h.y - 33, { steps: 6 });
    await page.keyboard.up("Alt");
    await page.mouse.up();
    assert.deepEqual(await order(), ["bonus", "n", "twice", "total", "result"]);
    assert.equal(
      await page
        .locator("#row-lab .structure-toggle")
        .getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await page
        .locator("#row-lab")
        .evaluate((n) => n.classList.contains("armed")),
      false,
    );
    await activate();
    h = await rowTarget("n").boundingBox();
    const before = await text();
    await page.mouse.move(h.x + 11, h.y + 11);
    await page.mouse.down();
    await page.mouse.move(h.x + 11, h.y - 11, { steps: 5 });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    assert.equal(await text(), before);
    assert.equal(await page.locator(".drag-ghost").count(), 0);
    // Reference keyboard uses and pointer drag keep definitions intact.
    await page.locator("#reference-lab .structure-toggle").click();
    const binder = (id) =>
        page.locator(`#reference-lab [data-binder="${id}-binding"]`),
      hole = (i) => page.locator(`#reference-lab [data-hole="${i}"]`);
    await binder("width").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.hole),
      "0",
    );
    await page.keyboard.press("Enter");
    assert.equal(await hole(0).textContent(), "width");
    // Let the first word finish opening before sampling the next hole's
    // coordinates; the second factor deliberately moves during that tween.
    await page
      .locator("#reference-lab .reference-program")
      .evaluate((n) =>
        Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)),
      );
    await binder("height").scrollIntoViewIfNeeded();
    const b = await binder("height").boundingBox(),
      target = await hole(1).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + 11);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 11, {
      steps: 9,
    });
    await page.mouse.up();
    assert.equal(await hole(1).textContent(), "height");
    assert.equal(
      await page
        .locator("#reference-lab .reference-row")
        .last()
        .locator(".ref-value")
        .textContent(),
      "24",
    );
    assert.equal(await binder("height").textContent(), "height");
    await page.locator("#reference-lab [data-action=undo]").click();
    assert.equal(await hole(1).textContent(), "□");
    await binder("height").click();
    await page.keyboard.press("Escape");
    await hole(1).click();
    assert.equal(await hole(1).textContent(), "□");
    // All story states, reversible toggles, source panels, and reduced-motion.
    for (const id of [
      "extract",
      "group",
      "resize",
      "abstract",
      "branch",
      "carry",
      "helper",
      "unabstract",
    ]) {
      await page.locator("#story-choice").selectOption(id);
      await page.locator('[data-step="1"]').click();
      assert.equal(
        await page.locator('[data-step="1"]').getAttribute("aria-pressed"),
        "true",
      );
      assert.ok((await page.locator(".story-after").textContent()).length > 5);
      await page.locator('[data-step="0"]').click();
    }
    await page.locator("#story-choice").selectOption("helper");
    await page.locator('[data-step="1"]').click();
    await page.locator("#transformations").scrollIntoViewIfNeeded();
    await page
      .locator(".story-program")
      .evaluate((n) =>
        Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)),
      );
    await page.screenshot({ path: path.join(output, "helper-dark.png") });
    await page.locator("#inventory-search").fill("unresolved");
    assert.ok((await page.locator("#inventory tbody tr:visible").count()) > 0);
    await page.locator("#inventory-search").fill("no-such-operation");
    assert.equal(
      await page.locator("#inventory-count").textContent(),
      "0 of 26 actions",
    );
    await page.locator("#inventory-search").fill("");
    await page.locator("#inventory-origin").selectOption("Big Book");
    assert.ok((await page.locator("#inventory tbody tr:visible").count()) > 5);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.reload();
    assert.equal(await page.locator("#motion").isChecked(), false);
    // Reduced motion still moves rows directly, with no insertion/reflow tweens.
    await expr("n").focus();
    await page.keyboard.press("Meta+Enter");
    assert.equal(
      await page
        .locator("#row-lab .row-program")
        .evaluate((n) => n.getAnimations({ subtree: true }).length),
      0,
    );
    await rowTarget("bonus").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    assert.deepEqual(await order(), [
      "n",
      "draft1",
      "bonus",
      "twice",
      "total",
      "result",
    ]);
    assert.equal(
      await page
        .locator("#row-lab .row-program")
        .evaluate((n) => n.getAnimations({ subtree: true }).length),
      0,
    );
    await page.reload();
    await page.locator("#rows").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "rows-light.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#rows").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: path.join(output, "rows-mobile.png") });
    await page.locator("#story-choice").selectOption("branch");
    await page.locator('[data-step="1"]').click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    if (url.startsWith("file:")) assert.deepEqual(requests, []);
    console.log(
      "Passed: tool/policy sharing, slot/float motion, row and reference deletion, unplug/retraction, cancellation and undo, insertion/drag/drop frame geometry and reversals, refactor movement through drafts, offline loading, mode gating, insertion/focus, keyboard/pointer movement, dependency refusal/free edits, undo/cancel/blur, reference placement, 8 storyboards, filtering, mobile, reduced motion.",
    );
    console.log("Screenshots:", output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
