// The tool/policy cross-product, reversible deletion, and painted slot motion.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function checkTools(page, output) {
  const rows = page.locator("#row-lab"),
    refs = page.locator("#reference-lab");
  const row = (id) => rows.locator(`.edit-row[data-id="${id}"]`);
  const hole = (i) => refs.locator(`[data-hole="${i}"]`);
  const binder = (id) => refs.locator(`[data-binder="${id}-binding"]`);
  const order = () =>
    rows.locator(".edit-row").evaluateAll((ns) => ns.map((n) => n.dataset.id));
  const initial = ["n", "twice", "bonus", "total", "result"];
  const frames = (n) =>
    page.evaluate(
      (n) =>
        new Promise((resolve) => {
          const step = () =>
            --n <= 0 ? resolve() : requestAnimationFrame(step);
          requestAnimationFrame(step);
        }),
      n,
    );
  const settle = (lab) =>
    lab.evaluate((n) =>
      Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
  const center = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const policy = async (lab, p) =>
    lab.locator("[data-policy-select]").selectOption(p);
  const scroll = (lab) =>
    lab.evaluate((n) =>
      n.scrollIntoView({ block: "center", behavior: "instant" }),
    );
  const begin = async (locator) => {
    const p = await center(locator);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    return p;
  };
  const outside = async (lab) => {
    const b = await lab.locator(".program-scroll").boundingBox();
    return { x: b.x - 25, y: b.y + b.height / 2 };
  };
  const undo = async (lab) => {
    await lab.locator("[data-action=undo]").click();
    await settle(lab);
  };
  const close = (a, b, label) =>
    assert.ok(Math.abs(a - b) < 0.15, `${label}: ${a} vs ${b}`);
  await page.locator("[data-tool=rows]").click();
  assert.equal(
    await rows.locator(".structure-toggle").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await refs.locator(".structure-toggle").getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await rows.locator("[data-row-drag=slot]").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await rows.locator("[data-action=insert]").count(), 0);
  await page.locator(".tool-desk details").evaluate((n) => (n.open = true));
  await page.locator(".tool-desk").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "tool-palette-dark.png") });
  await page.locator(".tool-desk details").evaluate((n) => (n.open = false));
  await scroll(rows);

  // Freeze row tweens to inspect the original frame and an interrupted frame.
  await page.evaluate(() => {
    window.originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const a = window.originalAnimate.apply(this, args);
      if (this.matches("#row-lab .edit-row")) {
        a.pause();
        a.currentTime = 0;
      }
      return a;
    };
  });
  const pos = () =>
    rows.locator(".edit-row").evaluateAll((ns) =>
      Object.fromEntries(
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return [n.dataset.id, { x: r.x, y: r.y }];
        }),
      ),
    );
  const seek = (t) =>
    rows.evaluate(
      (n, t) =>
        n
          .querySelectorAll(".edit-row")
          .forEach((n) =>
            n.getAnimations().forEach((a) => (a.currentTime = t)),
          ),
      t,
    );
  const base = await pos();
  const p = await begin(row("bonus"));
  await page.mouse.move(p.x + 90, p.y - 22);
  assert.deepEqual(await order(), ["n", "bonus", "twice", "total", "result"]);
  let now = await pos();
  for (const id of initial) {
    close(now[id].x, base[id].x, `slot aligned ${id}`);
    close(now[id].y, base[id].y, `slot starts at painted position ${id}`);
  }
  await seek(90);
  now = await pos();
  assert.ok(now.bonus.y < base.bonus.y && now.bonus.y > base.bonus.y - 22);
  assert.ok(now.twice.y > base.twice.y && now.twice.y < base.twice.y + 22);
  const mid = now;
  await page.mouse.move(p.x - 60, p.y + 2);
  now = await pos();
  for (const id of initial) {
    close(now[id].x, base[id].x, `reversal aligned ${id}`);
    close(now[id].y, mid[id].y, `reversal continuous ${id}`);
  }
  await page.mouse.move(p.x + 120, p.y - 44);
  await seek(90);
  const release = await pos();
  await page.mouse.up();
  now = await pos();
  for (const id of initial)
    close(now[id].y, release[id].y, `slot release continuous ${id}`);
  await rows.evaluate((n) =>
    n
      .querySelectorAll(".edit-row")
      .forEach((n) => n.getAnimations().forEach((a) => a.finish())),
  );
  await page.evaluate(
    () => (Element.prototype.animate = window.originalAnimate),
  );
  await undo(rows);
  assert.deepEqual(await order(), initial);

  // Empty-row cleanup from either cell; explicit deletion does not steal the
  // native Cmd+Backspace edit chord and never removes the result row.
  for (const field of ["expression", "pattern"]) {
    await row("n").focus();
    await page.keyboard.press("Meta+Enter");
    await settle(rows);
    const draft = rows.locator(".edit-row[data-id^=draft]").last();
    await draft.locator(`.${field}`).focus();
    await page.keyboard.press("Backspace");
    assert.deepEqual(await order(), initial);
    await undo(rows);
    assert.equal(await rows.locator(".edit-row").count(), 6);
    await undo(rows);
    assert.deepEqual(await order(), initial);
  }
  await row("bonus").focus();
  await page.keyboard.press("Meta+Shift+Backspace");
  assert.deepEqual(await order(), initial);
  assert.match(
    await rows.locator(".lab-status").textContent(),
    /requires? Free edit/,
  );
  await policy(rows, "free");
  assert.equal(await refs.locator("[data-policy-select]").inputValue(), "free");
  assert.equal(
    await page.locator("[data-policy=free]").getAttribute("aria-pressed"),
    "true",
  );
  await row("bonus").focus();
  await page.keyboard.press("Control+Shift+Backspace");
  assert.deepEqual(await order(), ["n", "twice", "total", "result"]);
  assert.equal(await row("total").locator(".value").textContent(), "?");
  await undo(rows);
  assert.equal(await row("total").locator(".value").textContent(), "10");
  await row("result").focus();
  await page.keyboard.press("Meta+Shift+Backspace");
  assert.deepEqual(await order(), initial);

  // Leave the canvas, return, cancel, and finally release. No eager deletion.
  for (const style of ["slot", "float"]) {
    await rows.locator(`[data-row-drag=${style}]`).click();
    const out = await outside(rows);
    await begin(row("bonus"));
    await page.mouse.move(out.x, out.y, { steps: 4 });
    assert.equal(await row("bonus").count(), 1);
    assert.ok(
      await rows.evaluate((n) => n.classList.contains("delete-preview")),
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await order(), initial);
    await settle(rows);
    const from = await begin(row("bonus"));
    await page.mouse.move(out.x, out.y, { steps: 4 });
    await page.mouse.move(from.x, from.y, { steps: 4 });
    await page.mouse.up();
    assert.deepEqual(await order(), initial);
    assert.ok(
      !(await rows.evaluate((n) => n.classList.contains("delete-preview"))),
    );
    await settle(rows);
    await begin(row("bonus"));
    await page.mouse.move(out.x, out.y, { steps: 4 });
    await page.mouse.up();
    assert.deepEqual(await order(), ["n", "twice", "total", "result"]);
    await undo(rows);
    assert.deepEqual(await order(), initial);
  }
  await policy(rows, "refine");
  await begin(row("bonus"));
  const out = await outside(rows);
  await page.mouse.move(out.x, out.y);
  await page.mouse.up();
  assert.deepEqual(await order(), initial);

  // Shared tool primacy and policy. Refactor forbids use creation; Refine fills
  // holes but refuses overwrite, move and deletion; Free permits them all.
  await refs.locator(".structure-toggle").click();
  await scroll(refs);
  assert.equal(
    await page.locator("[data-tool=connect]").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await rows.locator(".structure-toggle").getAttribute("aria-pressed"),
    "false",
  );
  const plug = async (id, index) => {
    await binder(id).click();
    await hole(index).click();
    await settle(refs);
    await frames(16);
  };
  await policy(refs, "refactor");
  await plug("width", 0);
  assert.equal(await hole(0).textContent(), "□");
  await policy(refs, "refine");
  await plug("width", 0);
  assert.equal(await hole(0).textContent(), "width");
  await plug("height", 0);
  assert.equal(await hole(0).textContent(), "width");
  await hole(0).focus();
  await page.keyboard.press("Backspace");
  assert.equal(await hole(0).textContent(), "width");
  let unplug = await outside(refs);
  await begin(hole(0));
  await page.mouse.move(unplug.x, unplug.y, { steps: 4 });
  await page.mouse.up();
  assert.equal(await hole(0).textContent(), "width");
  await policy(refs, "free");

  await binder("height").click();
  await page.locator("[data-tool=edit]").focus();
  await page.keyboard.press("Escape");
  await hole(1).click();
  assert.equal(
    await hole(1).textContent(),
    "□",
    "Escape outside the lab cancels a keyboard pickup",
  );

  // A dragged use is a word + cable, while the binder and source slot survive
  // until release. Escape, blur and policy changes all cancel.
  const miss = await center(
    refs.locator(".reference-row").first().locator(".ref-value"),
  );
  for (const how of ["escape", "blur", "policy"]) {
    await begin(hole(0));
    await page.mouse.move(miss.x, miss.y, { steps: 3 });
    await frames(2);
    assert.equal(await hole(0).textContent(), "width");
    assert.equal(await page.locator(".reference-floating").isVisible(), true);
    assert.equal(
      await page.locator(".reference-floating").textContent(),
      "width",
    );
    assert.equal(await binder("width").textContent(), "width");
    if (how === "escape") await page.keyboard.press("Escape");
    if (how === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (how === "policy")
      await refs.locator("[data-policy-select]").evaluate((n) => {
        n.value = "refine";
        n.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await page.mouse.up();
    assert.equal(await hole(0).textContent(), "width");
    assert.equal(await page.locator(".reference-floating").isVisible(), false);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await policy(refs, "free");
  }
  // A non-target anywhere in the editor previews unplugging. Returning to the
  // original factor preserves the use; an ordinary click never disconnects it.
  await hole(0).click();
  assert.equal(await hole(0).textContent(), "width");
  await begin(hole(0));
  await page.mouse.move(miss.x, miss.y, { steps: 3 });
  assert.ok(await refs.evaluate((n) => n.classList.contains("delete-preview")));
  const home = await center(hole(0));
  await page.mouse.move(home.x, home.y, { steps: 3 });
  assert.ok(
    !(await refs.evaluate((n) => n.classList.contains("delete-preview"))),
  );
  assert.match(
    await refs.locator(".lab-status").textContent(),
    /original factor/,
  );
  await page.mouse.up();
  assert.equal(await hole(0).textContent(), "width");
  for (const limited of ["refactor", "refine"]) {
    await policy(refs, limited);
    await begin(hole(0));
    await page.mouse.move(miss.x, miss.y, { steps: 3 });
    await page.mouse.up();
    assert.equal(await hole(0).textContent(), "width");
    assert.match(
      await refs.locator(".lab-status").textContent(),
      /requires Free edit/,
    );
  }
  await policy(refs, "free");
  await begin(hole(0));
  const target = await center(hole(1));
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.mouse.up();
  await settle(refs);
  assert.equal(await hole(0).textContent(), "□");
  assert.equal(await hole(1).textContent(), "width");
  await undo(refs);
  assert.equal(await hole(0).textContent(), "width");
  assert.equal(await hole(1).textContent(), "□");
  await hole(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  assert.equal(await hole(0).textContent(), "□");
  assert.equal(await hole(1).textContent(), "width");
  await undo(refs);

  // An in-canvas non-target now unplugs and retracts exactly like an outside drop.
  await begin(hole(0));
  await page.mouse.move(miss.x, miss.y, { steps: 4 });
  await frames(2);
  await page.screenshot({
    path: path.join(output, "reference-unplug-preview.png"),
  });
  await page.mouse.up();
  assert.equal(await hole(0).textContent(), "□");
  assert.equal(await binder("width").textContent(), "width");
  const wire = refs.locator(".reference-wire");
  await frames(2);
  assert.equal(await wire.getAttribute("data-kind"), "retract");
  const d1 = await wire.locator("path").getAttribute("d");
  await frames(7);
  const d2 = await wire.locator("path").getAttribute("d");
  assert.notEqual(d1, d2);
  await page.screenshot({ path: path.join(output, "reference-retract.png") });
  await frames(78);
  assert.equal(await wire.locator("path").getAttribute("d"), null);
  await undo(refs);
  assert.equal(await hole(0).textContent(), "width");
  // Outside release still unplugs. Undo cancels its unfinished return animation.
  unplug = await outside(refs);
  await begin(hole(0));
  await page.mouse.move(unplug.x, unplug.y, { steps: 4 });
  await page.mouse.up();
  assert.equal(await hole(0).textContent(), "□");
  await undo(refs);
  assert.equal(await hole(0).textContent(), "width");
  await hole(0).focus();
  await page.keyboard.press("Backspace");
  assert.equal(await hole(0).textContent(), "□");
  // Undo while retracting cancels the old animation and restores the source.
  await undo(refs);
  assert.equal(await hole(0).textContent(), "width");
  await frames(80);
  assert.equal(await hole(0).textContent(), "width");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await hole(0).focus();
  await page.keyboard.press("Delete");
  await frames(2);
  assert.equal(await wire.locator("path").getAttribute("d"), null);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Tool changes also cancel a row preview, even when selected by keyboard.
  await rows.locator(".structure-toggle").click();
  await scroll(rows);
  await row("bonus").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.locator("[data-tool=connect]").evaluate((n) => n.click());
  assert.deepEqual(await order(), initial);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".tool-desk").scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: path.join(output, "tool-palette-mobile.png") });
  await page.setViewportSize({ width: 1200, height: 950 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.locator(".tool-desk details").evaluate((n) => (n.open = true));
  await page.locator(".tool-desk").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "tool-palette-light.png") });
  await page.emulateMedia({ colorScheme: "dark" });
};
