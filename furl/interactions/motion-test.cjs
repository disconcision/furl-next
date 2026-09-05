// Exercise painted positions, not just the final DOM order. Freeze new row
// tweens at their first frame and seek them to inspect insertion and retargeting.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function checkRowMotion(page, output) {
  const lab = page.locator("#row-lab");
  await lab.evaluate((n) =>
    n.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await lab.locator(".structure-toggle").click();
  await lab.locator("[data-row-drag=float]").click();
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const a = animate.apply(this, args);
      if (this.matches("#row-lab .edit-row")) {
        a.pause();
        a.currentTime = 0;
      }
      return a;
    };
  });
  const positions = () =>
    lab.locator(".edit-row").evaluateAll((ns) =>
      Object.fromEntries(
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return [n.dataset.id, { x: r.left, y: r.top, width: r.width }];
        }),
      ),
    );
  const seek = (fraction) =>
    lab.evaluate((root, f) => {
      root.querySelectorAll(".edit-row").forEach((n) =>
        n.getAnimations().forEach((a) => {
          a.currentTime = a.effect.getTiming().duration * f;
        }),
      );
    }, fraction);
  const settle = () =>
    lab.evaluate((root) =>
      root
        .querySelectorAll(".edit-row")
        .forEach((n) => n.getAnimations().forEach((a) => a.finish())),
    );
  const click = (selector) => lab.locator(selector).evaluate((n) => n.click());
  const insert = (slot) => click(`.gap[data-slot="${slot}"]`);
  const undo = async () => {
    await click("[data-action=undo]");
    await settle();
  };
  const close = (a, b, label) =>
    assert.ok(Math.abs(a - b) < 0.1, `${label}: ${a} vs ${b}`);
  const samePosition = (a, b, label) => {
    close(a.x, b.x, `${label} x`);
    close(a.y, b.y, `${label} y`);
  };
  const frame = async (name) =>
    page.screenshot({
      path: path.join(output, `${name}.png`),
      clip: await lab.boundingBox(),
    });
  const order = () =>
    lab.locator(".edit-row").evaluateAll((ns) => ns.map((n) => n.dataset.id));
  const status = () => lab.locator(".lab-status").textContent();
  const rowTarget = (id) => lab.locator(`[data-id="${id}"]`);

  // Insertion leaves preceding rows absolutely still. Following rows start at
  // their old positions, then move monotonically down exactly one grid row.
  const before = await positions();
  await insert(2);
  const start = await positions();
  for (const id of Object.keys(before))
    samePosition(start[id], before[id], `insert start ${id}`);
  await frame("insert-0");
  let last = start;
  for (const t of [0.25, 0.5, 0.75, 1]) {
    await seek(t);
    const current = await positions();
    for (const id of ["n", "twice"])
      samePosition(current[id], before[id], `insert ${t} ${id}`);
    for (const id of ["bonus", "total", "result"]) {
      close(current[id].x, before[id].x, `insert x ${id}`);
      assert.ok(
        current[id].y >= last[id].y - 0.1,
        `insert must not bounce: ${id}`,
      );
      assert.ok(
        current[id].y <= before[id].y + 22.1,
        `insert must not overshoot: ${id}`,
      );
      if (t === 1) close(current[id].y, before[id].y + 22, `insert end ${id}`);
    }
    if (t === 0.5 || t === 1) await frame(`insert-${t}`);
    last = current;
  }
  await undo();

  // The actual row (all three columns) follows both pointer axes from the
  // original grab offset, while siblings animate into its current vacant slot.
  const base = await positions(),
    h = await rowTarget("bonus").boundingBox();
  const x = h.x + 11,
    y = h.y + 11;
  await page.evaluate(() => {
    window.pickedRow = document.querySelector('#row-lab [data-id="bonus"]');
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y - 16);
  let current = await positions();
  samePosition(
    current.bonus,
    { x: base.bonus.x + 12, y: base.bonus.y - 16 },
    "drag follows pointer",
  );
  close(current.bonus.width, base.bonus.width, "drag keeps full width");
  assert.equal(
    await page.evaluate(
      () => window.pickedRow === document.querySelector("#row-lab .dragging"),
    ),
    true,
  );
  assert.equal(await lab.locator(".dragging .expression").inputValue(), "4");
  assert.equal(await lab.locator(".dragging .value").textContent(), "4");
  assert.equal(await page.locator(".drag-ghost").count(), 0);
  samePosition(current.twice, base.twice, "neighbor starts in place");
  await seek(0.5);
  current = await positions();
  assert.ok(
    current.twice.y > base.twice.y && current.twice.y < base.twice.y + 22,
  );
  samePosition(
    current.bonus,
    { x: base.bonus.x + 12, y: base.bonus.y - 16 },
    "drag has no tween lag",
  );
  await frame("drag-first-slot");

  // Reverse before the neighbors finish: retarget from the painted position,
  // not the abandoned destination or an intermediate DOM arrangement.
  const reversing = current;
  await page.mouse.move(x - 6, y + 3);
  current = await positions();
  samePosition(current.twice, reversing.twice, "reverse continuity");
  samePosition(
    current.bonus,
    { x: base.bonus.x - 6, y: base.bonus.y + 3 },
    "reverse pointer",
  );
  await seek(0.5);
  const reversed = await positions();
  assert.ok(
    reversed.twice.y < current.twice.y && reversed.twice.y > base.twice.y,
  );
  await page.mouse.move(x + 20, y - 38);
  current = await positions();
  samePosition(current.n, reversed.n, "second retarget n");
  samePosition(current.twice, reversed.twice, "second retarget twice");
  samePosition(
    current.bonus,
    { x: base.bonus.x + 20, y: base.bonus.y - 38 },
    "second pointer target",
  );
  assert.deepEqual(await order(), ["bonus", "n", "twice", "total", "result"]);
  await seek(0.5);
  await frame("drag-second-slot");

  // Dropping starts the settling animation exactly at the last pointer frame.
  const release = await positions();
  await page.mouse.up();
  const drop = await positions();
  for (const id of Object.keys(drop))
    samePosition(drop[id], release[id], `drop continuity ${id}`);
  await seek(0.5);
  await frame("drop-half");
  await settle();
  current = await positions();
  for (const [i, id] of (await order()).entries()) {
    samePosition(
      current[id],
      { x: base.n.x, y: base.n.y + i * 22 },
      `settled ${id}`,
    );
  }
  assert.equal(await lab.locator(".dragging").count(), 0);
  await undo();
  assert.deepEqual(await order(), ["n", "twice", "bonus", "total", "result"]);

  // A refused move still tracks the pointer and returns smoothly on release.
  const blockedBase = await positions(),
    bh = await rowTarget("twice").boundingBox();
  await page.mouse.move(bh.x + 11, bh.y + 11);
  await page.mouse.down();
  await page.mouse.move(bh.x + 19, bh.y - 5);
  assert.match(await status(), /Blocked.*n is not bound/);
  const blocked = await positions();
  samePosition(
    blocked.twice,
    { x: blockedBase.twice.x + 8, y: blockedBase.twice.y - 16 },
    "blocked pointer",
  );
  await page.mouse.up();
  samePosition((await positions()).twice, blocked.twice, "refusal continuity");
  await settle();
  for (const id of Object.keys(blockedBase))
    samePosition((await positions())[id], blockedBase[id], `refused ${id}`);
  assert.equal(await lab.locator("[data-action=undo]").isDisabled(), true);

  // Draft holes neither bind nor reference names. Cross several in Refactor
  // mode, but continue refusing a real dependency break with those drafts present.
  for (const slot of [1, 2, 3]) {
    await insert(slot);
    await settle();
  }
  const drafts = await order();
  await rowTarget("bonus").focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("ArrowUp");
    assert.doesNotMatch(await status(), /Blocked/);
  }
  await page.keyboard.press("Enter");
  assert.deepEqual(await order(), [
    "n",
    "bonus",
    ...drafts.slice(1, 4),
    "twice",
    "total",
    "result",
  ]);
  assert.doesNotMatch(await status(), /Free edit|Blocked/);
  assert.equal(
    await lab.locator('[data-id="total"] .value').textContent(),
    "10",
  );
  await settle();
  await frame("refactor-across-drafts");
  await undo();
  assert.deepEqual(await order(), drafts);
  await rowTarget("twice").focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowUp");
  assert.match(await status(), /Blocked.*n is not bound/);
  await page.keyboard.press("Enter");
  assert.deepEqual(await order(), drafts);
};
