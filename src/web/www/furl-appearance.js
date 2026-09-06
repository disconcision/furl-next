/* A presentation variant over the same measured editors and source IDs. */
window.createFurlAppearance = (root) => {
  let playful = false;
  try {
    playful = localStorage.getItem("furl.appearance") === "playful";
  } catch {}
  const seed = (text) =>
    Array.from(text).reduce(
      (n, c) => Math.imul(n ^ c.codePointAt(0), 16777619) >>> 0,
      2166136261,
    );
  function paint() {
    document.documentElement.dataset.furlTheme = playful ? "playful" : "plain";
    if (!playful) return;
    root
      .querySelectorAll(".code-text .token,.furl-value .token,.furl-hit")
      .forEach((n) => {
        const text = n.classList.contains("furl-hit")
          ? n._glyph || n.dataset.name || n._code
          : n.textContent;
        if (n._appearanceText === text && n.style.getPropertyValue("--furl-jx"))
          return;
        n._appearanceText = text;
        const h = seed(text || "");
        n.style.setProperty("--furl-jx", `${((h % 5) - 2) * 0.45}px`);
        n.style.setProperty("--furl-jy", `${(((h >>> 4) % 5) - 2) * 0.5}px`);
        n.style.setProperty("--furl-jr", `${(((h >>> 8) % 7) - 3) * 0.3}deg`);
      });
  }
  paint();
  return {
    get playful() {
      return playful;
    },
    paint,
    toggle() {
      playful = !playful;
      try {
        localStorage.setItem("furl.appearance", playful ? "playful" : "plain");
      } catch {}
      paint();
      // FontSpecimen's observer reports the actual pitch to every native cell.
      document.fonts.ready.then(() =>
        window.dispatchEvent(new Event("resize")),
      );
    },
  };
};
