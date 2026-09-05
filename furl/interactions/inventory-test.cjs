// Coverage is per platform; grouping/filtering must not turn a proposal into a feature.
const assert = require("node:assert/strict");
const path = require("node:path");
const { stages, actions } = require("./inventory.json");

module.exports = async function inventoryChecks(page, output) {
  const baseURL = page.url().split("#")[0];
  const stageIDs = stages.map((s) => s.id);
  const groups = page.locator("#inventory .inventory-stage");
  const rows = page.locator("#inventory [data-action-id]");
  const search = page.locator("#inventory-search");
  const stage = page.locator("#inventory-stage");
  const origin = page.locator("#inventory-origin");
  const clear = () => page.locator("[data-clear-inventory]").click();
  const shownIDs = () =>
    rows.evaluateAll((ns) =>
      ns.filter((n) => !n.hidden).map((n) => n.dataset.actionId),
    );
  const count = async (n) =>
    assert.equal(
      await page.locator("#inventory-count").textContent(),
      `${n} of ${actions.length} actions`,
    );
  const noOverflow = async () =>
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Only the table should scroll horizontally",
    );

  assert.deepEqual(
    await groups.evaluateAll((ns) => ns.map((n) => n.dataset.stage)),
    stageIDs,
  );
  assert.deepEqual(
    await groups.evaluateAll((ns) => ns.map((n) => n.open)),
    stages.map((s) => s.open),
  );
  assert.equal(await rows.count(), actions.length);
  await count(actions.length);
  for (const group of stages) {
    const expected = actions.filter((a) => a.stage === group.id);
    assert.deepEqual(
      await page
        .locator(`#inventory-${group.id} [data-action-id]`)
        .evaluateAll((ns) => ns.map((n) => n.dataset.actionId)),
      expected.map((a) => a.id),
    );
    assert.equal(
      await page.locator(`#inventory-${group.id} .stage-count`).textContent(),
      `${expected.length} actions`,
    );
  }
  const coverage = await rows.evaluateAll((ns) =>
    ns.map((n) => ({
      id: n.dataset.actionId,
      states: Array.from(
        n.querySelectorAll(".coverage-state"),
        (el) => el.textContent,
      ),
      platforms: Array.from(
        n.querySelectorAll(".coverage-platform"),
        (el) => el.textContent,
      ),
    })),
  );
  for (const actual of coverage) {
    const action = actions.find((a) => a.id === actual.id);
    assert.deepEqual(actual.platforms, ["Study", "Hazel-backed Furl"]);
    assert.equal(actual.states[0].startsWith("✓"), action.study === "working");
    assert.equal(actual.states[1].startsWith("✓"), action.hazel === "working");
    if (action.study === "working" && action.hazel === "todo")
      assert.match(actual.states[1], /Awaiting port/);
    if (action.study === "storyboard")
      assert.match(actual.states[0], /Before\/after only/);
  }
  // Every local example anchor resolves; live editor links remain separate.
  assert.deepEqual(
    await rows
      .locator('a[href^="#"]')
      .evaluateAll((links) =>
        links
          .filter((a) => !document.getElementById(a.hash.slice(1)))
          .map((a) => a.hash),
      ),
    [],
  );

  await page
    .locator("#inventory")
    .evaluate((n) => n.scrollIntoView({ block: "start" }));
  await noOverflow();
  await page.screenshot({
    path: path.join(output, "inventory-overview-dark.png"),
  });
  await page
    .locator("#inventory-working")
    .evaluate((n) => n.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: path.join(output, "inventory-implemented-dark.png"),
  });

  // Stage, source, and text filters intersect and open only matching groups.
  await stage.selectOption("reshape");
  await count(actions.filter((a) => a.stage === "reshape").length);
  assert.deepEqual(
    await groups.evaluateAll((ns) =>
      ns.filter((n) => !n.hidden).map((n) => n.dataset.stage),
    ),
    ["reshape"],
  );
  assert.equal(
    await page.locator("#inventory-reshape").getAttribute("open"),
    "",
  );
  await origin.selectOption("Big Book");
  await search.fill("branch");
  const expected = await rows.evaluateAll((ns) =>
    ns
      .filter(
        (n) =>
          n.dataset.stage === "reshape" &&
          n.dataset.origin === "Big Book" &&
          n.textContent.toLowerCase().includes("branch"),
      )
      .map((n) => n.dataset.actionId),
  );
  assert.ok(expected.length > 0);
  assert.deepEqual(await shownIDs(), expected);
  await count(expected.length);
  await search.fill("no-such-operation");
  await count(0);
  assert.equal(await page.locator("#inventory-empty").isVisible(), true);
  assert.equal(
    await groups.evaluateAll((ns) => ns.filter((n) => !n.hidden).length),
    0,
  );
  await clear();
  await count(actions.length);
  assert.equal(await page.locator("#inventory-empty").isVisible(), false);

  // Collapsed source evidence is searchable, including exact historical file references.
  const evidence = actions.find((a) => a.id === "R1").source;
  await search.fill(evidence);
  assert.ok((await shownIDs()).includes("R1"));
  await clear();

  // An action deep link opens its stage and clears filters hiding its target.
  await search.fill("no-such-operation");
  await page.evaluate(() => {
    location.hash = "action-H2";
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#inventory-later").open &&
      !document.querySelector("#inventory-later").hidden,
  );
  assert.equal(await search.inputValue(), "");
  assert.equal(await page.locator("#action-H2").isVisible(), true);
  await count(actions.length);

  // Direct navigation must also reveal a closed-by-default stage on initial load.
  await page.goto(`${baseURL}#action-S2`);
  assert.equal(await page.locator("#action-S2").isVisible(), true);
  // Storyboard links choose the intended example; they do not execute a transformation.
  await page.locator('#action-S2 [data-story="resize"]').click();
  assert.equal(await page.locator("#story-choice").inputValue(), "resize");
  assert.equal(new URL(page.url()).hash, "#transformations");
  await stage.selectOption("working");
  await page.locator('[data-stage-link="next"]').click();
  assert.equal(await stage.inputValue(), "");
  assert.equal(await page.locator("#inventory-next").getAttribute("open"), "");
  await page.screenshot({ path: path.join(output, "inventory-next-dark.png") });

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${baseURL}#inventory-working`);
  await noOverflow();
  await page.screenshot({
    path: path.join(output, "inventory-implemented-light.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}#inventory`);
  await noOverflow();
  await page.screenshot({ path: path.join(output, "inventory-mobile.png") });
  await page.locator('[data-stage-link="later"]').click();
  await noOverflow();
  assert.equal(await page.locator("#inventory-later").getAttribute("open"), "");
  const table = page.locator("#inventory-later .table-scroll");
  assert.ok(await table.evaluate((n) => n.scrollWidth > n.clientWidth));
  await table.evaluate((n) => {
    n.scrollLeft = n.scrollWidth;
  });
  await page.screenshot({
    path: path.join(output, "inventory-mobile-table.png"),
  });
  await page.setViewportSize({ width: 1200, height: 950 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(baseURL);
  console.log(
    "Inventory coverage, stages, filters, links and responsive layout passed.",
  );
};
