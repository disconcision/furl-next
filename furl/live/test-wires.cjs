const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-wire-landing-"));

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      colorScheme: "dark",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(process.env.TEST_URL || "http://127.0.0.1:8876/live/");
    await page.waitForSelector(".reference-wire");
    await require("../interactions/wire-physics-test.cjs")(page);
    await page.getByRole("combobox", { name: "Example" }).selectOption("5");
    await page.locator("button[data-tool=connect]").click();
    const binder = (name) =>
      page.locator(`.furl-hit[data-kind=binder][data-name=${name}]`);
    const use = (name) =>
      page.locator(`.furl-hit[data-kind=reference][data-name=${name}]`);
    const holes = () => page.locator(".furl-hit[data-kind=hole]");
    const svg = page.locator(".reference-wire");
    const point = async (locator) => {
      const r = await locator.boundingBox();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const move = (p) => page.mouse.move(p.x, p.y);
    const start = async (name) => {
      await move(await point(binder(name)));
      await page.mouse.down();
      const t = await point(holes().first());
      await page.mouse.move(t.x + 110, t.y + 60);
      await page.waitForTimeout(65);
      await move(t);
      await page.waitForTimeout(20);
    };
    const recordDrop = async () => {
      await page.evaluate(() => {
        window.landingFrames = [];
        window.addEventListener(
          "pointerup",
          () => {
            const started = performance.now();
            function sample() {
              const svg = document.querySelector(".reference-wire"),
                r = svg.getBoundingClientRect();
              const d = svg.querySelector("path").getAttribute("d");
              const p = d?.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
              window.landingFrames.push({
                ms: performance.now() - started,
                kind: svg.dataset.kind,
                visible: getComputedStyle(svg).display !== "none" && !!d,
                // Compare painted control points, not numbers in different SVG coordinate systems.
                points: p?.map((v, i) => v + (i % 2 ? r.top : r.left)),
              });
              if (performance.now() - started < 550)
                requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          },
          { once: true, capture: true },
        );
      });
      await page.mouse.up();
    };
    await start("width");
    await recordDrop();
    await page.waitForTimeout(70);
    await page.screenshot({
      path: path.join(output, "attachment-settling.png"),
    });
    await page.waitForTimeout(550);
    const frames = await page.evaluate(() => window.landingFrames);
    fs.writeFileSync(
      path.join(output, "attachment-frames.json"),
      JSON.stringify(frames, null, 2),
    );
    assert.ok(frames.length >= 4);
    assert.ok(
      frames.every((f) => f.visible),
      "cable stays painted on every attachment frame without pointer movement",
    );
    assert.ok(
      frames.some((f) => f.kind === "landing"),
      "attachment has a settling phase",
    );
    assert.equal(
      frames.at(-1).kind,
      "hover",
      "hover resumes at the stationary pointer",
    );
    assert.equal(await use("width").count(), 1);
    const a = await point(binder("width")),
      b = await point(use("width"));
    const end = frames.at(-1).points;
    for (const [actual, expected] of [
      [end[0], a.x],
      [end[1], a.y],
      [end[6], b.x],
      [end[7], b.y],
    ])
      assert.ok(
        Math.abs(actual - expected) < 1,
        "settled endpoints attach to word centers",
      );
    // Attachment retains interior motion rather than clearing to a static curve.
    assert.ok(
      frames.some(
        (f) =>
          f.points &&
          Math.hypot(f.points[2] - end[2], f.points[3] - end[3]) > 1,
      ),
    );
    await page.screenshot({ path: path.join(output, "attachment-hover.png") });

    // Returning a use to itself is also a landing, without changing source/history.
    await move(await point(use("width")));
    await page.mouse.down();
    await page.mouse.move(b.x + 65, b.y + 30);
    await move(b);
    await recordDrop();
    await page.waitForTimeout(650);
    assert.ok(
      (await page.evaluate(() => window.landingFrames)).every((f) => f.visible),
    );
    assert.equal(await svg.getAttribute("data-kind"), "hover");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForTimeout(250);
    assert.equal(
      await holes().count(),
      2,
      "returning to the same use adds no undo entry",
    );

    // Hover may be disabled, but attachment still provides brief visible feedback.
    await page.locator("button[data-option=links]").click();
    await start("height");
    await recordDrop();
    await page.waitForTimeout(650);
    const hiddenFrames = await page.evaluate(() => window.landingFrames);
    assert.ok(hiddenFrames.some((f) => f.kind === "landing" && f.visible));
    assert.equal(
      hiddenFrames.at(-1).visible,
      false,
      "landing honors disabled hover after settling",
    );

    // Reduced motion keeps the connection continuous without introducing a spring tween.
    await page.locator("button[data-option=links]").click();
    await page.keyboard.press("F9");
    await page.waitForTimeout(250);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await start("width");
    await recordDrop();
    await page.waitForTimeout(650);
    assert.ok(
      (await page.evaluate(() => window.landingFrames)).every((f) => f.visible),
    );
    assert.equal(await holes().count(), 0);
    assert.equal(
      await page.locator(".furl-row").last().locator(".furl-value").innerText(),
      "24",
    );
    await page.screenshot({ path: path.join(output, "attachment-zen.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS live cable attachment: continuous painted frames, settling, stationary hover, same-use return, disabled hover, reduced motion, native evaluation.",
    );
    console.log("Screenshots:", output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
