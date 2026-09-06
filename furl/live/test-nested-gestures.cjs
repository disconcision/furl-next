// Native projection cases absent from the small standalone labs.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.stack));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8876/live/");
    const settle = () => p.waitForTimeout(240);
    await settle();
    const tool = (k) => p.locator(`.furl-gesture-tools [data-tool=${k}]`);
    const scope = () => p.locator(".furl-program-content > .furl-scope");
    const rows = () => scope().locator(":scope > .furl-binding");
    const names = () =>
      rows().evaluateAll((ns) =>
        ns.map((n) =>
          n
            .querySelector(
              `.furl-row[data-binding-row="${n.dataset.binding}"] .furl-pattern .code`,
            )
            .textContent.trim(),
        ),
      );
    const value = () =>
      p.locator(".furl-row").last().locator(".furl-value").innerText();
    const undo = async () => {
      await p.getByRole("button", { name: "Undo", exact: true }).click();
      await settle();
    };
    async function program(text) {
      await tool("edit").click();
      await p
        .getByRole("button", { name: "Toggle whole-program Hazel source" })
        .click();
      await settle();
      await p.locator("#active-code-editor").click();
      await settle();
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
    await program("let f = fun x -> x + 1 in let a = 2 in f(a)");
    assert.equal(await value(), "3");
    await tool("rows").click();
    // A function definition moves as one subtree, and keeps its visible name focused.
    await rows().first().focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    await settle();
    assert.deepEqual(await names(), ["a", "f"]);
    assert.equal(await value(), "3");
    assert.equal(
      await p.evaluate(
        () =>
          document.activeElement.querySelector(
            `.furl-row[data-binding-row="${document.activeElement.dataset.binding}"] .furl-pattern .code`,
          )?.textContent,
      ),
      "f",
    );
    await undo();
    // An empty function body has a boundary before its terminal expression.
    const functionBody = await p
      .locator(".furl-function")
      .getAttribute("data-body");
    await p.locator(`.furl-gap[data-scope="${functionBody}"]`).click();
    await settle();
    assert.equal(await rows().count(), 2);
    assert.equal(await p.locator(".furl-function .furl-binding").count(), 1);
    assert.ok(
      await p.evaluate(
        () => !!document.activeElement.closest(".furl-function"),
      ),
    );
    await p.keyboard.press("Backspace");
    await settle();
    assert.equal(await p.locator(".furl-function .furl-binding").count(), 0);
    await undo();
    await undo();
    // Insertion from parameter editing has that same lexical owner.
    await p.locator(".furl-parameter .code-editor").dblclick();
    await settle();
    await p.keyboard.press("Meta+Enter");
    await settle();
    assert.equal(await p.locator(".furl-function .furl-binding").count(), 1);
    await undo();
    // Float keeps the original grab offset, and Escape/blur do not commit previews.
    await p.locator(".furl-gesture-tools [data-variant=float]").click();
    const a = await rows().nth(1).boundingBox(),
      saved = await p.evaluate(() => localStorage.getItem("furl.live.v1.0"));
    await p.mouse.move(a.x + 40, a.y + 10);
    await p.mouse.down();
    await p.mouse.move(a.x + 100, a.y - 20, { steps: 6 });
    await settle();
    const floated = await rows().nth(1).boundingBox();
    assert.ok(Math.abs(floated.x - a.x - 60) < 2, "float retains grab x");
    assert.ok(Math.abs(floated.y - a.y + 30) < 2, "float retains grab y");
    await p.keyboard.press("Escape");
    await p.mouse.up();
    await settle();
    assert.deepEqual(await names(), ["f", "a"]);
    assert.equal(
      await p.evaluate(() => localStorage.getItem("furl.live.v1.0")),
      saved,
    );
    await rows().nth(1).focus();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowUp");
    await p.evaluate(() => window.dispatchEvent(new Event("blur")));
    await settle();
    assert.deepEqual(await names(), ["f", "a"]);
    assert.equal(await p.locator("[data-picked=true]").count(), 0);
    // Match arm boundaries never edit a sibling arm or the enclosing binding list.
    await program("let answer = case 7 | 0 => 1 | n => n + 1 end in answer");
    await p
      .getByRole("button", { name: "Show all match branches as columns" })
      .click();
    await tool("rows").click();
    await settle();
    const arm = await p
      .locator(".furl-branch")
      .nth(1)
      .getAttribute("data-body");
    await p.locator(`.furl-gap[data-scope="${arm}"]`).click();
    await settle();
    assert.equal(await rows().count(), 1);
    assert.equal(
      await p.locator(".furl-branch").first().locator(".furl-binding").count(),
      0,
    );
    assert.equal(
      await p.locator(".furl-branch").nth(1).locator(".furl-binding").count(),
      1,
    );
    await undo();
    assert.equal(await value(), "8");
    // Scope and expected type govern targets even in the live pointer UI.
    await program('let text = "hello" in let n = 3 in ¿ + n');
    await tool("connect").click();
    await p.locator(".furl-hit[data-kind=binder][data-name=text]").click();
    await p.locator(".furl-hit[data-kind=hole]").click();
    await settle();
    assert.equal(await p.locator(".furl-hit[data-kind=hole]").count(), 1);
    assert.match(
      await p.locator(".furl-gesture-status").textContent(),
      /expected type/,
    );
    // Turning a projection control during a picked wire cancels without modifying source.
    await p.locator(".furl-hit[data-kind=binder][data-name=n]").click();
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Expressions", exact: true }).click();
    await settle();
    await p.getByRole("button", { name: "Expressions", exact: true }).click();
    await settle();
    assert.equal(await p.locator(".furl-hit[data-kind=hole]").count(), 1);
    assert.deepEqual(errors, []);
    console.log(
      "PASS nested gestures: composite function movement/focus, function and match-arm insertion, Float grab geometry, Escape/blur cancellation, native type refusal and projection stability.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
