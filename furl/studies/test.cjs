const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-studies-"));
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await b.newPage({
        viewport: { width: 1280, height: 1000 },
        colorScheme: "dark",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.stack));
    const base = process.env.STUDY_URL || "http://127.0.0.1:8877/";
    await p.goto(base + "offside.html");
    const rows = () => p.locator(".program-row"),
      cards = () => p.locator(".stash-card");
    await p
      .locator("[data-source=row]")
      .first()
      .dragTo(p.locator("#stash .empty-rail"));
    assert.equal(await rows().count(), 2);
    assert.equal(await cards().count(), 3);
    await cards().last().click();
    await p.locator("#main-patch").click({ position: { x: 10, y: 6 } });
    assert.equal(await rows().count(), 3);
    assert.equal(await cards().count(), 2);
    await p.locator("[data-source=palette]").first().click();
    await p.locator("[data-drop=expression]").first().click();
    assert.equal(
      await p.locator("[data-drop=expression]").first().textContent(),
      "□ + □",
    );
    assert.equal(await p.locator("[data-source=palette]").count(), 7);
    await p.locator("#undo").click();
    assert.equal(
      await p.locator("[data-drop=expression]").first().textContent(),
      "4",
    );
    await p.locator("[data-drop=expression]").first().dblclick();
    await p.locator(".program-row input").fill("8");
    await p.locator(".program-row input").press("Enter");
    assert.equal(
      await p.locator("[data-drop=expression]").first().textContent(),
      "8",
    );
    for (const layout of ["rail", "shelf", "patches"]) {
      await p.locator(`button[data-layout=${layout}]`).click();
      await p.screenshot({
        path: path.join(output, `offside-${layout}.png`),
        fullPage: true,
      });
    }
    await p.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: path.join(output, "offside-mobile.png"),
      fullPage: true,
    });
    await p.setViewportSize({ width: 1280, height: 1000 });
    await p.goto(base + "appearance.html");
    await p.locator("[data-names=symbols]").click();
    const initial = await p.locator("#alias-program .alias").allTextContents();
    for (let i = 0; i < 26; i++) await p.locator("#add-name").click();
    const names = await p.locator("#alias-program .alias").allTextContents();
    assert.deepEqual(names.slice(0, 3), initial);
    assert.equal(new Set(names).size, names.length);
    await p.locator("#reset-names").click();
    for (const usage of ["ink", "underline", "dot", "tick"]) {
      await p
        .locator(`[data-usage=${usage}]`)
        .filter({ hasNot: p.locator("div") })
        .first()
        .click();
      assert.equal(
        await p.locator("#usage-lab").getAttribute("data-usage"),
        usage,
      );
    }
    await p.locator("[data-look=playful]").click();
    await p.screenshot({
      path: path.join(output, "appearance.png"),
      fullPage: true,
    });
    await p.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: path.join(output, "appearance-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log("Study interactions passed; " + output);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
