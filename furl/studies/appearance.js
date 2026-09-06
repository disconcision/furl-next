(() => {
  const $ = (s) => document.querySelector(s);
  const pool = [
    "bro",
    "greeze",
    "cloun",
    "foob",
    "pruby",
    "bez",
    "klork",
    "crunk",
    "dree",
    "bap",
    "gurb",
    "weeb",
    "shrork",
    "foo",
    "bar",
    "baz",
    "qux",
    "garg",
    "yorp",
  ];
  const symbols = [
    "🌱",
    "🐚",
    "🪁",
    "🍄",
    "🐟",
    "🌙",
    "🦊",
    "🍋",
    "🧶",
    "🦋",
    "🪷",
    "🦀",
    "🍒",
    "🪲",
    "🌻",
    "🐳",
    "🍐",
    "🪺",
    "🦉",
    "🎈",
    "🍀",
    "🐙",
    "🪻",
    "🦎",
  ];
  let names = ["width", "height", "area"],
    mode = "words";
  const alias = (i) => {
    let length = 1,
      count = symbols.length;
    while (i >= count) {
      i -= count;
      length++;
      count *= symbols.length;
    }
    let text = "";
    for (let n = 0; n < length; n++) {
      text = symbols[i % symbols.length] + text;
      i = Math.floor(i / symbols.length);
    }
    return text;
  };
  function render() {
    $("#alias-program").replaceChildren(
      ...names.map((name, i) => {
        const row = document.createElement("div");
        row.className = "alias-row";
        const binding = document.createElement("span");
        binding.className = "alias";
        binding.title = `${name} · ${alias(i)}`;
        binding.textContent = mode === "words" ? name : alias(i);
        if (mode === "both") {
          const word = document.createElement("small");
          word.textContent = name;
          binding.append(word);
        }
        const exp = document.createElement("span");
        exp.className = "syntax";
        exp.textContent =
          i === 0
            ? "6"
            : i === 1
              ? "4"
              : i === 2
                ? `${mode === "words" ? "width" : alias(0)} * ${mode === "words" ? "height" : alias(1)}`
                : "□";
        const value = document.createElement("span");
        value.className = "value";
        value.textContent = ["6", "4", "24"][i] || "□";
        row.append(binding, exp, value);
        return row;
      }),
    );
  }
  $("#symbols").replaceChildren(
    ...symbols.map((s) => {
      const n = document.createElement("span");
      n.textContent = s;
      return n;
    }),
  );
  function choices(id, attr, update) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b) return;
      $(id)
        .querySelectorAll("button")
        .forEach((n) => n.setAttribute("aria-pressed", n === b));
      update(b.dataset[attr]);
    });
  }
  choices("#name-controls", "names", (n) => {
    mode = n;
    render();
  });
  $("#add-name").onclick = () => {
    let n = pool.find((n) => !names.includes(n));
    if (!n) {
      let i = 2;
      while (names.includes("bro" + i)) i++;
      n = "bro" + i;
    }
    names.push(n);
    render();
    $("#name-feedback").textContent =
      `Added ${n} ↔ ${alias(names.length - 1)}. Earlier aliases have not changed.`;
  };
  $("#reset-names").onclick = () => {
    names = ["width", "height", "area"];
    render();
    $("#name-feedback").textContent = "Starting names restored.";
  };
  const legends = {
    ink: "Unused: quiet ink. Once: binding blue. Several: scope purple. No additional marks, but color alone carries the distinction.",
    underline:
      "Unused: quiet ink. Once: faint underline. Several: stronger underline. A small addition to the existing text, with no column-width change.",
    dot: "Unused: hollow dot. Once: one dot. Several: two dots. More explicit, though it adds texture beside short names.",
    tick: "Unused: faint left tick. Once: blue tick. Several: thicker purple tick. Readable at a glance, but it competes with indentation and comb marks.",
  };
  choices("#usage-controls", "usage", (u) => {
    $("#usage-lab").dataset.usage = u;
    $("#usage-legend").textContent = legends[u];
  });
  choices(
    "#look-controls",
    "look",
    (look) => ($("#appearance-preview").dataset.look = look),
  );
  $("#usage-legend").textContent = legends.ink;
  render();
})();
