/* Exercise the real pre-Hazel page, then preferences through native controls. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-loading-"));
const url = process.env.TEST_URL || "http://127.0.0.1:8877/live/";
const key = "furl.preferences.v1";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  async function page(options = {}, stored) {
    const p = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      ...options,
    });
    p.on("pageerror", (e) => errors.push(e.message));
    if (stored)
      await p.addInitScript(
        ({ key, stored }) => {
          for (const [k, v] of Object.entries(stored))
            localStorage.setItem(k === "prefs" ? key : k, v);
        },
        { key, stored },
      );
    return p;
  }
  async function loader(p) {
    // Abort only the large native bundle. All actual bootstrap/assets execute.
    await p.route("**/furl.js", (r) => r.abort());
    await p.goto(url);
    await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.locator("#furl-app").count(), 0);
    assert.equal(
      await p.getByRole("status", { name: "Loading Furl" }).count(),
      1,
    );
  }
  const at = (p, ms) =>
    p.evaluate((ms) => {
      for (const a of document
        .querySelector(".furl-loading")
        .getAnimations({ subtree: true })) {
        a.pause();
        a.currentTime = ms;
      }
      return [...document.querySelectorAll(".furl-loading-logo > span")].map(
        (n) => +getComputedStyle(n).getPropertyValue("--furl-logo-active"),
      );
    }, ms);
  try {
    for (const colorScheme of ["dark", "light"]) {
      const p = await page({ colorScheme });
      await loader(p);
      for (let i = 0; i < 12; i++) {
        const active = [0, 1, 2, 3, 2, 1][i % 6];
        assert.deepEqual(
          await at(p, i * 180 + 90),
          [0, 1, 2, 3].map((n) => +(n === active)),
        );
      }
      const rotation = [];
      for (const t of [0, 400, 800]) {
        await at(p, t);
        rotation.push(
          await p
            .locator(".furl-loading-spin")
            .evaluate((n) => getComputedStyle(n).transform),
        );
      }
      assert.equal(
        new Set(rotation).size,
        3,
        "rotation runs alongside the letter cycle",
      );
      const bounds = await p.locator(".furl-loading-spin").boundingBox();
      assert.ok(Math.abs(bounds.x + bounds.width / 2 - 640) < 1);
      assert.ok(Math.abs(bounds.y + bounds.height / 2 - 400) < 1);
      assert.ok(bounds.width < 160 && bounds.height < 160, "compact logo");
      assert.equal(
        await p.evaluate(() => getComputedStyle(document.body).backgroundColor),
        colorScheme === "dark" ? "rgb(24, 38, 48)" : "rgb(245, 248, 250)",
      );
      const letter = await p
        .locator(".furl-loading-logo > span")
        .first()
        .evaluate((n) => getComputedStyle(n).backgroundColor);
      assert.equal(
        letter,
        colorScheme === "dark" ? "rgb(66, 57, 83)" : "rgb(225, 216, 253)",
      );
      await at(p, 90);
      await p.screenshot({
        path: path.join(output, `loader-${colorScheme}.png`),
      });
      // Responsive centering and no overflow on a small viewport.
      await p.setViewportSize({ width: 390, height: 700 });
      await at(p, 90);
      const mobile = await p.locator(".furl-loading-spin").boundingBox();
      assert.ok(Math.abs(mobile.x + mobile.width / 2 - 195) < 1);
      assert.ok(Math.abs(mobile.y + mobile.height / 2 - 350) < 1);
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await p.close();
    }
    for (const settings of [
      { options: { reducedMotion: "reduce" } },
      { stored: { prefs: JSON.stringify({ motion: false }) } },
    ]) {
      const p = await page(settings.options, settings.stored);
      await loader(p);
      assert.equal(
        await p
          .locator(".furl-loading")
          .evaluate((n) => n.getAnimations({ subtree: true }).length),
        0,
      );
      await p.close();
    }
    const legacy = await page(
      { colorScheme: "dark" },
      { "furl.appearance": "playful" },
    );
    await loader(legacy);
    assert.equal(
      await legacy.locator("html").getAttribute("data-furl-theme"),
      "playful",
    );
    assert.equal(
      await legacy.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
      "rgb(232, 226, 255)",
    );
    await legacy.screenshot({ path: path.join(output, "loader-playful.png") });
    await legacy.close();

    const p = await page({ colorScheme: "dark" });
    await p.goto(url);
    await p.waitForSelector(".furl-hit");
    assert.equal(
      await p.locator(".furl-loading").count(),
      0,
      "native editor replaces loader without a timer",
    );
    for (const selector of [
      "button[data-tool=copy]",
      "button[data-policy=free]",
      "[data-variant=float]",
      "[data-option=links]",
      "[data-option=motion]",
      "[data-view=theme]",
      ".furl-toggle.comb",
      ".furl-toggle.indentation",
      ".furl-toggle.bindings",
      ".furl-toggle.expressions",
      ".furl-toggle.values",
      ".caret-option.coral",
      ".furl-match-layout-toggle",
    ])
      await p.locator(selector).click();
    const expected = {
      appearance: "playful",
      mode: "copy",
      policy: "free",
      style: "float",
      links: false,
      motion: false,
      comb: false,
      indentation: false,
      bindings: false,
      expressions: false,
      values: false,
      caret_tone: "coral",
      match_columns: false,
    };
    await p.waitForFunction(
      (key) => JSON.parse(localStorage.getItem(key)).match_columns === false,
      key,
    );
    assert.deepEqual(
      await p.evaluate((key) => JSON.parse(localStorage.getItem(key)), key),
      expected,
    );
    assert.ok(
      await p.getByRole("button", { name: "Undo", exact: true }).isDisabled(),
      "preferences do not edit the program",
    );
    assert.equal(
      await p.evaluate(
        () =>
          Object.keys(localStorage).filter((k) => k.startsWith("furl.live.v1."))
            .length,
      ),
      0,
    );
    // The loader itself must use those choices before native code gets a turn.
    await loader(p);
    assert.equal(
      await p.locator("html").getAttribute("data-furl-theme"),
      "playful",
    );
    assert.equal(
      await p
        .locator(".furl-loading")
        .evaluate((n) => n.getAnimations({ subtree: true }).length),
      0,
    );
    await p.unroute("**/furl.js");
    await p.reload();
    await p.waitForSelector("[data-view=theme]");
    for (const selector of [
      "button[data-tool=copy]",
      "button[data-policy=free]",
      "[data-variant=float]",
      "[data-view=theme]",
      ".caret-option.coral",
    ])
      assert.equal(
        await p.locator(selector).getAttribute("aria-pressed"),
        "true",
      );
    for (const selector of [
      "[data-option=links]",
      "[data-option=motion]",
      ".furl-toggle.comb",
      ".furl-toggle.indentation",
      ".furl-toggle.bindings",
      ".furl-toggle.expressions",
      ".furl-toggle.values",
      ".furl-match-layout-toggle",
    ])
      assert.equal(
        await p.locator(selector).getAttribute("aria-pressed"),
        "false",
      );
    assert.equal(
      await p.locator("#furl-app").getAttribute("data-caret"),
      "coral",
    );
    // Native visibility, rather than only stored booleans, survives reload.
    for (const selector of [
      ".furl-toggle.bindings",
      ".furl-toggle.expressions",
      ".furl-toggle.values",
      ".furl-toggle.comb",
    ])
      await p.locator(selector).click();
    await p.getByRole("combobox", { name: "Example" }).selectOption("2");
    await p.waitForSelector(".furl-match");
    assert.equal(
      await p
        .locator(".furl-match")
        .first()
        .locator(":scope > .furl-branches > .furl-branch")
        .count(),
      1,
    );
    // Genuine per-letter hover in the header, matching the simulated highlight.
    await p.evaluate(() => document.fonts.ready);
    for (let i = 0; i < 4; i++) {
      const letter = p.locator(".furl-wordmark > span").nth(i);
      await letter.hover();
      assert.equal(
        await letter.evaluate((n) =>
          getComputedStyle(n).getPropertyValue("--furl-logo-active").trim(),
        ),
        "1",
      );
      assert.match(
        await letter.evaluate((n) => getComputedStyle(n).boxShadow),
        /6px/,
      );
    }
    await p.screenshot({ path: path.join(output, "header-hover.png") });
    await p.locator("[data-view=theme]").click(); // Switching back must override migrated appearance too.
    await p.reload();
    await p.waitForSelector("[data-view=theme]");
    assert.equal(
      await p.locator("html").getAttribute("data-furl-theme"),
      "plain",
    );
    await p.close();

    // Corrupt/blocked preference storage cannot prevent boot or changing controls.
    for (const stored of [
      "{broken",
      JSON.stringify({
        mode: "invalid",
        motion: "false",
        comb: null,
        caret_tone: "yellow",
      }),
    ]) {
      const p = await page({}, { prefs: stored });
      await loader(p);
      assert.equal(await p.evaluate(() => FurlPreferences.read().mode), "edit");
      assert.equal(await p.evaluate(() => FurlPreferences.read().motion), true);
      await p.close();
    }
    const blocked = await page();
    await blocked.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("Storage disabled");
        },
      }),
    );
    await blocked.goto(url);
    await blocked.waitForSelector(".furl-hit");
    await blocked.locator("[data-view=theme]").click();
    await blocked.locator(".furl-toggle.indentation").click();
    await blocked.waitForFunction(
      () =>
        document
          .querySelector(".furl-toggle.indentation")
          .getAttribute("aria-pressed") === "false",
    );
    assert.equal(
      await blocked.locator("html").getAttribute("data-furl-theme"),
      "playful",
    );
    assert.equal(
      await blocked
        .locator(".furl-toggle.indentation")
        .getAttribute("aria-pressed"),
      "false",
    );
    await blocked.close();
    assert.deepEqual(errors, []);
    console.log(
      "Passed loader cycle, rotation, colors, mobile, reduced motion, preboot preferences, native reload, hover, and storage fallbacks.",
    );
    console.log(output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
