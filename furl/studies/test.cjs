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
    const cards = () => p.locator(".stash-card"),
      rows = () => p.locator(".program-row"),
      area = () =>
        rows()
          .filter({ has: p.locator(".name", { hasText: "area" }) })
          .locator(".program-expression");
    await p.locator("[data-tool=copy]").click();
    await cards()
      .filter({ hasText: /^□ \+ □$/ })
      .click();
    await area().locator(".term-handle").filter({ hasText: "*" }).click();
    assert.equal(await area().textContent(), "□ + □");
    assert.equal(await cards().count(), 16);
    await cards()
      .filter({ hasText: /^□ \* □$/ })
      .click();
    await area().locator(".term-hole").first().click();
    assert.equal(
      await area().textContent(),
      "(□ * □) + □",
      "nested hole accepts a compound template",
    );
    await p.locator("#undo").click();
    assert.equal(await area().textContent(), "□ + □");
    await p.locator("[data-tool=move]").click();
    await p
      .locator("[data-source=row]")
      .first()
      .dragTo(p.locator("#stash"), { targetPosition: { x: 18, y: 30 } });
    assert.equal(await rows().count(), 2);
    assert.equal(await cards().count(), 17);
    await cards()
      .filter({ hasText: /^width/ })
      .click();
    await p.locator(".row-return-target").click();
    assert.equal(await rows().count(), 3);
    assert.equal(await cards().count(), 16);
    const first = await cards().first().textContent();
    await cards().first().click();
    await p.locator("#stash").focus();
    for (let i = 0; i < 3; i++) await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    assert.notEqual(
      await cards().first().textContent(),
      first,
      "rail accepts an insertion slot between cards",
    );
    assert.equal(
      await p
        .locator(
          ".stash-card input,.stash-card [data-source],.stash-card button",
        )
        .count(),
      0,
      "parked interiors are inert",
    );
    await p.locator("#stash").hover();
    await p.mouse.wheel(0, 420);
    await p.waitForTimeout(250);
    assert.ok((await p.locator("#stash").evaluate((n) => n.scrollTop)) > 100);
    const scroll = await p.locator("#stash").evaluate((n) => n.scrollTop);
    await p.locator("#rail-toggle").click();
    await p.waitForTimeout(300);
    assert.equal(await p.locator("#stash").evaluate((n) => n.inert), true);
    await p.locator("#rail-toggle").click();
    await p.waitForTimeout(300);
    assert.equal(
      await p.locator("#stash").evaluate((n) => n.scrollTop),
      scroll,
    );
    const alignment = await cards()
      .first()
      .evaluate((n) => {
        const c = getComputedStyle(n, "::before"),
          r = n.getBoundingClientRect(),
          s = n.closest(".stash").getBoundingClientRect();
        return Math.abs(
          r.left +
            1 +
            parseFloat(c.left) +
            parseFloat(c.width) / 2 -
            (s.left + 18),
        );
      });
    assert.ok(alignment < 1, "rail dots centered on line");
    await p.locator("#reset").click();
    await p.screenshot({
      path: path.join(output, "offside-rail.png"),
      fullPage: true,
    });
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
    assert.equal(await p.locator("#emoji-circles").isChecked(), true);
    for (const color of ["cream", "mint", "slate", "rose", "lilac"]) {
      await p.locator("#emoji-color").selectOption(color);
      assert.equal(
        await p.locator("body").getAttribute("data-emoji-color"),
        color,
      );
    }
    await p.locator("#emoji-circles").uncheck();
    assert.equal(
      await p
        .locator(".emoji-badge")
        .first()
        .evaluate((n) => getComputedStyle(n).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    await p.locator("#emoji-circles").check();
    for (const usage of ["ink", "underline", "dot", "simple"]) {
      await p.locator(`button[data-usage=${usage}]`).click();
      assert.equal(
        await p.locator("#usage-lab").getAttribute("data-usage"),
        usage,
      );
    }
    assert.equal(await p.locator("[data-usage=tick]").count(), 0);
    assert.equal(
      await p
        .locator('.name[data-count="1"]')
        .evaluate((n) => getComputedStyle(n).textDecorationLine),
      "none",
    );
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
    console.log("Study revisions passed; " + output);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
