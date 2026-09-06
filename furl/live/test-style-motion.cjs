const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-style-motion-"));
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await b.newPage({
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.stack));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8877/live/");
    await p.waitForSelector(".furl-hit");
    const settle = () => p.waitForTimeout(320),
      example = p.getByRole("combobox", { name: "Example" }),
      mode = p.locator(".furl-match-layout-toggle");
    await example.selectOption("2");
    await settle();
    const match = () => p.locator(".furl-match").first(),
      branches = () =>
        match().locator(":scope > .furl-branches > .furl-branch");
    const value = () =>
      p.locator(".furl-row").last().locator(".furl-value").innerText();
    const initialValue = await value();
    await mode.click();
    await settle();
    assert.equal(await branches().count(), 1);
    await match().locator(".furl-case-comb").first().click();
    await settle();
    const chosen = await branches().first().getAttribute("data-branch");
    // Drag the stub right; mounted native branches preview continuously.
    const fork = await match().locator(".furl-match-bridge").boundingBox();
    await p.mouse.move(fork.x + fork.width / 2, fork.y + fork.height / 2);
    await p.mouse.down();
    await p.mouse.move(fork.x + 180, fork.y + fork.height / 2, { steps: 15 });
    await p.waitForTimeout(50);
    assert.equal(await branches().count(), 2);
    assert.equal(
      await p.locator("#furl-app").getAttribute("data-match-motion"),
      "true",
    );
    await p.screenshot({ path: path.join(output, "match-opening.png") });
    await p.mouse.up();
    await settle();
    assert.equal(await mode.getAttribute("aria-pressed"), "true");
    let left = await branches().first().boundingBox(),
      stem = await branches()
        .nth(1)
        .locator(":scope > .furl-case-comb")
        .boundingBox();
    await p.mouse.move(stem.x + stem.width / 2, stem.y + 14);
    await p.mouse.down();
    await p.mouse.move(left.x + 10, stem.y + 14, { steps: 20 });
    await p.waitForTimeout(50);
    assert.ok(
      await branches()
        .nth(1)
        .evaluate((n) => getComputedStyle(n).transform !== "none"),
    );
    await p.screenshot({ path: path.join(output, "match-closing.png") });
    await p.mouse.up();
    await settle();
    assert.equal(await branches().count(), 1);
    assert.equal(await branches().first().getAttribute("data-branch"), chosen);
    assert.equal(await value(), initialValue);
    assert.equal(
      await p.getByRole("button", { name: "Undo", exact: true }).isDisabled(),
      true,
      "view gestures do not create history",
    );
    // Escape restores the prior single view after speculative expansion.
    const stub = await match().locator(".furl-match-bridge").boundingBox();
    await p.mouse.move(stub.x + 5, stub.y + 5);
    await p.mouse.down();
    await p.mouse.move(stub.x + 80, stub.y + 5, { steps: 8 });
    await p.keyboard.press("Escape");
    await p.mouse.up();
    await settle();
    assert.equal(await branches().count(), 1);
    await mode.click();
    await settle();
    // Switching programs starts without motion, even though both have a tail row.
    await example.selectOption("1");
    await p.waitForTimeout(35);
    assert.equal(
      await p
        .locator(".furl-program")
        .evaluate(
          (n) =>
            n
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === "running").length,
        ),
      0,
    );
    await settle();
    await p.locator("button[data-view=theme]").click();
    await settle();
    assert.ok((await p.locator(".token[data-furl-role=callee]").count()) > 0);
    assert.equal(
      await p
        .locator(".furl-value")
        .last()
        .evaluate((n) => getComputedStyle(n).color),
      "rgb(44, 210, 196)",
    );
    const token = p.locator(".token[data-furl-role=callee]").last();
    await token.hover();
    assert.equal(
      await token.evaluate((n) => getComputedStyle(n).color),
      "rgb(0, 251, 241)",
    );
    await p.screenshot({ path: path.join(output, "playful-functions.png") });
    // Native typing/selection, warning ink and solid hole selection.
    await p
      .getByRole("button", { name: "Toggle whole-program Hazel source" })
      .click();
    await settle();
    const editor = p.locator("#active-code-editor");
    await editor.click();
    await p.keyboard.press("Meta+a");
    await settle();
    const code =
      "let unused = 3 in let once = 4 in let many = 2 in (once, many + many, ¿)";
    await p.evaluate(
      (text) =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { readText: () => Promise.resolve(text) },
        }),
      code,
    );
    await p.keyboard.press("Meta+v");
    await settle();
    await p
      .getByRole("button", { name: "Furl all lets, functions, and matches" })
      .click();
    await settle();
    const unused = p
      .locator('.token[data-furl-uses="0"]')
      .filter({ hasText: "unused" });
    assert.equal(
      await unused.evaluate((n) => getComputedStyle(n).color),
      "rgb(176, 178, 227)",
    );
    const once = p
      .locator('.token[data-furl-uses="1"]')
      .filter({ hasText: "once" });
    assert.equal(
      await once.evaluate((n) => getComputedStyle(n).textDecorationLine),
      "none",
    );
    assert.equal(
      await p
        .locator('.token[data-furl-uses="2"]')
        .filter({ hasText: "many" })
        .evaluate((n) => getComputedStyle(n).textDecorationLine),
      "underline",
    );
    await p.locator(".furl-row").last().locator(".code-editor").click();
    await settle();
    await p.keyboard.press("Meta+a");
    await settle();
    await p.screenshot({ path: path.join(output, "playful-selection.png") });
    assert.ok(
      (await p
        .locator("svg.shard.selected,svg.shard.selected-expanded")
        .count()) > 0,
    );
    assert.ok(
      (await p.locator(".furl-selected-hole").count()) > 0,
      "selected hole has its own upright styling",
    );
    assert.equal(
      await p
        .locator(".furl-selected-hole path")
        .first()
        .evaluate((n) => getComputedStyle(n).stroke),
      "rgb(228, 255, 0)",
    );
    await p.emulateMedia({ reducedMotion: "reduce" });
    await example.selectOption("2");
    await settle();
    await mode.click();
    await settle();
    assert.equal(
      await p.locator("#furl-app").getAttribute("data-match-motion"),
      null,
    );
    assert.deepEqual(errors, []);
    console.log("Style / match motion passed; " + output);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
