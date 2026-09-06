const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-row-drag-audit-"));
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      colorScheme: "dark",
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8876/live/");
    await p.locator(".reference-wire").waitFor({ state: "attached" });
    const settle = () => p.waitForTimeout(350);
    const tool = (k) => p.locator(`.furl-gesture-tools [data-tool=${k}]`);
    const policy = (k) => p.locator(`.furl-gesture-tools [data-policy=${k}]`);
    const scope = () => p.locator(".furl-program-content > .furl-scope");
    const members = () => scope().locator(":scope > .furl-binding");
    const order = () =>
      members().evaluateAll((ns) =>
        ns.map((n) =>
          [...n.querySelectorAll(".furl-row")]
            .find((r) => r.dataset.bindingRow === n.dataset.binding)
            ?.querySelector(".furl-pattern .code")
            .textContent.trim(),
        ),
      );
    const value = () =>
      p.locator(".furl-row").last().locator(".furl-value").innerText();
    const status = () => p.locator(".furl-gesture-status").textContent();
    const undo = async () => {
      await p.getByRole("button", { name: "Undo", exact: true }).click();
      await settle();
    };
    const cancel = async () => {
      await p.keyboard.press("Escape");
      await p.mouse.up();
      await settle();
    };
    const move = (x, y) => p.mouse.move(x, y);
    const valuesVisible = async () =>
      assert.ok(
        await p
          .locator(".furl-value")
          .evaluateAll((ns) =>
            ns.every(
              (n) =>
                getComputedStyle(n).visibility === "visible" &&
                getComputedStyle(n).opacity !== "0" &&
                n.getBoundingClientRect().width > 0,
            ),
          ),
      );
    await tool("move").click();
    // Area and border are peers. Twice is inside border, not a second selection.
    const original = ["width", "height", "area", "border"];
    for (const mode of ["refactor", "refine"]) {
      await policy(mode).click();
      await members().nth(2).focus();
      await p.keyboard.press("Space");
      await p.keyboard.press("ArrowDown");
      assert.equal(await status(), "");
      await valuesVisible();
      await p.keyboard.press("Enter");
      await settle();
      assert.deepEqual(await order(), ["width", "height", "border", "area"]);
      assert.equal(await value(), "(24, 20)");
      await undo();
      assert.deepEqual(await order(), original);
    }
    await policy("free").click();
    const border = members().nth(3);
    const borderName = border
      .locator(".furl-pattern .code")
      .filter({ hasText: /^border$/ });
    const twiceName = border
      .locator(".furl-pattern .code")
      .filter({ hasText: /^twice$/ });
    const b = await border.boundingBox();
    // Hover the actual named row; the entire two-row binding lights up.
    const hoverBlank = async (name) => {
      const r = await name
        .locator(
          'xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," furl-row ")][1]',
        )
        .boundingBox();
      await p.mouse.move(r.x + 430, r.y + 11);
    };
    await hoverBlank(borderName);
    assert.equal(await p.locator("[data-row-hover=true]").count(), 1);
    assert.equal(await p.locator("[data-row-hover=true] .furl-row").count(), 2);
    await p.screenshot({ path: path.join(output, "border-hover.png") });
    await hoverBlank(twiceName);
    assert.equal(await p.locator("[data-row-hover=true] .furl-row").count(), 1);
    // Grabbing the bottom of a tall definition and moving only horizontally
    // must neither reorder nor jump it (also tests the whole value-row hit area).
    const x = b.x + 430,
      y = b.y + b.height - 7;
    await move(x, y);
    await p.mouse.down();
    await move(x + 12, y);
    await settle();
    assert.equal(await p.locator("[data-picked=true]").count(), 1);
    assert.equal(await p.locator("[data-picked=true] .furl-row").count(), 2);
    assert.ok(Math.abs((await border.boundingBox()).y - b.y) < 0.2);
    await valuesVisible();
    await cancel();
    const twice = await twiceName.boundingBox();
    await move(b.x + 430, twice.y + 11);
    await p.mouse.down();
    await move(b.x + 430, twice.y - 30);
    assert.match(await status(), /twice belongs to border.*scope-changing/);
    assert.equal(await p.locator("[data-picked=true] .furl-row").count(), 1);
    await p.mouse.up();
    await settle();
    assert.deepEqual(await order(), original);
    assert.equal(await value(), "(24, 20)");

    await p.getByRole("combobox", { name: "Example" }).selectOption("4");
    await settle();
    await tool("move").click();
    await policy("free").click();
    // Pause only the drag renderer's clock. Native source updates/WAAPI/layout
    // retain real time; sample actual painted boxes through controlled frames.
    await p.evaluate(() => {
      window.rowClock = performance.now();
      window.realNow = performance.now.bind(performance);
      window.realRAF = requestAnimationFrame;
      window.realCAF = cancelAnimationFrame;
      window.rowCallbacks = new Map();
      window.rowFrameID = -1;
      performance.now = () => window.rowClock;
      window.requestAnimationFrame = (cb) => {
        if (cb.name !== "paintRows") return window.realRAF(cb);
        const id = window.rowFrameID--;
        window.rowCallbacks.set(id, cb);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        if (id < 0) window.rowCallbacks.delete(id);
        else window.realCAF(id);
      };
      window.advanceRows = (ms) => {
        for (let remaining = ms; remaining > 0; ) {
          const dt = Math.min(remaining, 10);
          remaining -= dt;
          window.rowClock += dt;
          const pending = [...window.rowCallbacks.values()];
          window.rowCallbacks.clear();
          pending.forEach((cb) => cb(window.rowClock));
        }
      };
    });
    const tick = (ms) => p.evaluate((ms) => window.advanceRows(ms), ms);
    const bonus = members().nth(2),
      start = await bonus.boundingBox();
    const bx = start.x + 400,
      by = start.y + 11;
    await move(bx, by);
    await p.mouse.down();
    await move(bx + 10, by);
    await tick(500);
    assert.ok(
      Math.abs((await bonus.boundingBox()).y - start.y) < 0.1,
      "horizontal pickup preserves slot",
    );
    // The boundary has a dead band: small movement does not select another row.
    await move(bx + 10, by + 12);
    await tick(500);
    assert.ok(
      Math.abs((await bonus.boundingBox()).y - start.y) < 0.1,
      "boundary jitter does not change slot",
    );
    await move(bx + 10, by - 44);
    assert.ok(
      Math.abs((await bonus.boundingBox()).y - start.y) < 0.1,
      "new target does not teleport",
    );
    await tick(50);
    const at50 = (await bonus.boundingBox()).y;
    assert.ok(
      at50 < start.y - 1 && at50 > start.y - 44 * 0.4,
      "departure eases into motion instead of snapping most of the distance",
    );
    // Reverse while still in flight. The first frame is continuous and the next
    // frame retains momentum before turning, rather than restarting an ease.
    await move(bx + 10, by);
    assert.ok(
      Math.abs((await bonus.boundingBox()).y - at50) < 0.1,
      "retarget preserves painted position",
    );
    await tick(10);
    assert.ok(
      (await bonus.boundingBox()).y < at50,
      "reversal retains velocity",
    );
    await tick(600);
    assert.ok(Math.abs((await bonus.boundingBox()).y - start.y) < 0.1);
    await valuesVisible();
    assert.equal(await value(), "10");
    // Releasing mid-flight retains the painted position through native commit.
    await move(bx + 10, by - 44);
    await tick(70);
    const beforeDrop = (await bonus.boundingBox()).y;
    await p.evaluate(() => {
      window.savedAnimate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const a = window.savedAnimate.apply(this, args);
        if (this.matches(".furl-binding,.furl-tail")) {
          a.pause();
          a.currentTime = 0;
        }
        return a;
      };
    });
    const id = await bonus.getAttribute("data-binding");
    await p.mouse.up();
    await p.waitForTimeout(100);
    assert.deepEqual(await order(), ["bonus", "n", "twice", "total"]);
    assert.ok(
      Math.abs(
        (await p.locator(`[data-binding="${id}"]`).boundingBox()).y -
          beforeDrop,
      ) < 0.5,
      "drop starts at the current painted position",
    );
    assert.equal(await value(), "10");
    await valuesVisible();
    await p.screenshot({ path: path.join(output, "drop-midflight.png") });
    await p.evaluate(() => {
      Element.prototype.animate = window.savedAnimate;
      document.getAnimations().forEach((a) => a.finish());
      performance.now = window.realNow;
      window.requestAnimationFrame = window.realRAF;
      window.cancelAnimationFrame = window.realCAF;
    });
    await settle();
    await undo();
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total"]);
    // System reduced motion and Float remain usable with the same candidates.
    await p.emulateMedia({ reducedMotion: "reduce" });
    const r = await members().nth(2).boundingBox();
    await move(r.x + 400, r.y + 11);
    await p.mouse.down();
    await move(r.x + 400, r.y - 33);
    assert.ok(
      Math.abs((await members().nth(2).boundingBox()).y - (r.y - 44)) < 0.1,
    );
    await cancel();
    await p.emulateMedia({ reducedMotion: "no-preference" });
    await p.locator("[data-variant=float]").click();
    await move(r.x + 400, r.y + 11);
    await p.mouse.down();
    await move(r.x + 430, r.y - 33);
    const floating = await members().nth(2).boundingBox();
    assert.ok(
      Math.abs(floating.x - r.x - 30) < 0.2 &&
        Math.abs(floating.y - r.y + 44) < 0.2,
    );
    await valuesVisible();
    await cancel();
    assert.deepEqual(errors, []);
    console.log(
      "PASS row audit: nested checked moves, exact subtree hover/pickup, scope feedback, stable slot targeting, hysteresis, continuous reversal/drop, values, Undo, reduced motion and Float.",
    );
    console.log(output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
