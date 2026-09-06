const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "furl-row-resistance-"));
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      colorScheme: "dark",
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8876/live/");
    await p.locator(".reference-wire").waitFor({ state: "attached" });
    await p.getByRole("combobox", { name: "Example" }).selectOption("4");
    const settle = () => p.waitForTimeout(400);
    await settle();
    const tool = (k) => p.locator(`.furl-gesture-tools [data-tool=${k}]`);
    const policy = (k) => p.locator(`.furl-gesture-tools [data-policy=${k}]`);
    const members = () =>
      p.locator(".furl-program-content > .furl-scope > .furl-binding");
    const status = p.locator(".furl-gesture-status");
    const order = () =>
      members().evaluateAll((ns) =>
        ns.map((n) =>
          n.querySelector(".furl-pattern .code").textContent.trim(),
        ),
      );
    const geometry = () =>
      p.locator(".furl-inspector,.furl-help").evaluateAll((ns) =>
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      );
    const boxes = () =>
      members().evaluateAll((ns) =>
        ns.map((n) => n.getBoundingClientRect().toJSON()),
      );
    const pick = async (index) => {
      const box = await members().nth(index).boundingBox();
      const grab = { x: box.x + box.width - 30, y: box.y + 11 };
      await p.mouse.move(grab.x, grab.y);
      await p.mouse.down();
      return { box, grab };
    };
    const assertUnchanged = async () => {
      assert.deepEqual(await order(), ["n", "twice", "bonus", "total"]);
      assert.equal(
        await p.locator(".furl-row").last().locator(".furl-value").innerText(),
        "10",
      );
      assert.ok(
        await p.getByRole("button", { name: "Undo", exact: true }).isDisabled(),
      );
    };
    await tool("move").click();
    await p.screenshot({ path: path.join(output, "before.png") });
    for (const mode of ["refactor", "refine"]) {
      await policy(mode).click();
      const footer = await geometry(),
        start = await boxes();
      const { box, grab } = await pick(1);
      await p.mouse.move(grab.x, grab.y - 22);
      await settle();
      assert.match(await status.textContent(), /reference binding|scope/i);
      const pull = box.y - (await members().nth(1).boundingBox()).y;
      assert.ok(pull > 2 && pull < 8.9, `bounded resisted pull: ${pull}`);
      assert.ok(
        await members()
          .nth(1)
          .evaluate((n) => n.hasAttribute("data-row-blocked")),
      );
      assert.deepEqual(
        await geometry(),
        footer,
        "message cannot move or resize the inspector/help",
      );
      assert.ok(await p.locator(".furl-cursor-details").isHidden());
      assert.ok(await p.locator(".furl-problem-totals").isVisible());
      for (const i of [0, 2, 3])
        assert.ok(
          Math.abs((await members().nth(i).boundingBox()).y - start[i].top) <
            0.1,
        );
      await assertUnchanged();
      if (mode === "refine")
        await p.screenshot({ path: path.join(output, "blocked.png") });
      // Further effort gives a little more travel, but never an illegal slot.
      await p.mouse.move(grab.x, grab.y - 38);
      await settle();
      const further = box.y - (await members().nth(1).boundingBox()).y;
      assert.ok(further > pull && further < 8.9);
      // Freeze the actual release animation: it must start at the painted pull
      // and finish at the unchanged source slot, without a first-frame jump.
      await p.evaluate(() => {
        window.savedAnimate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          const a = window.savedAnimate.apply(this, args);
          if (this.matches(".furl-binding")) {
            a.pause();
            a.currentTime = 0;
          }
          return a;
        };
      });
      await p.mouse.up();
      assert.ok(
        Math.abs(box.y - (await members().nth(1).boundingBox()).y - further) <
          0.2,
      );
      await p.evaluate(() => {
        Element.prototype.animate = window.savedAnimate;
        document.getAnimations().forEach((a) => a.finish());
      });
      await settle();
      assert.ok(
        Math.abs((await members().nth(1).boundingBox()).y - box.y) < 0.1,
      );
      assert.ok(
        await status.isVisible(),
        "briefly retain refusal after release",
      );
      await p.waitForFunction(
        () => document.querySelector(".furl-gesture-status").hidden,
      );
      assert.ok(await p.locator(".furl-cursor-details").isVisible());
      assert.deepEqual(await geometry(), footer);
      await assertUnchanged();
    }
    await policy("free").click();
    for (const [index, amount, reason] of [
      [0, -18, "Start"],
      [3, 22, "End"],
    ]) {
      const { box, grab } = await pick(index);
      await p.mouse.move(grab.x, grab.y + amount);
      await settle();
      assert.match(await status.textContent(), new RegExp(reason));
      const displacement = (await members().nth(index).boundingBox()).y - box.y;
      assert.ok(
        Math.sign(displacement) === Math.sign(amount) &&
          Math.abs(displacement) > 2 &&
          Math.abs(displacement) < 8.9,
      );
      await p.mouse.up();
      await settle();
      assert.ok(
        Math.abs((await members().nth(index).boundingBox()).y - box.y) < 0.1,
      );
      await assertUnchanged();
    }
    // Return to a permitted candidate within the same pickup: resistance and
    // its explanation disappear and the native move can commit normally.
    await policy("refactor").click();
    const { grab } = await pick(1);
    await p.mouse.move(grab.x, grab.y - 22);
    await settle();
    await p.mouse.move(grab.x, grab.y + 22);
    await settle();
    assert.equal(await status.textContent(), "");
    assert.ok(
      !(await members()
        .nth(1)
        .evaluate((n) => n.hasAttribute("data-row-blocked"))),
    );
    await p.mouse.up();
    await settle();
    assert.deepEqual(await order(), ["n", "bonus", "twice", "total"]);
    await p.getByRole("button", { name: "Undo", exact: true }).click();
    await settle();
    // Keyboard refusals nudge once and return without requiring a key release.
    await members().nth(1).focus();
    const keyboardStart = await members().nth(1).boundingBox();
    await p.keyboard.press("Space");
    await p.keyboard.press("ArrowUp");
    await p.waitForTimeout(95);
    assert.ok((await members().nth(1).boundingBox()).y < keyboardStart.y - 0.5);
    await settle();
    assert.ok(
      Math.abs((await members().nth(1).boundingBox()).y - keyboardStart.y) <
        0.3,
    );
    assert.match(await status.textContent(), /reference binding|scope/i);
    await p.keyboard.press("Escape");
    // Reduced motion keeps feedback text, with no elastic displacement.
    await p.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await pick(1);
    await p.mouse.move(reduced.grab.x, reduced.grab.y - 22);
    await settle();
    assert.ok(
      Math.abs((await members().nth(1).boundingBox()).y - reduced.box.y) < 0.1,
    );
    assert.ok(await status.isVisible());
    await p.mouse.up();
    // Zen's temporary message floats independently; the program never moves.
    await p.keyboard.press("F9");
    await settle();
    const zenBox = await p.locator(".furl-program").boundingBox();
    const zen = await pick(1);
    await p.mouse.move(zen.grab.x, zen.grab.y - 22);
    await settle();
    assert.ok(await status.isVisible());
    assert.deepEqual(await p.locator(".furl-program").boundingBox(), zenBox);
    await p.screenshot({ path: path.join(output, "zen-blocked.png") });
    await p.mouse.up();
    await p.waitForFunction(
      () => document.querySelector(".furl-gesture-status").hidden,
    );
    assert.ok(await p.locator(".furl-inspector").isHidden());
    assert.deepEqual(errors, []);
    console.log(
      "PASS row resistance: checked refusals, bounded pull, continuous release, unchanged source/history, fixed footer/expiry, both ends, valid recovery, keyboard, reduced motion and Zen.",
    );
    console.log(output);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
