(() => {
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  let serial = 0;
  const id = () => `p${++serial}`;
  const atom = (text) => ({ id: id(), parts: [text] });
  const hole = () => atom("□");
  const binary = (op) => ({
    id: id(),
    infix: true,
    parts: [hole(), ` ${op} `, hole()],
  });
  const call = (name, arity) => ({
    id: id(),
    parts: [
      `${name}(`,
      ...Array.from({ length: arity }, (_, i) => [
        ...(i ? [", "] : []),
        hole(),
      ]).flat(),
      ")",
    ],
  });
  const text = (t) =>
    t.parts
      .map((p) =>
        typeof p === "string" ? p : p.infix ? `(${text(p)})` : text(p),
      )
      .join("");
  const fresh = (x) => {
    const result = structuredClone(x);
    const walk = (n) => {
      if (n && typeof n === "object") {
        if (n.id) n.id = id();
        Object.values(n).forEach(walk);
      }
    };
    walk(result);
    return result;
  };
  const initial = () => ({
    rows: [
      { id: id(), name: "width", term: atom("6") },
      { id: id(), name: "height", term: atom("4") },
      {
        id: id(),
        name: "area",
        term: {
          id: id(),
          infix: true,
          parts: [atom("width"), " * ", atom("height")],
        },
      },
    ],
    cards: [
      ...["+", "-", "*", "/", "::", "@", "++"].map(binary),
      ...["0", "1", "true", "[]", '""'].map(atom),
      call("length", 1),
      call("map", 2),
      call("filter", 2),
      call("string_length", 1),
    ].map((term) => ({ id: id(), kind: "term", term })),
  });
  let state = initial(),
    history = [],
    carried = null,
    mode = "move",
    railSlot = 0,
    dragging = false,
    scrollFrame = 0,
    dragY = 0;
  const say = (t) => ($("#feedback").textContent = t);
  const esc = (s) =>
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
  const attrs = (kind, key) =>
    `data-source="${kind}" data-key="${key}" draggable="true" tabindex="0" role="button"`;
  const renderTerm = (t, nested = false) =>
    `<span class="study-term" data-term="${t.id}">${nested && t.infix ? `<span class="term-handle" ${attrs("term", t.id)}>(</span>` : ""}${t.parts.map((p) => (typeof p === "string" ? `<span class="term-handle${p === "□" ? " term-hole" : ""}" ${attrs("term", t.id)} title="${esc(text(t))}">${esc(p)}</span>` : renderTerm(p, true))).join("")}${nested && t.infix ? `<span class="term-handle" ${attrs("term", t.id)}>)</span>` : ""}</span>`;
  function render() {
    const scroll = $("#stash").scrollTop;
    $("#main-patch").innerHTML =
      state.rows
        .map(
          (r) =>
            `<div class="program-row" data-row="${r.id}"><span class="name" ${attrs("row", r.id)} title="${mode === "copy" ? "Copy" : "Move"} row ${esc(r.name)}">${esc(r.name)}</span><span class="program-expression">${renderTerm(r.term)}</span></div>`,
        )
        .join("") +
      '<div class="row-return-target" tabindex="0" aria-label="Place row at the end"></div>';
    $("#stash-content").innerHTML = state.cards
      .map(
        (c) =>
          `<div class="stash-card" ${attrs("card", c.id)} data-card="${c.id}" aria-label="${c.kind === "row" ? "Row " + esc(c.row.name) + ": " : ""}${esc(text(c.kind === "row" ? c.row.term : c.term))}">${c.kind === "row" ? `<span class="name">${esc(c.row.name)}</span>　${esc(text(c.row.term))}` : esc(text(c.term))}</div>`,
      )
      .join("");
    $("#stash").scrollTop = scroll;
    $("#undo").disabled = !history.length;
    markPicked();
  }
  const findTerm = (key, t) =>
    t.id === key
      ? t
      : t.parts
          .filter((p) => typeof p !== "string")
          .map((p) => findTerm(key, p))
          .find(Boolean);
  const sourceTerm = (key) =>
    state.rows.map((r) => findTerm(key, r.term)).find(Boolean);
  function replaceTerm(key, next) {
    const walk = (t) =>
      t.id === key
        ? next
        : {
            ...t,
            parts: t.parts.map((p) => (typeof p === "string" ? p : walk(p))),
          };
    state.rows = state.rows.map((r) => ({ ...r, term: walk(r.term) }));
  }
  function material() {
    if (!carried) return null;
    if (carried.kind === "card")
      return state.cards.find((c) => c.id === carried.key);
    if (carried.kind === "row")
      return { kind: "row", row: state.rows.find((r) => r.id === carried.key) };
    return { kind: "term", term: sourceTerm(carried.key) };
  }
  function consume() {
    if (carried.copy) return;
    if (carried.kind === "card")
      state.cards = state.cards.filter((c) => c.id !== carried.key);
    if (carried.kind === "row")
      state.rows = state.rows.filter((r) => r.id !== carried.key);
    if (carried.kind === "term") replaceTerm(carried.key, hole());
  }
  function markPicked() {
    $$(".picked").forEach((n) => n.classList.remove("picked"));
    if (carried)
      document
        .querySelector(
          `[data-source="${carried.kind}"][data-key="${carried.key}"]`,
        )
        ?.classList.add("picked");
  }
  function clearTarget() {
    $$(".drop-over").forEach((n) => n.classList.remove("drop-over"));
    $("#rail-slot").hidden = true;
  }
  function cancel(message = "Cancelled; the original piece remains.") {
    carried = null;
    dragging = false;
    cancelAnimationFrame(scrollFrame);
    clearTarget();
    markPicked();
    say(message);
  }
  function pickup(n) {
    carried = {
      kind: n.dataset.source,
      key: n.dataset.key,
      copy: mode === "copy",
    };
    markPicked();
    say(
      `${carried.copy ? "Copy" : "Move"} picked up. Choose a term, a row destination or the rail; Escape cancels.`,
    );
  }
  function railIndex(y) {
    const cards = $$(".stash-card").filter(
      (n) => carried?.copy || n.dataset.card !== carried?.key,
    );
    return cards.findIndex(
      (n) => y < n.getBoundingClientRect().top + n.offsetHeight / 2,
    ) < 0
      ? cards.length
      : cards.findIndex(
          (n) => y < n.getBoundingClientRect().top + n.offsetHeight / 2,
        );
  }
  function showSlot(index) {
    const cards = $$(".stash-card").filter(
      (n) => carried?.copy || n.dataset.card !== carried?.key,
    );
    railSlot = Math.max(0, Math.min(index, cards.length));
    const stash = $("#stash"),
      bounds = stash.getBoundingClientRect(),
      next = cards[railSlot],
      previous = cards[railSlot - 1];
    const y = next
      ? next.getBoundingClientRect().top - 9
      : previous
        ? previous.getBoundingClientRect().bottom + 9
        : bounds.top + 52 - stash.scrollTop;
    $("#rail-slot").style.top = `${y - bounds.top + stash.scrollTop}px`;
    $("#rail-slot").hidden = false;
  }
  function destination(target, x, y) {
    if (
      target.closest("#stash") &&
      $("#workspace").dataset.collapsed !== "true"
    ) {
      const bounds = $("#stash").getBoundingClientRect(),
        axis = bounds.left + 18;
      if (
        target.closest(".stash-card") ||
        Math.abs(x - axis) <= 32 ||
        target === $("#stash")
      )
        return { kind: "rail", at: railIndex(y) };
    }
    if (target.closest("#main-patch")) {
      const item = material(),
        handle = target.closest("[data-source=term]");
      if (item?.kind === "term" && handle)
        return {
          kind: "term",
          key: handle.dataset.key,
          node: handle.closest(".study-term"),
        };
      if (item?.kind === "row" && !target.closest(".program-expression"))
        return {
          kind: "row",
          before: target.closest("[data-row]")?.dataset.row,
          node: target.closest(".program-row") || $("#main-patch"),
        };
    }
    return null;
  }
  function preview(e) {
    clearTarget();
    const dest = destination(e.target, e.clientX, e.clientY);
    if (dest?.kind === "rail") showSlot(dest.at);
    else dest?.node.classList.add("drop-over");
    return dest;
  }
  function drop(dest) {
    const item = material();
    if (!item || !dest) {
      cancel();
      return;
    }
    if (
      dest.kind === "term" &&
      carried.kind === "term" &&
      (findTerm(dest.key, item.term) ||
        findTerm(carried.key, sourceTerm(dest.key)))
    ) {
      cancel("Choose a separate term; a term cannot contain itself.");
      return;
    }
    if (dest.kind === "row" && dest.before === carried.key && !carried.copy) {
      cancel("Returned to its starting place.");
      return;
    }
    const snapshot = JSON.stringify(state),
      piece = carried.copy ? fresh(item) : structuredClone(item);
    consume();
    if (dest.kind === "rail") {
      piece.id = piece.id || id();
      state.cards.splice(dest.at, 0, piece);
    } else if (dest.kind === "term") replaceTerm(dest.key, piece.term);
    else {
      if (carried.copy) {
        let base = piece.row.name,
          n = 2;
        while (state.rows.some((r) => r.name === piece.row.name))
          piece.row.name = base + n++;
      }
      const at = state.rows.findIndex((r) => r.id === dest.before);
      state.rows.splice(at < 0 ? state.rows.length : at, 0, piece.row);
    }
    history.push(snapshot);
    carried = null;
    dragging = false;
    cancelAnimationFrame(scrollFrame);
    clearTarget();
    render();
    say(
      dest.kind === "rail"
        ? "Parked as inert syntax."
        : dest.kind === "term"
          ? "Term placed. Any nested holes are targets too."
          : "Row placed.",
    );
  }
  function autoScroll() {
    if (!dragging) return;
    const r = $("#stash").getBoundingClientRect();
    if ($("#stash").matches(":hover")) {
      const speed = dragY < r.top + 46 ? -9 : dragY > r.bottom - 46 ? 9 : 0;
      if (speed) {
        $("#stash").scrollTop += speed;
        showSlot(railIndex(dragY));
      }
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  document.addEventListener("dragstart", (e) => {
    const n = e.target.closest("[data-source]");
    if (!n) return;
    pickup(n);
    dragging = true;
    dragY = e.clientY;
    e.dataTransfer.effectAllowed = carried.copy ? "copy" : "move";
    e.dataTransfer.setData(
      "text/plain",
      text(material().kind === "row" ? material().row.term : material().term),
    );
    autoScroll();
  });
  document.addEventListener("dragover", (e) => {
    if (!carried) return;
    dragY = e.clientY;
    if (preview(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = carried.copy ? "copy" : "move";
    }
  });
  document.addEventListener("drop", (e) => {
    if (!carried) return;
    e.preventDefault();
    drop(destination(e.target, e.clientX, e.clientY));
  });
  document.addEventListener("dragend", () => {
    if (carried) cancel();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("button,select,a,input")) return;
    if (carried) drop(destination(e.target, e.clientX, e.clientY));
    else {
      const n = e.target.closest("[data-source]");
      if (n) pickup(n);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && carried) {
      e.preventDefault();
      cancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      $("#undo").click();
      return;
    }
    if (
      e.target === $("#stash") &&
      carried &&
      ["ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      e.preventDefault();
      showSlot(railSlot + (e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (
      ["Enter", " "].includes(e.key) &&
      e.target.matches("[data-source],#stash,.row-return-target")
    ) {
      e.preventDefault();
      if (!carried && e.target.matches("[data-source]")) pickup(e.target);
      else if (carried) {
        const r = e.target.getBoundingClientRect();
        drop(
          e.target === $("#stash")
            ? { kind: "rail", at: railSlot }
            : destination(e.target, r.left + r.width / 2, r.top + r.height / 2),
        );
      }
    }
  });
  $("[data-tool=move]").onclick = $("[data-tool=copy]").onclick = (e) => {
    cancel();
    mode = e.currentTarget.dataset.tool;
    $$("[data-tool]").forEach((n) =>
      n.setAttribute("aria-pressed", String(n.dataset.tool === mode)),
    );
    say(
      `${mode === "copy" ? "Copy leaves" : "Move takes"} the original. Starter cards follow the same rule.`,
    );
    render();
  };
  $("#undo").onclick = () => {
    if (history.length) {
      cancel();
      state = JSON.parse(history.pop());
      render();
      say("Undid one edit.");
    }
  };
  $("#reset").onclick = () => {
    cancel();
    state = initial();
    history = [];
    render();
    $("#stash").scrollTop = 0;
    say("Starter program and rail restored.");
  };
  $("#rail-toggle").onclick = () => {
    cancel();
    const collapsed = $("#workspace").dataset.collapsed !== "true";
    $("#workspace").dataset.collapsed = String(collapsed);
    $("#stash").inert = collapsed;
    $("#rail-toggle").setAttribute("aria-expanded", String(!collapsed));
    $("#rail-toggle").title = collapsed
      ? "Open the rail"
      : "Tuck away the rail";
    $("#rail-toggle").setAttribute("aria-label", $("#rail-toggle").title);
    $("#rail-toggle").textContent = collapsed ? "‹" : "›";
  };
  render();
})();
