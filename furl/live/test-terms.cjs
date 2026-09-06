const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-term-parity-"));
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
        viewport: { width: 1380, height: 960 },
        colorScheme: "dark",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.stack));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8877/live/");
    await p.locator(".reference-wire").waitFor({ state: "attached" });
    const settle = () => p.waitForTimeout(300);
    const tool = (k) => p.locator(`button[data-tool=${k}]`);
    const policy = (k) => p.locator(`button[data-policy=${k}]`);
    const rows = () =>
      p.locator(".furl-program-content > .furl-scope > .furl-binding");
    const names = () =>
      rows().evaluateAll((ns) =>
        ns.map((n) =>
          n.querySelector(".furl-pattern .code").textContent.trim(),
        ),
      );
    const value = () =>
      p.locator(".furl-row").last().locator(".furl-value").innerText();
    const undo = async () => {
      await p.getByRole("button", { name: "Undo", exact: true }).click();
      await settle();
    };
    const term = async (code, glyph) => {
      const key = await p
        .locator(".furl-hit")
        .evaluateAll(
          (ns, { code, glyph }) =>
            ns.find(
              (n) => n._code.trim() === code && (!glyph || n._glyph === glyph),
            )?.dataset.key,
          { code, glyph },
        );
      assert.ok(key, `native handle for ${code} / ${glyph || ""}`);
      return p.locator(`.furl-hit[data-key="${key}"]`).first();
    };
    const pickDrop = async (a, b) => {
      await a.focus();
      await p.keyboard.press("Space");
      await b.focus();
      await p.keyboard.press("Enter");
      await settle();
    };
    async function program(text) {
      await tool("edit").click();
      await p
        .getByRole("button", { name: "Toggle whole-program Hazel source" })
        .click();
      await settle();
      await p.locator("#active-code-editor").click();
      await p.keyboard.press("Meta+a");
      await settle();
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
    }
    await program("let a = 2 in let b = 3 in let sum = a + b in ¿ * 4");
    await tool("copy").click();
    await policy("refine").click();
    const plus = await term("a + b", "+");
    await plus.hover();
    await settle();
    const range = await p.locator(".furl-term-range").boundingBox(),
      handle = await plus.boundingBox();
    assert.ok(
      range.width > handle.width * 4.5,
      "operator highlights its entire term",
    );
    await pickDrop(plus, p.locator(".furl-hit[data-kind=hole]").first());
    assert.equal(await value(), "20", "copy keeps grouping in multiplication");
    assert.deepEqual(await names(), ["a", "b", "sum"]);
    await undo();
    await tool("move").click();
    await pickDrop(
      await term("a + b", "+"),
      p.locator(".furl-hit[data-kind=hole]").first(),
    );
    assert.match(
      await p.locator(".furl-gesture-status").textContent(),
      /Free/,
      "Refine does not erase source",
    );
    await policy("free").click();
    await pickDrop(
      await term("a + b", "+"),
      p.locator(".furl-hit[data-kind=hole]").first(),
    );
    assert.equal(
      await rows().nth(2).locator(".furl-hit[data-kind=hole]").count(),
      1,
    );
    assert.equal(await value(), "20");
    await undo();
    // Free targets the whole destination delimiter, not just its character.
    await tool("copy").click();
    await pickDrop(await term("2"), await term("a + b", "+"));
    assert.equal(
      (
        await rows().nth(2).locator(".furl-expression .code").innerText()
      ).trim(),
      "2",
    );
    await undo();
    // Copying rows keeps the original, assigns a fresh name, and is one Undo.
    await policy("refactor").click();
    await rows().nth(1).focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowDown");
    assert.equal(await p.locator(".furl-row-copy-ghost").count(), 1);
    await settle();
    const preview = await p.locator(".furl-row-copy-ghost").boundingBox(),
      following = await rows().nth(2).boundingBox();
    assert.ok(
      preview.y + preview.height <= following.y + 1,
      "copy opens a readable slot",
    );
    await p.screenshot({ path: path.join(output, "row-copy.png") });
    await p.keyboard.press("Enter");
    await settle();
    assert.deepEqual(await names(), ["a", "b", "b2", "sum"]);
    await undo();
    // Extraction and defining an unresolved use share the boundary above its row.
    await tool("move").click();
    await (await term("a + b", "+")).focus();
    await p.keyboard.press("Meta+Shift+Enter");
    await settle();
    assert.deepEqual(await names(), ["a", "b", "bro", "sum"]);
    assert.equal(
      (
        await rows().nth(3).locator(".furl-expression .code").innerText()
      ).trim(),
      "bro",
    );
    await undo();
    await program("let a = missing + 2 in a");
    await tool("move").click();
    await policy("refine").click();
    await (await term("missing")).focus();
    await p.keyboard.press("Meta+Shift+Enter");
    await settle();
    assert.deepEqual(await names(), ["missing", "a"]);
    assert.equal(
      await rows().first().locator(".furl-hit[data-kind=hole]").count(),
      1,
    );
    await undo();
    // Mouse extraction targets the native row boundary; arbitrary spaces are not targets.
    await program("let n = 3 + 4 * 2 in n");
    await tool("move").click();
    await policy("refactor").click();
    let source = await (await term("4 * 2", "*")).boundingBox(),
      r = await rows().first().boundingBox();
    await p.mouse.move(source.x + source.width / 2, source.y + 11);
    await p.mouse.down();
    await p.mouse.move(r.x + 35, r.y - 2, { steps: 8 });
    await settle();
    assert.equal(await p.locator(".furl-extract-boundary").count(), 1);
    await p.mouse.up();
    await settle();
    assert.deepEqual(await names(), ["bro", "n"]);
    assert.equal(await value(), "11");
    await undo();
    await policy("free").click();
    source = await (await term("4 * 2", "*")).boundingBox();
    r = await rows().first().boundingBox();
    await p.mouse.move(source.x + source.width / 2, source.y + 11);
    await p.mouse.down();
    await p.mouse.move(r.x + r.width - 30, r.y + 11, { steps: 8 });
    await p.mouse.up();
    await settle();
    assert.deepEqual(await names(), ["n"]);
    assert.equal(await value(), "11");
    // Glyphs own pickup; the neutral one-character strip does not pick rows.
    const literal = await term("3");
    const q = await literal.boundingBox();
    await p.mouse.move(q.x + q.width + 3, q.y + 11);
    await p.mouse.down();
    await p.mouse.move(q.x + q.width + 10, q.y + 11);
    assert.equal(await p.locator("[data-picked=true]").count(), 0);
    await p.keyboard.press("Escape");
    await p.mouse.up();
    // Nested copy expands the owning scope, and cancellation restores its layout.
    await program("let f = fun p -> let x = 2 in x * p in f(3)");
    await tool("copy").click();
    await policy("refactor").click();
    const inner = () => p.locator(".furl-function .furl-binding");
    const originalBox = await p.locator(".furl-program").boundingBox();
    await inner().first().focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowDown");
    await settle();
    const expandedBox = await p.locator(".furl-program").boundingBox();
    assert.ok(expandedBox.height > originalBox.height + 20);
    await p.keyboard.press("Escape");
    await settle();
    assert.ok(
      Math.abs(
        (await p.locator(".furl-program").boundingBox()).height -
          originalBox.height,
      ) < 1,
    );
    await inner().first().focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    await settle();
    assert.equal(await inner().count(), 2);
    assert.equal(await value(), "6");
    await undo();
    assert.equal(await inner().count(), 1);
    await (await term("2")).focus();
    await p.keyboard.press("ArrowDown");
    assert.equal(
      await p.evaluate(() => document.activeElement.dataset.name),
      "x",
    );
    // Theme uses the measured pixel font, keeps hit geometry aligned, and persists.
    await p.locator("button[data-view=theme]").click();
    await p.waitForTimeout(800);
    const alignment = await p.locator(".furl-hit").evaluateAll((ns) =>
      ns
        .filter((n) => n._glyph === "*")
        .map((n) => {
          const token = [
            ...n.closest("[data-cell]").querySelectorAll(".code-text .token"),
          ].find((t) => t.textContent === "*");
          const a = n.getBoundingClientRect(),
            b = token.getBoundingClientRect();
          return [Math.abs(a.x - b.x), Math.abs(a.y - b.y)];
        }),
    );
    assert.ok(
      alignment.length && alignment.every(([x, y]) => x < 1 && y < 2),
      JSON.stringify(alignment),
    );
    await p.screenshot({ path: path.join(output, "playful.png") });
    await p.reload();
    await p.locator(".reference-wire").waitFor({ state: "attached" });
    assert.equal(
      await p.locator("html").getAttribute("data-furl-theme"),
      "playful",
    );
    await p.getByText("Studies", { exact: true }).click();
    for (const a of await p.locator(".furl-studies-menu a").all()) {
      const url = await a.getAttribute("href");
      const response = await p.request.get(new URL(url, p.url()).href);
      assert.equal(response.status(), 200, url);
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await settle();
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      `Whole-term, copy, extraction, targeting and theme checks passed. Screenshots: ${output}`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
