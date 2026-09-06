const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-zen-"));
  try {
    const p = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        colorScheme: "dark",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.stack));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8876/live/");
    const settle = () => p.waitForTimeout(280);
    await settle();
    await p.getByRole("combobox", { name: "Example" }).selectOption("4");
    await settle();
    const root = p.locator("#furl-app"),
      program = p.locator(".furl-program"),
      dock = p.locator(".furl-view-options");
    const tool = (k) => p.locator(`.furl-gesture-tools [data-tool=${k}]`);
    const rows = () =>
      p.locator(".furl-program-content > .furl-scope > .furl-binding");
    const expr = () => rows().first().locator(".furl-expression .code-editor");
    await expr().click();
    await settle();
    await p.keyboard.press("Meta+a");
    await settle();
    const saved = await p.evaluate(() =>
      localStorage.getItem("furl.live.v1.4"),
    );
    await p.evaluate(
      () => (window.zenEditor = document.querySelector("#active-code-editor")),
    );
    const normal = await program.boundingBox();
    await p.keyboard.press("F9");
    await settle();
    assert.equal(await root.getAttribute("data-zen"), "true");
    assert.equal(await dock.evaluate((n) => n.inert), true);
    assert.equal(await p.locator(".furl-header").isVisible(), false);
    assert.equal(await p.locator(".furl-inspector").isVisible(), false);
    let box = await program.boundingBox();
    assert.ok(box.x >= 160 && box.x <= 180, JSON.stringify(box));
    assert.ok(Math.abs(box.y - box.x) < 1, JSON.stringify(box));
    assert.ok(
      box.width < 600 && box.x > 150,
      "fixed upper-left margins around a compact program",
    );
    assert.equal(
      await p.evaluate(
        () =>
          window.zenEditor === document.querySelector("#active-code-editor"),
      ),
      true,
    );
    assert.equal(
      await p.evaluate(() => localStorage.getItem("furl.live.v1.4")),
      saved,
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Undo", exact: true, includeHidden: true })
        .isDisabled(),
      true,
    );
    assert.ok(
      (await p
        .locator(
          "#active-code-editor .selected,#active-code-editor .selected-expanded",
        )
        .count()) > 0,
      "native selection survives",
    );
    await p.mouse.move(1100, 650);
    await p.waitForTimeout(550);
    await p.screenshot({ path: path.join(output, "zen-dark.png") });
    // Hover reveals the existing controls without layout movement.
    await p.mouse.move(640, 4);
    await settle();
    assert.equal(await dock.evaluate((n) => n.inert), false);
    await tool("move").click();
    assert.equal(await root.getAttribute("data-tool"), "move");
    const revealed = await program.boundingBox();
    assert.deepEqual(revealed, box);
    await p.screenshot({ path: path.join(output, "zen-tools.png") });
    await p.mouse.move(1100, 650);
    await p.waitForTimeout(550);
    assert.equal(await dock.evaluate((n) => n.inert), true);
    assert.equal(await root.getAttribute("data-zen-tools"), "false");
    // Width edits grow rightward and retain the viewport and expression origins.
    await p.keyboard.press("Shift+F9");
    await tool("edit").click();
    await p.mouse.move(1100, 650);
    await p.waitForTimeout(550);
    await expr().click();
    await settle();
    await p.keyboard.press("Meta+a");
    const origin = await expr().boundingBox();
    await p.keyboard.type("123456789 + 123456789 + 123456789");
    await settle();
    const expanded = await program.boundingBox(),
      wideOrigin = await expr().boundingBox();
    assert.ok(
      expanded.width > box.width + 50,
      "exercise an actual width change",
    );
    assert.ok(
      Math.abs(expanded.x - box.x) < 1 && Math.abs(expanded.y - box.y) < 1,
    );
    assert.ok(
      Math.abs(wideOrigin.x - origin.x) < 1 &&
        Math.abs(wideOrigin.y - origin.y) < 1,
    );
    // Restore the fixture without relying on native typing history grouping.
    await p.keyboard.press("Meta+a");
    await p.keyboard.type("3");
    await settle();
    await p.keyboard.press("Shift+F9");
    await tool("move").click();
    await p.mouse.move(1100, 650);
    await p.waitForTimeout(550);
    // Insertion boundaries follow the anchored program and retain native Undo.
    const gap = p.locator(".furl-gap").nth(1);
    const gapBox = await gap.boundingBox();
    assert.ok(gapBox.y > box.y && gapBox.y < box.y + box.height);
    await gap.click();
    await settle();
    assert.equal(await rows().count(), 5);
    const taller = await program.boundingBox();
    assert.ok(
      taller.height > box.height &&
        Math.abs(taller.x - box.x) < 1 &&
        Math.abs(taller.y - box.y) < 1,
      "row insertion preserves origin",
    );
    await p.keyboard.press("Meta+z");
    await settle();
    assert.equal(await rows().count(), 4);
    // Keyboard-only tool access and escape restore code/row focus.
    await p.keyboard.press("Shift+F9");
    await settle();
    assert.equal(
      await p.evaluate(
        () => !!document.activeElement.closest(".furl-gesture-tools"),
      ),
      true,
    );
    await p.keyboard.press("Escape");
    await settle();
    assert.equal(await dock.evaluate((n) => n.inert), true);
    assert.equal(await root.getAttribute("data-zen"), "true");
    await p.keyboard.press("F9");
    await settle();
    assert.equal(await root.getAttribute("data-zen"), "false");
    assert.equal(await dock.evaluate((n) => n.inert), false);
    const restored = await program.boundingBox();
    assert.ok(
      Math.abs(normal.width - restored.width) < 1 &&
        Math.abs(normal.y - restored.y) < 1,
    );
    // The icon is another entry/exit; views retain the same program and editing tool.
    await p
      .getByRole("button", { name: "Enter Zen mode (F9)", exact: true })
      .click();
    await settle();
    assert.equal(await root.getAttribute("data-tool"), "move");
    await p.emulateMedia({ colorScheme: "light" });
    await p.screenshot({ path: path.join(output, "zen-light.png") });
    await p.setViewportSize({ width: 390, height: 844 });
    await settle();
    box = await program.boundingBox();
    assert.ok(Math.abs(box.x - 20) < 1 && Math.abs(box.y - 64) < 1);
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({ path: path.join(output, "zen-mobile.png") });
    await p.mouse.move(190, 4);
    await settle();
    const toolbar = await dock.boundingBox();
    assert.ok(toolbar.x >= 10 && toolbar.x + toolbar.width <= 380);
    await p
      .getByRole("button", { name: "Exit Zen mode (F9)", exact: true })
      .click();
    await settle();
    // Large programs remain scrollable below the top edge; no forced scaling.
    await p.setViewportSize({ width: 1280, height: 900 });
    await tool("edit").click();
    await p
      .getByRole("button", { name: "Toggle whole-program Hazel source" })
      .click();
    await settle();
    await p.locator("#active-code-editor").click();
    await settle();
    await p.keyboard.press("Meta+a");
    await settle();
    const text =
      Array.from({ length: 60 }, (_, i) => `let n${i} = ${i} in`).join("\n") +
      "\nn59";
    await p.evaluate(
      (text) =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { readText: () => Promise.resolve(text) },
        }),
      text,
    );
    await p.keyboard.press("Meta+v");
    await settle();
    await p
      .getByRole("button", { name: "Furl all lets, functions, and matches" })
      .click();
    await settle();
    await p.keyboard.press("F9");
    await settle();
    const tall = await program.evaluate((n) => ({
      r: n.getBoundingClientRect().toJSON(),
      height: n.clientHeight,
      scroll: n.scrollHeight,
    }));
    assert.ok(
      tall.scroll > tall.height &&
        tall.r.top >= 160 &&
        tall.r.top <= 180 &&
        tall.r.bottom <= 877,
      JSON.stringify(tall),
    );
    await program.evaluate((n) => (n.scrollTop = n.scrollHeight));
    await settle();
    const last = await p.locator(".furl-row").last().boundingBox();
    assert.ok(last.y >= tall.r.top && last.y + last.height <= tall.r.bottom);
    await p.screenshot({ path: path.join(output, "zen-tall.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Zen: fixed origin across width/height edits, mounted editor/selection/history preservation, hover/keyboard dock, gesture geometry, native Undo, icon entry/exit, responsive and tall scrolling.",
    );
    console.log("Screenshots:", output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
