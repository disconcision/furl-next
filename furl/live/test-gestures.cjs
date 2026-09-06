const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs"),
  os = require("node:os");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-native-gestures-"));
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
        colorScheme: "dark",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("console", (e) => {
      if (e.type() === "error") errors.push(e.text());
    });
    const url = process.env.TEST_URL || "http://127.0.0.1:8876/live/";
    const settle = () => p.waitForTimeout(260);
    const tool = (k) => p.locator(`.furl-gesture-tools [data-tool=${k}]`);
    const policy = (k) => p.locator(`.furl-gesture-tools [data-policy=${k}]`);
    const rootScope = () => p.locator(".furl-program-content > .furl-scope");
    const members = () => rootScope().locator(":scope > .furl-binding");
    const order = () =>
      members().evaluateAll((ns) =>
        ns.map((n) =>
          n.querySelector(".furl-pattern .code").textContent.trim(),
        ),
      );
    const value = () =>
      p.locator(".furl-row").last().locator(".furl-value").innerText();
    const choose = async (id) => {
      await p
        .getByRole("combobox", { name: "Example" })
        .selectOption(String(id));
      await settle();
    };
    const undo = async () => {
      await p.getByRole("button", { name: "Undo", exact: true }).click();
      await settle();
    };
    const fresh = async () => {
      await p.goto(url);
      await p.locator(".reference-wire").waitFor({ state: "attached" });
      await settle();
    };
    await fresh();
    await choose(4);
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total"]);
    assert.equal(await value(), "10");
    assert.equal(
      await p
        .locator(".furl-gesture-tools button")
        .evaluateAll((ns) =>
          ns.every(
            (n) =>
              n.textContent === "" && n.title && n.getAttribute("aria-label"),
          ),
        ),
      true,
    );
    await tool("rows").click();
    const initial = await p.locator(".furl-row").evaluateAll((ns) =>
      ns.map((n) => ({
        id: n.closest(".furl-binding,.furl-tail").dataset.binding || "tail",
        y: n.getBoundingClientRect().top,
        x: [...n.children].map((n) => n.getBoundingClientRect().left),
      })),
    );
    // Pause reflow at its first frame to distinguish smooth insertion from a jump.
    await p.evaluate(() => {
      window.portAnimate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const a = window.portAnimate.apply(this, args);
        if (this.matches(".furl-binding,.furl-tail")) {
          a.pause();
          a.currentTime = 0;
        }
        return a;
      };
    });
    const gap = p.locator(".furl-gap").nth(1);
    await gap.click();
    await p.waitForTimeout(100);
    assert.equal(await members().count(), 5);
    const inserted = await p.locator(".furl-row").evaluateAll((ns) =>
      ns.map((n) => ({
        id: n.closest(".furl-binding,.furl-tail").dataset.binding || "tail",
        y: n.getBoundingClientRect().top,
      })),
    );
    for (const old of initial) {
      assert.ok(
        Math.abs(inserted.find((n) => n.id === old.id).y - old.y) < 1,
        `existing row starts at its old painted position: ${JSON.stringify({ old, next: inserted.find((n) => n.id === old.id) })}`,
      );
    }
    await p.evaluate(() => {
      Element.prototype.animate = window.portAnimate;
      document
        .querySelectorAll(".furl-binding,.furl-tail")
        .forEach((n) => n.getAnimations().forEach((a) => a.finish()));
    });
    await settle();
    assert.ok(
      await p.evaluate(
        () =>
          document.activeElement.closest("[data-cell]")?.dataset.cellActive ===
          "true",
      ),
    );
    await p.keyboard.press("Backspace");
    await settle();
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total"]);
    await undo();
    assert.equal(await members().count(), 5);
    await undo();
    assert.equal(await members().count(), 4);
    // Keyboard insertion is independent of the chosen tool and preserves native focus.
    await tool("edit").click();
    await members().nth(1).locator(".furl-expression .code-editor").click();
    await p.keyboard.press("Meta+Enter");
    await settle();
    assert.equal(await members().count(), 5);
    await undo();
    await tool("rows").click();
    // Pointer primacy across the value column; Slot keeps x fixed, preview is not saved.
    const bonus = members().nth(2),
      original = await bonus.boundingBox(),
      n = await members().first().boundingBox();
    const stored = await p.evaluate(() =>
      localStorage.getItem("furl.live.v1.4"),
    );
    await p.mouse.move(original.x + original.width - 25, original.y + 11);
    await p.mouse.down();
    await p.mouse.move(n.x + 250, n.y + 2, { steps: 8 });
    await settle();
    const moved = await bonus.boundingBox();
    assert.ok(Math.abs(moved.x - original.x) < 1);
    assert.ok(moved.y < original.y - 30);
    assert.equal(
      await p.evaluate(() => localStorage.getItem("furl.live.v1.4")),
      stored,
      "preview does not persist",
    );
    await p.mouse.up();
    await settle();
    assert.deepEqual(await order(), ["bonus", "n", "twice", "total"]);
    assert.equal(await value(), "10");
    await undo();
    // Keyboard pickup can finish at a clicked boundary, without inserting a row.
    await members().nth(2).focus();
    await p.keyboard.press("Space");
    await p.locator(".furl-gap").first().click();
    await settle();
    assert.deepEqual(await order(), ["bonus", "n", "twice", "total"]);
    assert.equal(await members().count(), 4);
    await undo();
    // Keyboard previews, refusal, one-step undo, and Free edit error feedback.
    await members().nth(2).focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowUp");
    await p.keyboard.press("Enter");
    await settle();
    assert.deepEqual(await order(), ["n", "bonus", "twice", "total"]);
    await undo();
    await members().nth(1).focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowUp");
    assert.match(
      await p.locator(".furl-gesture-status").textContent(),
      /binding|scope/,
    );
    await p.keyboard.press("Escape");
    await settle();
    assert.deepEqual(await order(), ["n", "twice", "bonus", "total"]);
    await policy("free").click();
    await members().nth(1).focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowUp");
    await p.keyboard.press("Enter");
    await settle();
    assert.deepEqual(await order(), ["twice", "n", "bonus", "total"]);
    assert.match(
      await p.locator(".furl-problem-totals").textContent(),
      /[1-9].*error/,
    );
    await undo();
    // Double-click reactivates native text editing, including ordinary selection.
    const expr = members().first().locator(".furl-expression .code-editor");
    await expr.dblclick();
    await settle();
    await p.keyboard.press("Meta+a");
    await p.keyboard.type("7");
    await settle();
    assert.equal(await value(), "18");
    await undo();
    await p.screenshot({
      path: path.join(output, "rows-dark.png"),
      fullPage: true,
    });
    // Populated deletion and exact recovery; leaving/returning then Escape cancels.
    const doomed = await members().nth(2).boundingBox(),
      canvas = await p.locator(".furl-program").boundingBox();
    await p.mouse.move(doomed.x + 20, doomed.y + 11);
    await p.mouse.down();
    await p.mouse.move(canvas.x + canvas.width + 25, doomed.y + 11, {
      steps: 7,
    });
    await p.mouse.up();
    await settle();
    assert.equal(await members().count(), 3);
    await undo();
    assert.equal(await members().count(), 4);
    await members().nth(2).focus();
    await p.keyboard.press("Meta+Shift+Backspace");
    await settle();
    assert.equal(await members().count(), 3);
    await undo();
    // Quasimode can activate rows without a permanent mode; blur cancels safely.
    await tool("edit").click();
    const bb = await members().nth(2).boundingBox();
    await p.mouse.move(bb.x + 500, bb.y + 10);
    await p.keyboard.down("Alt");
    assert.equal(
      await p.locator("#furl-app").getAttribute("data-tool"),
      "rows",
    );
    await p.keyboard.up("Alt");
    assert.equal(
      await p.locator("#furl-app").getAttribute("data-tool"),
      "edit",
    );
    // Connections use actual typed holes and evaluation, including click-away cancellation.
    await choose(5);
    await tool("connect").click();
    await policy("refine").click();
    const binder = (name) =>
      p.locator(`.furl-hit[data-kind=binder][data-name="${name}"]`);
    const holes = () => p.locator(".furl-hit[data-kind=hole]");
    assert.equal(await holes().count(), 2);
    await binder("width").click();
    const panel = await p.locator(".furl-program").boundingBox();
    await p.mouse.click(panel.x + panel.width - 30, panel.y + 45);
    await p.waitForTimeout(70);
    assert.equal(await holes().count(), 2);
    assert.equal(
      await p.locator(".reference-wire").getAttribute("data-kind"),
      "retract",
    );
    await binder("width").click();
    await holes().first().click();
    await settle();
    assert.equal(await holes().count(), 1);
    await binder("height").click();
    await holes().first().click();
    await settle();
    assert.equal(await holes().count(), 0);
    assert.equal(await value(), "24");
    const use = (name) =>
      p.locator(`.furl-hit[data-kind=reference][data-name="${name}"]`);
    await use("width").hover();
    await settle();
    assert.equal(
      await p.locator(".reference-wire").getAttribute("data-kind"),
      "hover",
    );
    await p.screenshot({
      path: path.join(output, "connection-dark.png"),
      fullPage: true,
    });
    // A use stays intact until release; a miss anywhere unplugs in Free edit.
    await policy("free").click();
    let a = await use("width").boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + 11);
    await p.mouse.down();
    await p.mouse.move(panel.x + panel.width - 40, a.y + 40, { steps: 8 });
    await settle();
    assert.equal(await holes().count(), 0);
    await p.mouse.up();
    await settle();
    assert.equal(await holes().count(), 1);
    await undo();
    assert.equal(await value(), "24");
    // Keyboard-picked uses cancel on click-away, and move with their binding identity.
    await use("width").focus();
    await p.keyboard.press("Space");
    await p.mouse.click(panel.x + panel.width - 40, panel.y + 30);
    await settle();
    assert.equal(await value(), "24");
    await use("height").focus();
    await p.keyboard.press("Backspace");
    await settle();
    assert.equal(await holes().count(), 1);
    await use("width").focus();
    await p.keyboard.press("Space");
    await holes().first().focus();
    await p.keyboard.press("Enter");
    await settle();
    assert.equal(await use("width").count(), 1);
    assert.equal(await holes().count(), 1);
    await undo();
    await undo();
    assert.equal(await value(), "24");
    // Editing and native navigation still work after leaving Connect.
    await tool("edit").click();
    await members().first().locator(".furl-expression .code-editor").click();
    await settle();
    await p.keyboard.press("ArrowDown");
    await settle();
    assert.equal(
      await p.evaluate(
        () =>
          document.activeElement
            .closest(".furl-row")
            .querySelector(".furl-pattern .code").textContent,
      ),
      "height",
    );
    await p.emulateMedia({ colorScheme: "light" });
    await p.screenshot({
      path: path.join(output, "connections-light.png"),
      fullPage: true,
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await settle();
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: path.join(output, "mobile.png"),
      fullPage: true,
    });
    await p.emulateMedia({ reducedMotion: "reduce" });
    await choose(4);
    await tool("rows").click();
    await members().first().focus();
    await p.keyboard.press("Meta+Enter");
    await settle();
    assert.equal(
      await p
        .locator(".furl-program")
        .evaluate((n) => n.getAnimations({ subtree: true }).length),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS native gestures: insertion frames, focus, keyboard/pointer slot movement, lexical refusal/free edits, delete/Undo, double-click editing, contextual modifier, wire creation/cancel/move/unplug, native evaluation/navigation, responsive and reduced motion.",
    );
    console.log("Screenshots:", output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
