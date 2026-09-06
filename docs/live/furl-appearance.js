/* Cosmetic roles/usage come from native term markers, never token spelling. */
window.createFurlAppearance = (root) => {
  let playful = false,
    data = null;
  try {
    playful = localStorage.getItem("furl.appearance") === "playful";
  } catch {}
  const seed = (text) =>
    Array.from(text).reduce(
      (n, c) => Math.imul(n ^ c.codePointAt(0), 16777619) >>> 0,
      2166136261,
    );
  const jitter = (n, text) => {
    const h = seed(text || "");
    n.style.setProperty("--furl-jx", `${((h % 5) - 2) * 0.8}px`);
    n.style.setProperty("--furl-jy", `${(((h >>> 4) % 5) - 2) * 0.7}px`);
    n.style.setProperty("--furl-jr", `${(((h >>> 8) % 7) - 3) * 0.65}deg`);
  };
  function paint(next = data) {
    data = next;
    document.documentElement.dataset.furlTheme = playful ? "playful" : "plain";
    if (!data) return;
    for (const cell of root.querySelectorAll(".furl-native-cell")) {
      const hits = [...cell.querySelectorAll(".furl-hit")];
      for (const n of cell.querySelectorAll(".code-text .token")) {
        // offsetLeft/Top are the native grid, independent of paint transforms.
        const row = Math.round(n.offsetTop / data.lineHeight) * data.lineHeight;
        const m = hits.find(
          (h) =>
            Math.abs(parseFloat(h.style.left) - n.offsetLeft) < 2 &&
            Math.abs(parseFloat(h.style.top) - row) < 2,
        );
        delete n.dataset.furlUses;
        delete n.dataset.furlRole;
        delete n.dataset.furlSelected;
        if (m) {
          n.dataset.furlRole = m.dataset.role;
          m._appearanceToken = n;
          if (m.dataset.kind === "binder") {
            n.dataset.furlUses = m.dataset.uses;
            n.title = `${m.dataset.uses} lexical reference${m.dataset.uses === "1" ? "" : "s"}`;
          }
        }
        if (playful && !n.classList.contains("explicit-hole")) {
          jitter(n, n.textContent);
          if (m) jitter(m, n.textContent);
        }
      }
      // A selected atomic shard follows its glyph; wide selections and holes
      // keep their grid envelope so the caret and adjacent rows remain clear.
      const tokens = [...cell.querySelectorAll(".code-text .token")];
      for (const hole of cell.querySelectorAll(".empty-hole"))
        hole.classList.remove("furl-selected-hole");
      for (const tile of cell.querySelectorAll(".code-deco svg.shard")) {
        const x = parseFloat(tile.style.left),
          y = parseFloat(tile.style.top),
          w = parseFloat(tile.style.width),
          h = parseFloat(tile.style.height);
        const m = hits.find(
          (n) =>
            Math.abs(parseFloat(n.style.left) - x) < data.pitch / 2 &&
            Math.abs(parseFloat(n.style.top) - y) < data.lineHeight / 2,
        );
        const selected = tile.matches(".selected,.selected-expanded");
        const upright =
          !m ||
          m.dataset.kind === "hole" ||
          w > parseFloat(m.style.width) + data.pitch;
        tile.dataset.furlUpright = String(upright);
        if (playful && !upright) jitter(tile, m._glyph);
        else {
          tile.style.removeProperty("--furl-jx");
          tile.style.removeProperty("--furl-jy");
          tile.style.removeProperty("--furl-jr");
        }
        if (selected) {
          for (const n of tokens) {
            const row =
              Math.round(n.offsetTop / data.lineHeight) * data.lineHeight;
            if (
              n.offsetLeft + n.offsetWidth / 2 >= x &&
              n.offsetLeft + n.offsetWidth / 2 <= x + w &&
              row >= y &&
              row < y + h
            )
              n.dataset.furlSelected = "true";
          }
          for (const n of cell.querySelectorAll(".code-text .empty-hole")) {
            const box = n.getBoundingClientRect(),
              origin = cell.getBoundingClientRect();
            const row =
              Math.round((box.top - origin.top) / data.lineHeight) *
              data.lineHeight;
            const left = box.left - origin.left;
            if (left >= x - 1 && left < x + w && row >= y && row < y + h)
              n.classList.add("furl-selected-hole");
          }
        }
      }
    }
  }
  const ac = new AbortController();
  let hot = null;
  root.addEventListener(
    "pointerover",
    (e) => {
      hot?.classList.remove("furl-hot");
      hot = e.target.closest(".furl-hit")?._appearanceToken || null;
      hot?.classList.add("furl-hot");
    },
    { signal: ac.signal },
  );
  root.addEventListener(
    "pointerleave",
    () => {
      hot?.classList.remove("furl-hot");
      hot = null;
    },
    { signal: ac.signal },
  );
  paint();
  return {
    get playful() {
      return playful;
    },
    paint,
    destroy() {
      ac.abort();
    },
    toggle() {
      playful = !playful;
      try {
        localStorage.setItem("furl.appearance", playful ? "playful" : "plain");
      } catch {}
      paint();
      document.fonts.ready.then(() =>
        window.dispatchEvent(new Event("resize")),
      );
    },
  };
};
