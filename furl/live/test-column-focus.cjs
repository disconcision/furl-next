const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      colorScheme: "dark",
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8877/live/");
    await p.locator(".reference-wire").waitFor({ state: "attached" });
    const settle = () => p.waitForTimeout(250);
    const rows = () =>
      p.locator(".furl-program-content > .furl-scope > .furl-binding");
    const undo = async () => {
      await p.getByRole("button", { name: "Undo", exact: true }).click();
      await settle();
    };
    const focus = () =>
      p.evaluate(() => {
        const e = document.activeElement,
          c = e.closest(".furl-native-cell"),
          caret = e.querySelector("#caret");
        return c &&
          e.id === "active-code-editor" &&
          caret &&
          getComputedStyle(caret).visibility === "visible"
          ? {
              column: c.closest(".furl-pattern") ? "pattern" : "expression",
              cell: c.dataset.cell,
              row: c.closest(".furl-binding")?.dataset.binding,
            }
          : null;
      });
    const assertCell = async (n, column) =>
      assert.deepEqual(await focus(), {
        column,
        cell: await n
          .locator(`.furl-${column} .furl-native-cell`)
          .getAttribute("data-cell"),
        row: await n.getAttribute("data-binding"),
      });
    for (const mode of ["edit", "move"]) {
      for (const column of ["pattern", "expression"]) {
        await p.getByRole("combobox", { name: "Example" }).selectOption("4");
        await settle();
        await p.locator(`.furl-gesture-tools [data-tool=${mode}]`).click();
        await p.locator(".furl-gesture-tools [data-policy=free]").click();
        const editor = rows().nth(1).locator(`.furl-${column} .code-editor`);
        if (mode === "move")
          await rows().nth(1).locator(`.furl-${column}`).dblclick();
        else await editor.click();
        await settle();
        await assertCell(rows().nth(1), column);
        await p.keyboard.press("Meta+Enter");
        await settle();
        assert.equal(await rows().count(), 5);
        await assertCell(rows().nth(2), column);
        // Blank-row deletion returns to the same attribute of the prior row.
        await p.keyboard.press("Backspace");
        await settle();
        assert.equal(await rows().count(), 4);
        await assertCell(rows().nth(1), column);
        // Cmd-Shift-Enter inserts above; column behavior is identical.
        await p.keyboard.press("Meta+Shift+Enter");
        await settle();
        await assertCell(rows().nth(1), column);
        await p.keyboard.press("Backspace");
        await settle();
        await assertCell(rows().first(), column);
        // Deleting the first row falls forward within that column.
        await p.keyboard.press("Meta+Shift+Backspace");
        await settle();
        assert.equal(await rows().count(), 3);
        await assertCell(rows().first(), column);
        await undo();
        // Move back to the second row and delete populated content.
        const second = rows().nth(1).locator(`.furl-${column} .code-editor`);
        if (mode === "move")
          await rows().nth(1).locator(`.furl-${column}`).dblclick();
        else await second.click();
        await p.keyboard.press("Meta+Shift+Backspace");
        await settle();
        await assertCell(rows().first(), column);
        await undo();
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS column focus: pattern/expression insertion above and below, blank/populated deletion, first-row fallback, and editable caret in Edit and Rows modes.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
