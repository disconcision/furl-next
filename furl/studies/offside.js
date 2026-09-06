(() => {
  const $ = (s) => document.querySelector(s);
  const initial = () => ({
    rows: [
      { id: "r1", name: "width", code: "6" },
      { id: "r2", name: "height", code: "4" },
      { id: "r3", name: "area", code: "width * height" },
    ],
    cards: [
      { id: "c1", kind: "term", code: "□ + □" },
      {
        id: "c2",
        kind: "rows",
        rows: [{ id: "r4", name: "bonus", code: "2" }],
      },
    ],
  });
  let state = initial(),
    history = [],
    carried = null,
    serial = 10;
  const templates = [
    "□ + □",
    "□ * □",
    "fun x -> □",
    "case □ | Some(x) => □ | None => □",
    "0",
    "true",
    "List.map(□, □)",
  ];
  const say = (t) => ($("#feedback").textContent = t);
  const snapshot = () => JSON.stringify(state);
  const save = () => {
    history.push(snapshot());
    $("#undo").disabled = false;
  };
  const id = () => `piece-${++serial}`;
  const escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const source = (kind, key) =>
    `data-source="${kind}" data-key="${key}" draggable="true" tabindex="0"`;
  function render() {
    $("#main-patch").innerHTML =
      state.rows
        .map(
          (r) =>
            `<div class="program-row" data-row="${r.id}"><span class="name" ${source("row", r.id)} title="Move row ${escape(r.name)}">${escape(r.name)}</span><span ${source("term", r.id)} data-drop="expression" title="Move whole expression; double-click to edit">${escape(r.code)}</span></div>`,
        )
        .join("") || '<p class="empty-rail">Drop a row here.</p>';
    $("#stash-content").innerHTML =
      state.cards
        .map(
          (c, i) =>
            `<div class="stash-card" ${source("card", c.id)} data-card="${c.id}" style="--offset:${(i % 3) * 13}px" aria-label="Parked ${c.kind === "rows" ? "rows" : "term"}"><div class="card-actions"><button data-order="-1" title="Earlier" aria-label="Move card earlier">↑</button><button data-order="1" title="Later" aria-label="Move card later">↓</button></div>${c.kind === "term" ? `<span data-edit-card="${c.id}">${escape(c.code)}</span>` : c.rows.map((r) => `<div class="card-row"><span>${escape(r.name)}</span><span data-edit-parked="${r.id}">${escape(r.code)}</span></div>`).join("")}</div>`,
        )
        .join("") +
      '<div class="empty-rail">Drop a piece on the rail to keep it here.</div>';
    markPicked();
  }
  function markPicked() {
    document
      .querySelectorAll(".picked")
      .forEach((n) => n.classList.remove("picked"));
    if (carried)
      document
        .querySelector(
          `[data-source="${carried.kind}"][data-key="${carried.key}"]`,
        )
        ?.classList.add("picked");
  }
  function pickup(n) {
    carried = { kind: n.dataset.source, key: n.dataset.key };
    markPicked();
    say(
      `${carried.kind === "palette" ? "Copy" : "Move"} picked up. Choose a destination; Escape cancels.`,
    );
  }
  function material() {
    if (!carried) return null;
    if (carried.kind === "palette")
      return { kind: "term", code: templates[+carried.key] };
    if (carried.kind === "card")
      return state.cards.find((c) => c.id === carried.key);
    const row = state.rows.find((r) => r.id === carried.key);
    return (
      row &&
      (carried.kind === "row"
        ? { kind: "rows", rows: [row] }
        : { kind: "term", code: row.code })
    );
  }
  function consume() {
    if (carried.kind === "card")
      state.cards = state.cards.filter((c) => c.id !== carried.key);
    if (carried.kind === "row")
      state.rows = state.rows.filter((r) => r.id !== carried.key);
    if (carried.kind === "term")
      state.rows.find((r) => r.id === carried.key).code = "□";
  }
  function drop(target) {
    const item = material();
    if (!item) return;
    const cardNode = target.closest("[data-card]"),
      rowNode = target.closest("[data-row]"),
      expression = target.closest("[data-drop=expression]");
    if (
      (cardNode &&
        carried.kind === "card" &&
        cardNode.dataset.card === carried.key) ||
      (expression &&
        carried.kind === "term" &&
        rowNode.dataset.row === carried.key)
    ) {
      carried = null;
      markPicked();
      say("Returned to its starting place.");
      return;
    }
    if (target.closest("#stash")) {
      const onto = state.cards.find((c) => c.id === cardNode?.dataset.card);
      save();
      consume();
      if (onto?.kind === "rows" && item.kind === "rows") {
        onto.rows.push(...structuredClone(item.rows));
        say("Rows joined in one parked card.");
      } else {
        state.cards.push({ ...structuredClone(item), id: id() });
        say(
          carried.kind === "palette"
            ? "Template copied to the rail."
            : "Parked. It is outside the main program.",
        );
      }
    } else if (target.closest("#main-patch")) {
      if (item.kind === "term") {
        if (!expression) {
          say(
            "Choose an expression to replace. Terms do not drop into whitespace.",
          );
          return;
        }
        save();
        consume();
        state.rows.find((r) => r.id === rowNode.dataset.row).code = item.code;
        say("Whole expression replaced.");
      } else {
        save();
        const before = rowNode?.dataset.row;
        consume();
        let at = state.rows.findIndex((r) => r.id === before);
        if (at < 0) at = state.rows.length;
        state.rows.splice(at, 0, ...structuredClone(item.rows));
        say("Rows returned to the program.");
      }
    } else {
      carried = null;
      render();
      say("Cancelled; the original piece remains.");
      return;
    }
    carried = null;
    render();
  }
  $("#palette").insertAdjacentHTML(
    "beforeend",
    templates
      .map(
        (t, i) =>
          `<button ${source("palette", i)} title="Copy template ${escape(t)}">${escape(t)}</button>`,
      )
      .join(""),
  );
  document.addEventListener("dragstart", (e) => {
    const n = e.target.closest("[data-source]");
    if (!n) return;
    pickup(n);
    e.dataTransfer.effectAllowed =
      n.dataset.source === "palette" ? "copy" : "move";
    e.dataTransfer.setData("text/plain", material().code || "rows");
  });
  document.addEventListener("dragover", (e) => {
    if (!carried) return;
    if (e.target.closest("#workspace")) {
      e.preventDefault();
      document
        .querySelectorAll(".drop-over")
        .forEach((n) => n.classList.remove("drop-over"));
      e.target
        .closest("[data-drop],.stash-card,#stash,#main-patch")
        ?.classList.add("drop-over");
    }
  });
  document.addEventListener("drop", (e) => {
    if (carried) {
      e.preventDefault();
      drop(e.target);
    }
  });
  document.addEventListener("dragend", () => {
    carried = null;
    markPicked();
    document
      .querySelectorAll(".drop-over")
      .forEach((n) => n.classList.remove("drop-over"));
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("input,[data-order],#layout-controls")) return;
    if (carried) {
      drop(e.target);
      return;
    }
    const n = e.target.closest("[data-source]");
    if (n) pickup(n);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "Escape") {
      carried = null;
      render();
      say("Cancelled; the original piece remains.");
    }
    if (e.key === "Enter" || e.key === " ") {
      const n = e.target.closest("[data-source],#stash,#main-patch");
      if (n) {
        e.preventDefault();
        if (carried) drop(n);
        else if (n.dataset.source) pickup(n);
      }
    }
  });
  document.addEventListener("dblclick", (e) => {
    const n = e.target.closest(
      "[data-drop=expression],[data-edit-card],[data-edit-parked],.program-row .name",
    );
    if (!n) return;
    carried = null;
    markPicked();
    const text = n.textContent,
      input = document.createElement("input");
    input.value = text;
    n.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (cancel) => {
      if (done) return;
      done = true;
      if (!cancel && input.value !== text) {
        save();
        const r = state.rows.find(
          (r) => r.id === n.closest("[data-row]")?.dataset.row,
        );
        if (r) r[n.classList.contains("name") ? "name" : "code"] = input.value;
        else if (n.dataset.editCard)
          state.cards.find((c) => c.id === n.dataset.editCard).code =
            input.value;
        else
          state.cards
            .flatMap((c) => c.rows || [])
            .find((r) => r.id === n.dataset.editParked).code = input.value;
      }
      render();
    };
    input.addEventListener("blur", () => finish(false));
    input.addEventListener("keydown", (e) => {
      if (["Enter", "Escape"].includes(e.key)) {
        e.stopPropagation();
        finish(e.key === "Escape");
      }
    });
  });
  $("#stash").addEventListener("click", (e) => {
    const b = e.target.closest("[data-order]");
    if (!b) return;
    const i = state.cards.findIndex(
        (c) => c.id === b.closest("[data-card]").dataset.card,
      ),
      j = i + +b.dataset.order;
    if (j < 0 || j >= state.cards.length) return;
    save();
    [state.cards[i], state.cards[j]] = [state.cards[j], state.cards[i]];
    render();
    say("Card order changed.");
  });
  $("#layout-controls").addEventListener("click", (e) => {
    const b = e.target.closest("[data-layout]");
    if (!b) return;
    $("#workspace").dataset.layout = b.dataset.layout;
    $("#stash").scrollTo(0, 0);
    document
      .querySelectorAll("#layout-controls [data-layout]")
      .forEach((n) => n.setAttribute("aria-pressed", n === b));
    say("Same pieces, different arrangement.");
  });
  $("#undo").onclick = () => {
    if (!history.length) return;
    state = JSON.parse(history.pop());
    carried = null;
    render();
    $("#undo").disabled = !history.length;
    say("Undone.");
  };
  $("#reset").onclick = () => {
    save();
    state = initial();
    carried = null;
    render();
    say("Starting pieces restored.");
  };
  render();
})();
