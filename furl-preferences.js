/* Small, synchronous view preferences: available before CSS and Hazel load.
 * Program persistence remains owned by FurlApp. Never store gesture previews. */
(() => {
  const key = "furl.preferences.v1";
  const defaults = {
    appearance: "plain",
    mode: "edit",
    policy: "refine",
    style: "slot",
    links: true,
    motion: true,
    comb: true,
    bindings: true,
    expressions: true,
    values: true,
    indentation: true,
    match_columns: true,
    caret_tone: "violet",
  };
  const choices = {
    appearance: ["plain", "playful"],
    mode: ["edit", "move", "copy"],
    policy: ["refactor", "refine", "free"],
    style: ["slot", "float"],
    caret_tone: ["violet", "coral", "teal"],
  };
  const validated = (value) =>
    Object.fromEntries(
      Object.entries(defaults)
        .filter(([k, fallback]) =>
          choices[k]
            ? choices[k].includes(value?.[k])
            : typeof value?.[k] === typeof fallback,
        )
        .map(([k]) => [k, value[k]]),
    );
  let saved = {};
  try {
    saved = validated(JSON.parse(localStorage.getItem(key)));
  } catch {}
  // Keep the appearance chosen before unified preferences were introduced.
  if (!saved.appearance) {
    try {
      saved = {
        ...validated({ appearance: localStorage.getItem("furl.appearance") }),
        ...saved,
      };
    } catch {}
  }
  let state = { ...defaults, ...saved };
  function paint() {
    document.documentElement.dataset.furlTheme = state.appearance;
    document.documentElement.dataset.furlMotion = String(state.motion);
  }
  function update(patch) {
    state = { ...state, ...validated(patch) };
    paint();
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }
  window.FurlPreferences = {
    read: () => ({ ...state }),
    update,
    readJSON: () => JSON.stringify(state),
    updateJSON: (json) => {
      try {
        update(JSON.parse(json));
      } catch {}
    },
  };
  paint();
})();
