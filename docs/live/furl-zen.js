/* Persist the presentation choice; keep the mounted native editor and history. */
window.createFurlZen = (root, button, { beforeChange, onLayout }) => {
  const program = root.querySelector(".furl-program");
  const dock = root.querySelector(".furl-view-options");
  const tools = root.querySelector(".furl-gesture-tools");
  const ac = new AbortController();
  const on = (node, event, fn, capture = false) =>
    node.addEventListener(event, fn, { capture, signal: ac.signal });
  let enabled = window.FurlPreferences.read().zen,
    shown = false,
    hideTimer = 0,
    frame = 0;
  let lastFocus = null,
    pointerNear = false,
    keyboard = false,
    scroll = null;
  const layout = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      onLayout();
    });
  };
  function restoreFocus() {
    let target = lastFocus?.isConnected
      ? lastFocus
      : root.querySelector("#active-code-editor");
    if (
      ["move", "copy"].includes(root.dataset.tool) &&
      !target?.matches(".furl-hit")
    )
      target = target?.closest(".furl-binding,.furl-row");
    if (target) target.focus({ preventScroll: true });
    else {
      program.tabIndex = -1;
      program.focus({ preventScroll: true });
    }
  }
  function reveal(show, focus = false) {
    clearTimeout(hideTimer);
    shown = show;
    if (!show && dock.contains(document.activeElement)) restoreFocus();
    root.dataset.zenTools = String(show);
    dock.inert = enabled && !show;
    if (enabled && !show) dock.setAttribute("aria-hidden", "true");
    else dock.removeAttribute("aria-hidden");
    if (focus) {
      keyboard = true;
      tools.querySelector("button")?.focus({ preventScroll: true });
    }
  }
  function hideLater() {
    clearTimeout(hideTimer);
    if (!pointerNear && !keyboard)
      hideTimer = setTimeout(() => reveal(false), 350);
  }
  function paint() {
    root.dataset.zen = String(enabled);
    button.setAttribute("aria-pressed", String(enabled));
    const title = (enabled ? "Exit" : "Enter") + " Zen mode (F9)";
    button.title = title;
    button.setAttribute("aria-label", title);
  }
  function set(next) {
    beforeChange();
    clearTimeout(hideTimer);
    if (next) scroll = { x: window.scrollX, y: window.scrollY };
    enabled = next;
    window.FurlPreferences.update({ zen: enabled });
    keyboard = false;
    pointerNear = false;
    paint();
    reveal(false);
    if (next) {
      window.scrollTo(0, 0);
      if (!program.contains(document.activeElement)) restoreFocus();
    } else if (scroll) window.scrollTo(scroll.x, scroll.y);
    layout();
  }
  on(
    document,
    "keydown",
    (e) => {
      if (e.isComposing || e.key !== "F9" || e.metaKey || e.ctrlKey || e.altKey)
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.shiftKey && enabled) {
        keyboard = !shown;
        reveal(!shown, !shown);
      } else set(!enabled);
    },
    true,
  );
  on(
    document,
    "pointermove",
    (e) => {
      if (!enabled) return;
      // A narrow activation edge expands to cover the revealed dock and its gap.
      pointerNear =
        e.clientY <=
        (shown ? Math.max(30, dock.getBoundingClientRect().bottom + 12) : 24);
      if (pointerNear) reveal(true);
      else hideLater();
    },
    true,
  );
  on(
    document,
    "pointerdown",
    () => {
      keyboard = false;
      hideLater();
    },
    true,
  );
  on(
    document,
    "focusin",
    (e) => {
      if (e.target !== program && program.contains(e.target))
        lastFocus = e.target;
      if (!enabled) return;
      if (dock.contains(e.target)) {
        if (e.target.matches(":focus-visible")) {
          keyboard = true;
          reveal(true);
        }
      } else {
        keyboard = false;
        hideLater();
      }
    },
    true,
  );
  on(
    document,
    "keydown",
    (e) => {
      if (enabled && e.key === "Escape" && dock.contains(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        keyboard = false;
        pointerNear = false;
        reveal(false);
      }
    },
    true,
  );
  on(window, "blur", () => {
    if (enabled) {
      keyboard = false;
      pointerNear = false;
      reveal(false);
    }
  });
  const observer = new ResizeObserver(layout);
  observer.observe(program);
  // Apply the stored choice without cancelling gestures or moving focus during
  // the parent adapter's construction. Preboot CSS already has the same state.
  paint();
  reveal(false);
  layout();
  return {
    toggle: () => set(!enabled),
    destroy: () => {
      ac.abort();
      observer.disconnect();
      clearTimeout(hideTimer);
      cancelAnimationFrame(frame);
      dock.inert = false;
      dock.removeAttribute("aria-hidden");
    },
  };
};
