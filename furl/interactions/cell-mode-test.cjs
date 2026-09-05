const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function checkCellMode(page, output) {
  const lab = page.locator("#row-lab");
  const row = (id) => lab.locator(`.edit-row[data-id="${id}"]`);
  const cell = (id, part) => row(id).locator(`.${part}`);
  const order = () =>
    lab.locator(".edit-row").evaluateAll((ns) => ns.map((n) => n.dataset.id));
  const initial = ["n", "twice", "bonus", "total", "result"];
  const settle = () =>
    lab.evaluate((n) =>
      Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
  const focused = (locator) =>
    locator.evaluate((n) => n === document.activeElement);
  const locked = (locator) =>
    locator.evaluate((n) => n.classList.contains("cell-locked"));
  const undo = async () => {
    await lab.locator("[data-action=undo]").click();
    await settle();
  };
  const toggle = () => lab.locator(".structure-toggle").click();
  await lab.evaluate((n) =>
    n.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  assert.equal(await lab.locator(".row-handle").count(), 0);
  const left = (await row("n").boundingBox()).x;
  const inset = await lab
    .locator(".row-program")
    .evaluate((n) => parseFloat(getComputedStyle(n).paddingLeft));
  assert.ok(inset < 24, "only the comb's narrow space remains");

  // Ordinary mode still enters a cell on one click.
  await cell("n", "expression").click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.insertText("7");
  assert.equal(await cell("twice", "value").textContent(), "14");
  await undo();
  await cell("bonus", "value").click();
  assert.equal(await focused(cell("bonus", "value")), true);
  await toggle();
  assert.equal(
    (await row("n").boundingBox()).x,
    left,
    "mode change has no layout cost",
  );

  // Every column, including value-column whitespace, moves its entire row.
  for (const [part, offset] of [
    ["pattern", 10],
    ["expression", 10],
    ["value", 25],
    ["value", 180],
  ]) {
    const target = cell("bonus", part);
    await target.click({ position: { x: offset, y: 11 } });
    assert.equal(
      await focused(row("bonus")),
      true,
      `single ${part} click selects the row`,
    );
    assert.equal(await locked(target), true);
    assert.deepEqual(await order(), initial);
    assert.equal(await lab.locator("[data-action=undo]").isDisabled(), true);
    const b = await target.boundingBox();
    await page.mouse.move(b.x + offset, b.y + 11);
    await page.mouse.down();
    await page.mouse.move(b.x + offset, b.y - 11, { steps: 5 });
    await page.mouse.up();
    await settle();
    assert.deepEqual(await order(), ["n", "bonus", "twice", "total", "result"]);
    assert.equal(await cell("bonus", "expression").inputValue(), "4");
    await undo();
  }

  // Double-click activates exactly one cell without picking up or moving a row.
  await cell("bonus", "expression").dblclick();
  assert.equal(await focused(cell("bonus", "expression")), true);
  assert.equal(
    await cell("bonus", "expression").evaluate((n) => n.readOnly),
    false,
  );
  assert.equal(
    await cell("bonus", "pattern").evaluate((n) => n.readOnly),
    true,
  );
  assert.equal(await lab.locator('[data-picked="true"]').count(), 0);
  await page.keyboard.insertText("12 + 34");
  assert.equal(await cell("bonus", "value").textContent(), "46");
  const edit = await cell("bonus", "expression").boundingBox();
  await page.mouse.move(edit.x + 2, edit.y + 11);
  await page.mouse.down();
  await page.mouse.move(edit.x + 55, edit.y + 11, { steps: 6 });
  await page.mouse.up();
  assert.equal(
    await cell("bonus", "expression").evaluate(
      (n) => n.selectionEnd > n.selectionStart,
    ),
    true,
  );
  assert.deepEqual(
    await order(),
    initial,
    "text selection must not drag a row",
  );
  await page.keyboard.press("Escape");
  assert.equal(await focused(row("bonus")), true);
  assert.equal(
    await cell("bonus", "expression").evaluate((n) => n.readOnly),
    true,
  );
  await cell("bonus", "pattern").dblclick();
  assert.equal(await focused(cell("bonus", "pattern")), true);
  assert.equal(
    await cell("bonus", "pattern").evaluate((n) => n.readOnly),
    false,
  );
  await page.keyboard.press("Escape");

  // Read-only values share the same activation rule for selection/copying.
  await cell("bonus", "value").click();
  assert.equal(await focused(row("bonus")), true);
  assert.equal(await page.evaluate(() => getSelection().toString()), "");
  await cell("bonus", "value").dblclick();
  assert.equal(await focused(cell("bonus", "value")), true);
  assert.equal(await page.evaluate(() => getSelection().toString()), "46");
  assert.equal(await locked(cell("bonus", "value")), false);
  await page.screenshot({
    path: path.join(output, "structure-value-active.png"),
    clip: await lab.boundingBox(),
  });
  await page.keyboard.press("Escape");
  assert.equal(await locked(cell("bonus", "value")), true);
  assert.equal(await page.evaluate(() => getSelection().toString()), "");

  // The terminal expression remains editable, but its derived result row cannot move.
  const result = await cell("result", "expression").boundingBox();
  await page.mouse.move(result.x + 10, result.y + 11);
  await page.mouse.down();
  await page.mouse.move(result.x + 10, result.y - 33, { steps: 5 });
  await page.mouse.up();
  assert.deepEqual(await order(), initial);
  await cell("result", "expression").dblclick();
  assert.equal(
    await cell("result", "expression").evaluate((n) => n.readOnly),
    false,
  );
  await page.keyboard.press("Escape");

  // Keyboard focus is an equivalent to double-click, without adding a side handle.
  await row("n").focus();
  await page.keyboard.press("Tab");
  assert.equal(await focused(cell("n", "pattern")), true);
  assert.equal(await cell("n", "pattern").evaluate((n) => n.readOnly), false);
  await page.keyboard.press("Tab");
  assert.equal(await focused(cell("n", "expression")), true);
  assert.equal(await cell("n", "pattern").evaluate((n) => n.readOnly), true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("F2");
  assert.equal(await focused(cell("n", "expression")), true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  assert.equal(await focused(cell("n", "expression")), true);
  await toggle();
  await cell("bonus", "expression").click();
  assert.equal(await focused(cell("bonus", "expression")), true);
  assert.equal(
    await cell("bonus", "expression").evaluate((n) => n.readOnly),
    false,
  );
  await page.keyboard.down("Alt");
  assert.equal(await focused(cell("bonus", "expression")), true);
  assert.equal(
    await cell("bonus", "expression").evaluate((n) => n.readOnly),
    false,
    "holding Option preserves an already active text editor",
  );
  await page.keyboard.up("Alt");
};
