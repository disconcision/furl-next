// Click-to-pick has a matching click-away cancel, independent of edit policy.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function checkConnectionCancel(page, output) {
  const lab = page.locator("#reference-lab");
  const binder = (id) => lab.locator(`[data-binder="${id}-binding"]`);
  const hole = (i) => lab.locator(`[data-hole="${i}"]`);
  const wire = lab.locator(".reference-wire"),
    edge = wire.locator("path");
  const blank = lab.locator(".reference-row").first().locator(".ref-value");
  const frames = (n) =>
    page.evaluate(
      (n) =>
        new Promise((resolve) => {
          const tick = () =>
            --n <= 0 ? resolve() : requestAnimationFrame(tick);
          requestAnimationFrame(tick);
        }),
      n,
    );
  const center = async (n) => {
    const b = await n.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const unchanged = async () => {
    assert.equal(await hole(0).textContent(), "□");
    assert.equal(await hole(1).textContent(), "□");
    assert.equal(await binder("width").textContent(), "width");
    assert.equal(await lab.locator("[data-action=undo]").isDisabled(), true);
    assert.equal(await lab.locator(".ref-name.picked").count(), 0);
  };
  await lab.locator(".structure-toggle").click();
  for (const policy of ["refactor", "refine", "free"]) {
    await lab.locator("[data-policy-select]").selectOption(policy);
    await binder("width").click();
    const point = await center(blank);
    await page.mouse.move(point.x, point.y);
    await frames(2);
    assert.equal(
      await wire.getAttribute("data-kind"),
      "drag",
      "the first click picks up rather than cancels",
    );
    await page.mouse.click(point.x, point.y);
    await frames(2);
    assert.equal(await wire.getAttribute("data-kind"), "retract");
    await unchanged();
    const before = await edge.getAttribute("d");
    await frames(6);
    assert.notEqual(await edge.getAttribute("d"), before);
    if (policy === "free")
      await page.screenshot({
        path: path.join(output, "connection-click-away-retract.png"),
      });
    await frames(78);
    assert.equal(
      await edge.getAttribute("d"),
      null,
      "canceling cable settles and disappears",
    );
    await page.mouse.move(point.x + 20, point.y + 5);
    await frames(2);
    assert.equal(
      await edge.getAttribute("d"),
      null,
      "a canceled pickup no longer follows the pointer",
    );
  }
  // The cancel click is consumed before source or unrelated action handlers.
  for (const target of [
    binder("width"),
    binder("height"),
    lab.locator("[data-action=reset]"),
    page.locator("#references h2"),
  ]) {
    await binder("width").click();
    await blank.hover();
    await target.click();
    await frames(2);
    assert.equal(await wire.getAttribute("data-kind"), "retract");
    await unchanged();
  }
  // Keyboard pickup can also be discontinued with a pointer click.
  await binder("width").focus();
  await page.keyboard.press("Enter");
  await blank.click();
  await frames(2);
  assert.equal(await wire.getAttribute("data-kind"), "retract");
  await unchanged();
  // A mouse drag started from a binder retracts on a missed release as well.
  const start = await center(binder("width")),
    end = await center(blank);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  await frames(2);
  assert.equal(await wire.getAttribute("data-kind"), "retract");
  await unchanged();
  // A proper target still completes the connection, with exactly one undo.
  await binder("width").click();
  await hole(0).click();
  assert.equal(await hole(0).textContent(), "width");
  assert.equal(await hole(1).textContent(), "□");
  await lab.evaluate((n) =>
    Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
  // Click-away cancels a keyboard-carried existing use; drag-away deletion is
  // a separate gesture covered by tool-test. Cancellation must never erase it.
  await hole(0).focus();
  await page.keyboard.press("Space");
  await blank.hover();
  assert.equal(
    await lab.evaluate((n) => n.classList.contains("delete-preview")),
    false,
  );
  assert.match(
    await lab.locator(".lab-status").textContent(),
    /cancel the pickup/,
  );
  await blank.click();
  await frames(2);
  assert.equal(await hole(0).textContent(), "width");
  assert.equal(await wire.getAttribute("data-kind"), "retract");
  await lab.locator("[data-action=undo]").click();
  await unchanged();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await binder("height").click();
  await blank.click();
  await frames(2);
  assert.equal(await edge.getAttribute("d"), null);
  await unchanged();
  await page.emulateMedia({ reducedMotion: "no-preference" });
};
