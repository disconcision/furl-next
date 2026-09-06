const assert = require("node:assert/strict");

// The same physical trajectory must survive a change of SVG coordinate space.
// Compare twins at identical times: one stays in viewport coordinates, the other
// switches to a program-relative landing and back to a viewport retraction.
module.exports = async function checkWireCoordinates(page) {
  const differences = await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:137px;top:263px;visibility:hidden";
    host.innerHTML =
      '<span style="position:absolute;left:10px;top:10px">width</span><span style="position:absolute;left:180px;top:75px">width</span>';
    document.body.append(host);
    const [source, target] = host.querySelectorAll("span");
    const twins = [new FurlReferenceWire(host), new FurlReferenceWire(host)];
    for (const w of twins) {
      w.motion = { matches: false };
      w.request = () => {}; // Advance both renderers using the same explicit clock.
      w.set({ source, target, style: "wire", anchor: "center", kind: "drag" });
      w.draw(100);
    }
    // Put both curves into motion before the handoff; velocities must survive too.
    target.style.top = "100px";
    twins.forEach((w) => w.draw(116));
    const painted = (w) =>
      w.path
        .getAttribute("d")
        .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)
        .map((v, i) => Number(v) + (i % 2 ? w.origin.top : w.origin.left));
    const compare = () => {
      const a = painted(twins[0]),
        b = painted(twins[1]);
      return Math.max(
        ...a.map((v, i) => Math.abs(v - b[i])),
        ...twins[0].points.flatMap((p, i) => [
          Math.abs(p.vx - twins[1].points[i].vx),
          Math.abs(p.vy - twins[1].points[i].vy),
        ]),
      );
    };
    twins[1].set({
      source,
      target,
      style: "wire",
      anchor: "center",
      kind: "landing",
    });
    const differences = [];
    for (const t of [132, 148, 164]) {
      twins.forEach((w) => w.draw(t));
      differences.push(compare());
    }
    // Page movement must not create a second impulse either.
    host.style.top = "233px";
    twins.forEach((w) => w.draw(180));
    differences.push(compare());
    const r = target.getBoundingClientRect(),
      pointer = { x: r.left, y: r.top };
    for (const w of twins) {
      w.retract(source, pointer);
      w.retraction.start = 180;
      w.draw(196);
    }
    differences.push(compare());
    twins.forEach((w) => w.clear());
    host.remove();
    return differences;
  });
  assert.ok(
    differences.every((d) => d < 1e-7),
    `wire trajectory depends on drawing space: ${differences}`,
  );
};
