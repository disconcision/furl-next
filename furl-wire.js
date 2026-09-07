// Shared connection renderer for the interaction study and native Furl. Endpoints are
// measured from text, never from the width of a button or editor cell.
class FurlReferenceWire {
  constructor(program) {
    this.program = program;
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("reference-wire");
    this.svg.setAttribute("aria-hidden", "true");
    this.path = document.createElementNS(this.svg.namespaceURI, "path");
    this.tip = document.createElementNS(this.svg.namespaceURI, "circle");
    this.tip.setAttribute("r", "2.3");
    this.svg.append(this.path, this.tip);
    program.prepend(this.svg);
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.motion.addEventListener("change", () => {
      this.points = null;
      this.request();
    });
    this.connection = null;
    this.frame = 0;
    this.points = null;
  }
  set(connection) {
    this.retraction = null;
    const sameSource =
      this.connection?.source === connection?.source &&
      this.connection?.style === connection?.style &&
      this.connection?.anchor === connection?.anchor;
    this.connection = connection;
    if (!sameSource) this.points = null;
    this.changedAt = performance.now();
    this.request();
  }
  request() {
    if (!this.frame) this.frame = requestAnimationFrame((t) => this.draw(t));
  }
  clear() {
    this.retraction = null;
    this.connection = null;
    this.points = null;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = null;
    this.origin = null;
    this.svg.style.display = "none";
    this.path.removeAttribute("d");
  }
  get retracting() {
    return !!this.retraction;
  }
  retract(source, pointer) {
    if (this.motion.matches) {
      this.clear();
      return;
    }
    this.connection = {
      source,
      pointer,
      style: "wire",
      anchor: "center",
      kind: "retract",
    };
    this.retraction = { start: performance.now(), pointer };
    this.changedAt = performance.now();
    this.request();
  }
  anchor(node, origin, first) {
    const text = node.querySelector(".ref-token") || node;
    const range = document.createRange();
    range.selectNodeContents(text);
    if (first && text.firstChild?.nodeType === Node.TEXT_NODE)
      range.setEnd(text.firstChild, Math.min(1, text.firstChild.length));
    const r = range.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - origin.left,
      y: r.top + r.height / 2 - origin.top,
    };
  }
  draw(time) {
    this.frame = 0;
    const c = this.connection;
    if (!c || !c.source.isConnected) {
      this.clear();
      return;
    }
    // Fixed during a gesture, so the cable can leave the editor's scroll box.
    // It stays in the program's stacking context, behind its text.
    const fixed = c.kind === "drag" || c.kind === "retract";
    const origin = fixed
      ? { left: 0, top: 0 }
      : this.program.getBoundingClientRect();
    // Drag/retraction use viewport coordinates; landing/hover use local ones.
    // Retain the painted curve and its velocity when changing coordinate space.
    // Otherwise the program's page offset is mistaken for spring displacement.
    if (this.points && this.origin) {
      for (const p of this.points) {
        p.x += this.origin.left - origin.left;
        p.y += this.origin.top - origin.top;
      }
    }
    this.origin = { left: origin.left, top: origin.top };
    const a = this.anchor(c.source, origin, c.anchor === "first");
    let b = c.target?.isConnected
      ? this.anchor(c.target, origin, c.anchor === "first")
      : c.pointer
        ? { x: c.pointer.x - origin.left, y: c.pointer.y - origin.top }
        : a;
    if (this.retraction) {
      const elapsed = (time - this.retraction.start) / 1000;
      if (elapsed >= 1.1 || this.motion.matches) {
        this.clear();
        return;
      }
      // Underdamped spring, starting at rest: it overshoots the binding once
      // and settles. The curve's control masses retain their existing motion.
      const rest =
        Math.exp(-8 * elapsed) *
        (Math.cos(16 * elapsed) + 0.5 * Math.sin(16 * elapsed));
      b = { x: a.x + (b.x - a.x) * rest, y: a.y + (b.y - a.y) * rest };
      this.svg.style.opacity = String(
        Math.max(0, Math.min(1, (1.1 - elapsed) / 0.3)),
      );
    } else this.svg.style.opacity = "";
    this.svg.style.display = "block";
    this.svg.dataset.kind = c.kind;
    this.svg.dataset.style = c.style;
    this.tip.style.display = fixed ? "" : "none";
    this.tip.setAttribute("cx", b.x);
    this.tip.setAttribute("cy", b.y);
    let moving = false;
    if (c.style === "wire") {
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const sag = Math.min(32, distance * 0.14);
      const targets = [1 / 3, 2 / 3].map((f) => ({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f + sag,
      }));
      if (!this.points || this.motion.matches)
        this.points = targets.map((p) => ({ ...p, vx: 0, vy: 0 }));
      // Two damped spring masses control a cubic curve. The endpoints remain
      // exact; only its interior lags and swings. Bounded substeps avoid a kick
      // after an idle/background frame, and stationary wires stop requesting RAF.
      const dt = Math.min((time - (this.lastTime || time - 16)) / 1000, 1 / 30);
      const steps = Math.max(1, Math.ceil(dt * 120)),
        h = dt / steps;
      for (let step = 0; step < steps && !this.motion.matches; step++) {
        this.points.forEach((p, i) => {
          const target = targets[i];
          for (const axis of ["x", "y"]) {
            const v = `v${axis}`;
            p[v] += (220 * (target[axis] - p[axis]) - 18 * p[v]) * h;
            p[axis] += p[v] * h;
            p[axis] = Math.max(
              target[axis] - 90,
              Math.min(target[axis] + 90, p[axis]),
            );
          }
        });
      }
      moving =
        !this.motion.matches &&
        this.points.some(
          (p, i) =>
            Math.hypot(p.x - targets[i].x, p.y - targets[i].y) > 0.08 ||
            Math.hypot(p.vx, p.vy) > 0.4,
        );
      if (!moving || time - this.changedAt > 1800) {
        this.points = targets.map((p) => ({ ...p, vx: 0, vy: 0 }));
        moving = false;
      }
      const [p, q] = this.points;
      this.path.setAttribute(
        "d",
        `M ${a.x} ${a.y} C ${p.x} ${p.y} ${q.x} ${q.y} ${b.x} ${b.y}`,
      );
    } else {
      this.points = null;
      this.path.setAttribute("d", `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
    this.lastTime = time;
    // A newly filled hole changes width briefly. Follow its actual text while
    // it opens, in either style; do not leave the endpoint at an obsolete slot.
    const resizing = !!c.target?.getAnimations({ subtree: true }).length;
    if (moving || resizing || this.retraction) this.request();
  }
}
