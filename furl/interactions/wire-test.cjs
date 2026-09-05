const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function checkReferenceWires(page, output) {
  const lab = page.locator("#reference-lab"),
    program = lab.locator(".reference-program");
  const binder = (id) => lab.locator(`[data-binder="${id}-binding"]`);
  const hole = (i) => lab.locator(`[data-hole="${i}"]`);
  const svg = lab.locator(".reference-wire"),
    edge = svg.locator("path");
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
  const d = () => edge.getAttribute("d");
  const coords = async () =>
    (await d()).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
  const close = (a, b, label) =>
    assert.ok(Math.abs(a - b) < 0.6, `${label}: ${a} vs ${b}`);
  const anchor = (locator, first = false) =>
    locator.evaluate((n, first) => {
      const word = n.querySelector(".ref-token"),
        range = document.createRange();
      range.selectNodeContents(word);
      if (first) range.setEnd(word.firstChild, 1);
      const r = range.getBoundingClientRect(),
        p = n.closest(".reference-program").getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - p.left,
        y: r.top + r.height / 2 - p.top,
      };
    }, first);
  const endpoints = async (source, target, first = false) => {
    const p = await coords(),
      a = await anchor(source, first),
      b = await anchor(target, first);
    close(p[0], a.x, "binding x");
    close(p[1], a.y, "binding y");
    close(p.at(-2), b.x, "reference x");
    close(p.at(-1), b.y, "reference y");
  };
  const screenshot = async (name) =>
    page.screenshot({
      path: path.join(output, `${name}.png`),
      clip: await lab.boundingBox(),
    });
  const start = async (id) => {
    const b = await binder(id).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + 11);
    await page.mouse.down();
    return b;
  };
  const aim = async (i) => {
    const h = await hole(i).boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + 11, { steps: 5 });
    await frames(2);
  };
  await lab.evaluate((n) =>
    n.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  assert.equal(await svg.count(), 1);
  assert.equal(
    await svg.evaluate((n) => getComputedStyle(n).pointerEvents),
    "none",
  );
  assert.equal(
    await svg.evaluate(
      (n) =>
        Number(getComputedStyle(n).zIndex) <
        Number(
          getComputedStyle(n.parentElement.querySelector(".reference-row"))
            .zIndex,
        ),
    ),
    true,
  );
  await lab.locator(".structure-toggle").click();
  const source = await start("width"),
    origin = await program.boundingBox();
  const point = { x: source.x + 180, y: source.y + 25 };
  await page.mouse.move(point.x, point.y);
  await frames(2);
  assert.match(await d(), / L /);
  let p = await coords();
  close(p.at(-2), point.x - origin.x, "free endpoint x");
  close(p.at(-1), point.y - origin.y, "free endpoint y");
  assert.equal(await page.locator(".drag-ghost").count(), 0);
  assert.equal(await binder("width").textContent(), "width");
  await screenshot("reference-line-drag");
  await aim(0);
  await endpoints(binder("width"), hole(0));
  const oldWidth = (await hole(0).boundingBox()).width,
    secondX = (await hole(1).boundingBox()).x;
  await page.mouse.up();
  // Inspect the actual width tween: the following factor must slide across as
  // the new word opens, without a one-frame layout jump at insertion.
  await hole(0).evaluate((n) =>
    n.getAnimations({ subtree: true }).forEach((a) => {
      a.pause();
      a.currentTime = 0;
    }),
  );
  close(
    (await hole(0).boundingBox()).width,
    oldWidth,
    "insertion starts at hole width",
  );
  close(
    (await hole(1).boundingBox()).x,
    secondX,
    "following factor starts in place",
  );
  await hole(0).evaluate((n) =>
    n.getAnimations({ subtree: true }).forEach((a) => (a.currentTime = 90)),
  );
  assert.ok((await hole(0).boundingBox()).width > oldWidth);
  await screenshot("reference-opening");
  await hole(0).evaluate((n) =>
    n.getAnimations({ subtree: true }).forEach((a) => a.finish()),
  );
  await frames(18);
  assert.equal(await hole(0).getAttribute("data-reference"), "width-binding");
  await hole(0).hover();
  await frames(2);
  assert.equal(await svg.getAttribute("data-kind"), "hover");
  await endpoints(binder("width"), hole(0));
  await lab.locator("[data-hover-links]").uncheck();
  await hole(0).hover();
  await frames(2);
  assert.equal(await d(), null);
  await lab.locator("[data-hover-links]").check();
  await lab.locator("[data-wire-anchor]").selectOption("first");
  await hole(0).hover();
  await frames(2);
  await endpoints(binder("width"), hole(0), true);
  await lab.locator("[data-wire-anchor]").selectOption("center");
  await lab.locator("[data-wire-style=wire]").click();
  await hole(0).hover();
  await frames(2);
  assert.match(await d(), / C /);
  assert.ok(
    (await edge.evaluate((n) => Number(getComputedStyle(n).strokeOpacity))) <
      0.5,
  );
  await screenshot("reference-wire-hover-dark");

  // The endpoint stays exact while the wire's interior has momentum, then
  // settles to a stable bend after the pointer stops. Reverse it once mid-swing.
  const b = await start("height");
  const aPoint = { x: b.x + 130, y: b.y + 12 },
    bPoint = { x: b.x + 260, y: b.y + 2 };
  await page.mouse.move(aPoint.x, aPoint.y);
  await frames(2);
  await page.mouse.move(bPoint.x, bPoint.y);
  await frames(1);
  const moving = await coords(),
    local = await program.boundingBox();
  close(moving.at(-2), bPoint.x - local.x, "wire endpoint x");
  close(moving.at(-1), bPoint.y - local.y, "wire endpoint y");
  await frames(7);
  const after = await coords();
  assert.ok(
    Math.hypot(after[2] - moving[2], after[3] - moving[3]) > 1,
    "interior keeps moving with stationary pointer",
  );
  await page.mouse.move(aPoint.x, aPoint.y);
  await frames(2);
  p = await coords();
  close(p.at(-2), aPoint.x - local.x, "reversed endpoint x");
  await screenshot("reference-wire-drag");
  await frames(125);
  const settled = await d();
  await frames(8);
  assert.equal(await d(), settled, "wire stops moving when settled");
  await aim(1);
  await page.mouse.up();
  await frames(18);
  assert.equal(await hole(1).textContent(), "height");
  assert.equal(
    await lab
      .locator(".reference-row")
      .last()
      .locator(".ref-value")
      .textContent(),
    "24",
  );
  await endpoints(binder("height"), hole(1));
  await lab.locator("[data-action=undo]").click();
  assert.equal(await hole(1).textContent(), "□");

  // Hover works in ordinary mode, including on mobile layouts after scrolling.
  await lab.locator(".structure-toggle").click();
  await hole(0).hover();
  await frames(2);
  assert.match(await d(), / C /);
  await endpoints(binder("width"), hole(0));
  await page.emulateMedia({ colorScheme: "light" });
  await screenshot("reference-wire-hover-light");
  await page.setViewportSize({ width: 390, height: 844 });
  await hole(0).hover();
  await frames(2);
  await endpoints(binder("width"), hole(0));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await screenshot("reference-wire-mobile");
  await page.setViewportSize({ width: 1200, height: 950 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await lab.locator(".structure-toggle").click();
  const reducedSource = await start("height");
  await page.mouse.move(reducedSource.x + 180, reducedSource.y + 8);
  await frames(2);
  const still = await d();
  await frames(8);
  assert.equal(await d(), still);
  await aim(1);
  await page.mouse.up();
  assert.equal(
    await hole(1).evaluate((n) => n.getAnimations({ subtree: true }).length),
    0,
  );
  await frames(2);

  // Esc, an invalid release, and a lost window never place a reference.
  await lab.locator("[data-action=undo]").click();
  await start("height");
  await page.mouse.move(source.x + 220, source.y + 15);
  await frames(2);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await hole(1).textContent(), "□");
  await start("height");
  await page.mouse.move(source.x + 220, source.y + 15);
  await page.mouse.up();
  assert.equal(await hole(1).textContent(), "□");
  await start("height");
  await aim(1);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.equal(await hole(1).textContent(), "□");
  assert.equal(await d(), null);
  await page.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
};
