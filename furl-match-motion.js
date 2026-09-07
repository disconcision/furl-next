/* Match layout is view state. Preview actual native branches on their shared
   grid; cancellation restores the starting view without touching source/Undo. */
window.createFurlMatchMotion = (root, motionEnabled) => {
  const ac = new AbortController(),
    opts = { capture: true, signal: ac.signal };
  let pending = null,
    state = null,
    bypass = false,
    swallow = false,
    frame = 0;
  const toggle = () => root.querySelector(".furl-match-layout-toggle");
  const columns = () => toggle()?.getAttribute("aria-pressed") === "true";
  const matches = () => [...root.querySelectorAll(".furl-match")];
  const nativeToggle = () => {
    bypass = true;
    toggle()?.click();
    bypass = false;
  };
  const reduced = () =>
    !motionEnabled() || matchMedia("(prefers-reduced-motion: reduce)").matches;
  function clean() {
    cancelAnimationFrame(frame);
    frame = 0;
    root.querySelectorAll("[data-match-moving]").forEach((n) => {
      n.style.removeProperty("transform");
      n.style.removeProperty("opacity");
      n.style.removeProperty("z-index");
      delete n.dataset.matchMoving;
    });
    root.querySelectorAll("[data-match-bridge-moving]").forEach((n) => {
      n.style.removeProperty("clip-path");
      delete n.dataset.matchBridgeMoving;
    });
    delete root.dataset.matchMotion;
  }
  function paint() {
    if (!state) return;
    for (const m of matches()) {
      if (state.key && m.dataset.match !== state.key) continue;
      const branches = [
        ...m.querySelectorAll(":scope > .furl-branches > .furl-branch"),
      ];
      if (branches.length < 2) continue;
      const origin = branches[0].offsetLeft,
        chosen = +m.dataset.selectedBranch || 0;
      for (const n of branches) {
        n.dataset.matchMoving = "true";
        n.style.transform = `translateX(${-(n.offsetLeft - origin) * (1 - state.progress)}px)`;
        n.style.opacity = String(
          +n.dataset.branch === chosen ? 1 : Math.min(1, state.progress * 2),
        );
        n.style.zIndex = +n.dataset.branch === chosen ? "2" : "1";
      }
      const bridge = m.querySelector(
        ":scope > .furl-branches > .furl-match-bridge",
      );
      if (bridge) {
        bridge.dataset.matchBridgeMoving = "true";
        bridge.style.clipPath = `inset(-12px ${Math.max(0, (1 - state.progress) * 100 - 1)}% -12px -12px)`;
      }
    }
  }
  function start(initial, key = null) {
    clean();
    state = { initial, key, progress: initial ? 1 : 0, settling: false };
    root.dataset.matchMotion = "true";
    if (!initial) nativeToggle(); // Mount all branches for an honest preview.
    paint();
  }
  function finish(open) {
    if (!state) return;
    cancelAnimationFrame(frame);
    state.settling = true;
    const from = state.progress,
      to = open ? 1 : 0,
      began = performance.now(),
      duration = reduced() ? 0 : 210;
    const tick = (now) => {
      if (!state) return;
      const t = duration ? Math.min(1, (now - began) / duration) : 1;
      state.progress = from + (to - from) * (1 - Math.pow(1 - t, 3));
      paint();
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        if (columns() !== open) nativeToggle();
        clean();
        state = null;
      }
    };
    tick(began);
  }
  function cancel(restore = true) {
    pending = null;
    if (state) {
      const initial = state.initial;
      clean();
      state = null;
      if (restore && columns() !== initial) nativeToggle();
    }
  }
  root.addEventListener(
    "click",
    (e) => {
      if (bypass) return;
      if (swallow && e.target.closest(".furl-case-comb,.furl-match-bridge")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        swallow = false;
        return;
      }
      if (e.target.closest(".furl-match-layout-toggle")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
        const initial = columns();
        start(initial);
        finish(!initial);
      }
    },
    opts,
  );
  root.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || state?.settling) return;
      const handle = e.target.closest(".furl-match-bridge,.furl-case-comb"),
        m = handle?.closest(".furl-match");
      if (!m) return;
      const initial = columns(),
        branch = handle.closest(".furl-branch");
      if (initial && (!branch || branch === m.querySelector(".furl-branch")))
        return;
      if (!initial && !handle.classList.contains("furl-match-bridge")) return;
      const first = m.querySelector(".furl-branch");
      pending = {
        key: m.dataset.match,
        x: e.clientX,
        y: e.clientY,
        initial,
        distance: initial
          ? Math.max(
              70,
              branch.getBoundingClientRect().left -
                first.getBoundingClientRect().left,
            )
          : Math.max(
              120,
              Math.min(240, first.getBoundingClientRect().width * 0.45),
            ),
      };
    },
    opts,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!pending) return;
      const dx = e.clientX - pending.x,
        dy = e.clientY - pending.y;
      if (!state) {
        if (Math.abs(dx) < 5) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.5) {
          pending = null;
          return;
        }
        start(pending.initial, pending.key);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      state.progress = pending.initial
        ? Math.max(0, Math.min(1, 1 + dx / pending.distance))
        : Math.max(0, Math.min(1, dx / pending.distance));
      paint();
    },
    opts,
  );
  document.addEventListener(
    "pointerup",
    (e) => {
      if (!pending) return;
      if (state) {
        e.preventDefault();
        e.stopImmediatePropagation();
        swallow = true;
        finish(state.progress > 0.45);
        setTimeout(() => (swallow = false), 400);
      }
      pending = null;
    },
    opts,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && (state || pending)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (state) finish(state.initial);
        pending = null;
        swallow = true;
        setTimeout(() => (swallow = false), 400);
      }
    },
    opts,
  );
  document.addEventListener("pointercancel", () => cancel(), opts);
  window.addEventListener("blur", () => cancel(), { signal: ac.signal });
  window.addEventListener("resize", () => cancel(), { signal: ac.signal });
  return {
    get active() {
      return !!state;
    },
    layout: paint,
    reset: () => cancel(false),
    destroy() {
      cancel(false);
      ac.abort();
    },
  };
};
