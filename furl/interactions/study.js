(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const primary = (e) => (e.metaKey || e.ctrlKey) && !e.altKey;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svgNS = "http://www.w3.org/2000/svg";
  function comb(height) {
    const s = document.createElementNS(svgNS, "svg");
    s.classList.add("comb");
    s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(svgNS, "path");
    p.setAttribute("d", `M 8 1 Q 2 1 2 7 L 2 ${height - 2}`);
    s.append(p);
    return s;
  }
  function status(root, message, warn = false) {
    const n = $(".lab-status", root);
    n.textContent = message;
    n.classList.toggle("warn", warn);
  }
  // Tool chooses the pointer target; policy chooses the permitted transaction.
  // Both are shared by the two deliberately separate example documents.
  const settings = { tool: "edit", policy: "refine" };
  function chooseSetting(key, value) {
    document.dispatchEvent(new Event("cancel-gesture"));
    settings[key] = value;
    $$(`[data-${key}]`).forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset[key] === value)),
    );
    $$("[data-policy-select]").forEach((n) => (n.value = settings.policy));
    document.dispatchEvent(new Event("study-settings"));
  }
  $$("[data-tool],[data-policy]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.tool ? "tool" : "policy";
      chooseSetting(key, b.dataset[key]);
    }),
  );
  $$("[data-policy-select]").forEach((n) =>
    n.addEventListener("change", () => chooseSetting("policy", n.value)),
  );
  function outsideCanvas(root, point) {
    const r = $(".program-scroll", root).getBoundingClientRect();
    return (
      point.x < r.left ||
      point.x > r.right ||
      point.y < r.top ||
      point.y > r.bottom
    );
  }
  function mode(root, changed) {
    let held = false,
      inside = false,
      latched = false,
      last = false;
    const button = $(".structure-toggle", root);
    const tool = root.id === "row-lab" ? "rows" : "connect";
    const active = () => settings.tool === tool || latched || (held && inside);
    const update = () => {
      const a = active();
      const pinned = settings.tool === tool;
      root.classList.toggle("armed", a);
      button.setAttribute("aria-pressed", String(pinned));
      $(".mode-note", root).textContent = a
        ? pinned
          ? tool === "rows"
            ? "Row gestures"
            : "Reference gestures"
          : latched
            ? "Structure picked up"
            : "Option / Alt held"
        : tool === "rows"
          ? "Editing cells"
          : "Inspecting references";
      if (a !== last) {
        last = a;
        changed(a);
      }
    };
    button.addEventListener("click", () => {
      chooseSetting("tool", settings.tool === tool ? "edit" : tool);
    });
    document.addEventListener("study-settings", update);
    root.addEventListener("pointerenter", () => {
      inside = true;
      update();
    });
    root.addEventListener("pointerleave", () => {
      inside = false;
      update();
    });
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Alt" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.getModifierState("AltGraph")
      ) {
        held = true;
        update();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === "Alt") {
        held = false;
        update();
      }
    });
    const clear = () => {
      held = false;
      update();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clear();
    });
    return {
      active,
      enable: () => {
        if (settings.tool !== tool) chooseSetting("tool", tool);
        update();
      },
      latch: (value) => {
        latched = value;
        update();
      },
    };
  }
  // A deliberately small parser for this study, never JavaScript eval.
  function arithmetic(source, env) {
    const tokens =
      source.match(
        /[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+*\-]|\S/g,
      ) || [];
    let i = 0;
    function atom() {
      const t = tokens[i++];
      if (t === "(") {
        const v = sum();
        if (tokens[i++] !== ")") throw Error("Missing )");
        return v;
      }
      if (t === "-") return -atom();
      if (t && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return Number(t);
      if (t && /^[A-Za-z_]\w*$/.test(t)) {
        if (!env.has(t)) throw Error(`${t} is not bound here`);
        const v = env.get(t);
        if (v === null) throw Error(`${t} has no value yet`);
        return v;
      }
      throw Error(
        t === undefined ? "An expression is needed" : `Unsupported token ${t}`,
      );
    }
    function product() {
      let v = atom();
      while (tokens[i] === "*") {
        i++;
        v *= atom();
      }
      return v;
    }
    function sum() {
      let v = product();
      while (tokens[i] === "+" || tokens[i] === "-") {
        const op = tokens[i++],
          right = product();
        v = op === "+" ? v + right : v - right;
      }
      return v;
    }
    const v = sum();
    if (i !== tokens.length) throw Error(`Unexpected token ${tokens[i]}`);
    if (!Number.isFinite(v)) throw Error("Value is too large");
    return v;
  }
  function analyze(rows) {
    const env = new Map(),
      seen = new Set(),
      values = new Map(),
      errors = [];
    for (const row of rows) {
      let value = null,
        problem = "";
      try {
        value = arithmetic(row.e, env);
      } catch (e) {
        problem = e.message;
      }
      if (!row.result) {
        if (!/^[A-Za-z_]\w*$/.test(row.p))
          problem = problem || "A binding name is needed";
        else if (seen.has(row.p))
          problem = problem || `Duplicate binding ${row.p}`;
        else seen.add(row.p);
        if (/^[A-Za-z_]\w*$/.test(row.p)) env.set(row.p, value);
      }
      values.set(row.id, { value, problem });
      if (problem) errors.push(`${row.p || "New row"}: ${problem}`);
    }
    return { values, errors };
  }
  function initRows() {
    const root = $("#row-lab"),
      program = $(".row-program", root);
    let rows = [
      { id: "n", p: "n", e: "3" },
      { id: "twice", p: "twice", e: "n * 2" },
      { id: "bonus", p: "bonus", e: "4" },
      { id: "total", p: "total", e: "twice + bonus" },
      { id: "result", p: "result", e: "total", result: true },
    ];
    const initial = copy(rows);
    let history = [],
      serial = 0,
      selected = "n",
      dragStyle = "slot",
      session = null,
      pendingDrag = null,
      activeCell = null;
    const nodes = new Map();
    let controls;
    const undo = $("[data-action=undo]", root);
    const source = $(".row-source", root);
    function syncCellAccess() {
      const armed = controls?.active();
      for (const n of nodes.values()) {
        for (const cell of $$("input,.value", n)) {
          const locked = armed && cell !== activeCell;
          cell.classList.toggle("cell-active", cell === activeCell);
          cell.classList.toggle("cell-locked", !!locked);
          if (cell.tagName === "INPUT") cell.readOnly = !!locked;
          else cell.title = locked ? "" : cell.dataset.problem || "";
        }
      }
    }
    function selectRow(id) {
      selected = id;
      for (const [key, n] of nodes) n.classList.toggle("focused", key === id);
    }
    function activateCell(cell, select = false) {
      if (!cell) return;
      if (session || pendingDrag) cancel();
      activeCell = cell;
      syncCellAccess();
      cell.focus({ preventScroll: true });
      if (select) {
        if (cell.tagName === "INPUT") cell.select();
        else {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const selection = getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
    function focusRow(id, part = "expression") {
      selected = id;
      const row = nodes.get(id);
      if (!row) return;
      if (part === "row") row.focus({ preventScroll: true });
      else activateCell($(`.${part}`, row));
    }
    function placeDraggedRow(rect) {
      const s = session;
      if (!s?.pointer || !s.began || dragStyle !== "float") return;
      const n = nodes.get(s.id);
      // This is the real row. Its normal-flow slot is the placeholder; only its
      // painted position follows the pointer, without a tween or a name proxy.
      if (!rect) {
        n.getAnimations().forEach((a) => a.cancel());
        n.style.transform = "";
        rect = n.getBoundingClientRect();
      }
      n.classList.add("dragging");
      n.style.transform = `translate(${s.x - s.grabX - rect.left}px, ${s.y - s.grabY - rect.top}px)`;
    }
    function render(shown = rows, animate = true) {
      const focused = document.activeElement;
      const focusedRow = focused?.classList.contains("edit-row")
        ? focused.dataset.id
        : null;
      const focusInfo = focused?.dataset.field
        ? {
            id: focused.closest(".edit-row").dataset.id,
            field: focused.dataset.field,
            start: focused.selectionStart,
            end: focused.selectionEnd,
          }
        : null;
      const before = new Map(
        [...nodes].map(([id, n]) => [id, n.getBoundingClientRect()]),
      );
      // Capture the *current painted* positions before canceling in-flight
      // motion. Retargeting then starts where the user actually saw each row.
      for (const n of nodes.values()) {
        n.getAnimations().forEach((a) => a.cancel());
        n.style.transform = "";
        n.classList.remove("dragging");
      }
      program.classList.toggle("dragging-row", !!session?.began);
      $$(".gap,.comb", program).forEach((n) => n.remove());
      const analysis = analyze(shown),
        present = new Set(shown.map((r) => r.id));
      for (const [id, n] of nodes) {
        if (!present.has(id)) {
          n.remove();
          nodes.delete(id);
        }
      }
      shown.forEach((row, index) => {
        let n = nodes.get(row.id);
        if (!n) {
          n = el("div", "edit-row");
          n.dataset.id = row.id;
          n.tabIndex = 0;
          n.setAttribute("role", "group");
          n.dataset.result = String(!!row.result);
          n.addEventListener("pointerdown", (e) => startPointer(e, row.id));
          n.addEventListener("keydown", (e) => rowKey(e, row.id));
          n.addEventListener("focus", () => selectRow(row.id));
          n.addEventListener("dblclick", (e) => {
            const cell = e.target.closest("input,.value");
            if (!controls.active() || !cell || cell === activeCell) return;
            e.preventDefault();
            activateCell(cell, true);
            status(
              root,
              cell.classList.contains("value")
                ? "Value selected for copying. Values are read-only."
                : "Editing this cell. Escape returns to the row.",
            );
          });
          if (row.result) n.append(el("span", "static-pattern", "result"));
          else {
            const p = el("input", "pattern");
            p.placeholder = "□";
            p.dataset.field = "pattern";
            p.spellcheck = false;
            p.autocomplete = "off";
            p.setAttribute("aria-label", `Binding ${row.p || "new row"}`);
            n.append(p);
          }
          const expression = el("input", "expression");
          expression.dataset.field = "expression";
          expression.placeholder = "□";
          expression.spellcheck = false;
          expression.autocomplete = "off";
          const value = el("span", "value");
          value.tabIndex = 0;
          n.append(expression, value);
          $$("input,.value", n).forEach((cell) => {
            cell.addEventListener("focus", () => {
              activeCell = cell;
              selectRow(row.id);
              syncCellAccess();
            });
          });
          $$("input", n).forEach((input) => {
            input.addEventListener("input", () => {
              if (session || pendingDrag)
                cancel("The edit canceled the movement preview.");
              const base = copy(rows);
              const current = rows.find((r) => r.id === row.id);
              if (!current) return;
              current[input.dataset.field === "pattern" ? "p" : "e"] =
                input.value;
              history.push(base);
              render();
              status(
                root,
                analyze(rows).errors[0] || "Arithmetic values updated.",
                analyze(rows).errors.length > 0,
              );
            });
          });
          nodes.set(row.id, n);
        }
        n.dataset.index = index;
        n.setAttribute("aria-label", `${row.p || "New binding"} row`);
        n.dataset.picked = String(session?.id === row.id);
        n.classList.toggle("focused", row.id === selected);
        const pat = $(".pattern", n);
        if (pat) {
          pat.value = row.p;
          pat.setAttribute("aria-label", `Binding ${row.p || "new row"}`);
        }
        const expression = $(".expression", n);
        expression.value = row.e;
        expression.setAttribute(
          "aria-label",
          `Expression for ${row.p || "new row"}`,
        );
        const value = analysis.values.get(row.id);
        $(".value", n).textContent = value.problem ? "?" : String(value.value);
        $(".value", n).classList.toggle("invalid", !!value.problem);
        $(".value", n).dataset.problem = value.problem;
        $(".value", n).setAttribute(
          "aria-label",
          `Value for ${row.p || "new row"}`,
        );
        program.append(n);
      });
      program.append(comb(shown.length * 22));
      // Slots precede real rows, including the terminal expression. None follow result.
      for (let i = 0; i < shown.length; i++) {
        const gap = el("button", "gap");
        gap.type = "button";
        gap.tabIndex = -1;
        gap.style.top = `${i * 22}px`;
        gap.dataset.slot = i;
        gap.setAttribute(
          "aria-label",
          `Insert before ${shown[i].p || "new row"}`,
        );
        gap.setAttribute("aria-hidden", String(!controls?.active()));
        gap.addEventListener("click", () => {
          if (!controls.active() && !session) return;
          if (session) {
            const from = session.base.findIndex((r) => r.id === session.id);
            preview(Math.min(i > from ? i - 1 : i, rows.length - 2));
            finish();
          } else insert(i);
        });
        program.append(gap);
      }
      // Finish every DOM move before measuring any destination. Measuring in
      // the append loop mistakes temporary sibling positions for the layout.
      const after = new Map(
        [...nodes].map(([id, n]) => [id, n.getBoundingClientRect()]),
      );
      for (const [id, n] of nodes) {
        if (
          session?.pointer &&
          session.began &&
          session.id === id &&
          dragStyle === "float"
        ) {
          placeDraggedRow(after.get(id));
        } else if (animate && !reduced()) {
          const old = before.get(id),
            target = after.get(id);
          const timing = { duration: 180, easing: "cubic-bezier(.2,0,0,1)" };
          if (old) {
            const dx = old.left - target.left,
              dy = old.top - target.top;
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01)
              n.animate(
                [
                  { transform: `translate(${dx}px, ${dy}px)` },
                  { transform: "none" },
                ],
                timing,
              );
          } else {
            n.animate([{ opacity: 0 }, { opacity: 1 }], timing);
          }
        }
      }
      undo.disabled = history.length === 0;
      source.textContent = shown
        .map((r) => (r.result ? r.e : `let ${r.p || "□"} = ${r.e || "□"} in`))
        .join("\n");
      syncCellAccess();
      if (focusedRow) focusRow(focusedRow, "row");
      if (focusInfo && nodes.has(focusInfo.id)) {
        const input = $(
          `[data-field=${focusInfo.field}]`,
          nodes.get(focusInfo.id),
        );
        if (input) {
          input.focus({ preventScroll: true });
          input.setSelectionRange(focusInfo.start, focusInfo.end);
        }
      }
    }
    function commit(next, message, focus = selected) {
      history.push(copy(rows));
      rows = copy(next);
      selected = focus;
      render();
      status(root, message);
    }
    function insert(index) {
      if (session || pendingDrag) cancel();
      const id = `draft${++serial}`;
      const next = copy(rows);
      next.splice(index, 0, { id, p: "", e: "" });
      commit(
        next,
        "Inserted a draft binding. Its expression is focused; this is one undoable edit.",
        id,
      );
      focusRow(id);
    }
    function cancel(message = "Canceled. Source and row order are unchanged.") {
      pendingDrag = null;
      const wasMoving = !!session;
      session = null;
      root.classList.remove("delete-preview", "delete-blocked");
      controls.latch(false);
      if (wasMoving) {
        render();
        status(root, message);
      }
    }
    function begin(id, pin = true) {
      const row = rows.find((r) => r.id === id);
      if (!row || row.result) return;
      pendingDrag = null;
      activeCell = null;
      if (pin) controls.enable();
      controls.latch(true);
      selected = id;
      session = {
        id,
        base: copy(rows),
        to: rows.findIndex((r) => r.id === id),
        candidate: copy(rows),
        allowed: true,
        pointer: false,
        began: false,
      };
      render();
      status(
        root,
        `Picked up ${row.p || "new row"}. Choose a destination; Enter drops, Escape cancels.`,
      );
    }
    function preview(to) {
      if (!session) return;
      const s = session;
      s.to = Math.max(0, Math.min(s.base.length - 2, to));
      const next = copy(s.base);
      const from = next.findIndex((r) => r.id === s.id);
      const [moving] = next.splice(from, 1);
      next.splice(s.to, 0, moving);
      // Empty draft rows introduce no names or uses. Keep their holes visible,
      // but do not let them veto a move of otherwise independent bindings.
      const withoutDrafts = (rs) =>
        rs.filter((r) => r.result || r.p.trim() || r.e.trim());
      const oldErrors = analyze(withoutDrafts(s.base)).errors,
        newErrors = analyze(withoutDrafts(next)).errors;
      const reason = oldErrors[0] || newErrors[0];
      s.allowed = settings.policy === "free" || !reason;
      s.candidate = next;
      render(s.allowed ? next : s.base);
      const gap = $(`.gap[data-slot="${s.to}"]`, program);
      if (gap) {
        gap.classList.add("destination");
        gap.classList.toggle("blocked", !s.allowed);
      }
      status(
        root,
        !s.allowed
          ? `Blocked: ${reason}. Choose another destination or cancel.`
          : newErrors.length
            ? `Free edit preview — ${newErrors[0]}. Drop to apply.`
            : `Preview: ${moving.p || "new row"} at position ${s.to + 1}. Drop commits one edit.`,
        !s.allowed || newErrors.length > 0,
      );
    }
    function finish() {
      if (!session) return;
      const s = session;
      if (s.outside) {
        const id = s.id;
        cancel();
        deleteRow(id);
        return;
      }
      root.classList.remove("delete-preview", "delete-blocked");
      if (!s.allowed) {
        cancel(
          "Move refused. The dependency-breaking candidate was not applied.",
        );
        return;
      }
      const moved = JSON.stringify(rows) !== JSON.stringify(s.candidate);
      session = null;
      controls.latch(false);
      if (moved) {
        const errors = analyze(s.candidate).errors;
        commit(
          s.candidate,
          errors.length && settings.policy === "free"
            ? `Moved in Free edit. ${errors[0]}`
            : "Moved the row. One Undo restores the original order.",
          s.id,
        );
        status(
          root,
          $(".lab-status", root).textContent,
          errors.length > 0 && settings.policy === "free",
        );
      } else {
        render();
        status(root, "No change to the row order.");
      }
      focusRow(s.id, "row");
    }
    function startPointer(e, id) {
      if (e.button !== 0 || (!controls.active() && !session)) return;
      const cell = e.target.closest("input,.value");
      if (cell && cell === activeCell) return;
      e.preventDefault();
      getSelection()?.removeAllRanges();
      if (session) cancel();
      focusRow(id, "row");
      // A click selects; it does not pick up or mutate the DOM. This leaves the
      // browser's double-click sequence intact for activating a locked cell.
      if (rows.find((r) => r.id === id)?.result) return;
      const rect = nodes.get(id).getBoundingClientRect();
      pendingDrag = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        pickupOffset: rect.top - program.getBoundingClientRect().top,
      };
      controls.latch(true);
    }
    window.addEventListener("pointermove", (e) => {
      if (pendingDrag) {
        const p = pendingDrag;
        if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 5) return;
        pendingDrag = null;
        begin(p.id, false);
        Object.assign(session, p, { pointer: true });
      }
      const s = session;
      if (!s?.pointer) return;
      const delta = e.clientY - s.startY;
      if (!s.began && Math.hypot(e.clientX - s.startX, delta) < 5) return;
      if (!s.began) {
        s.began = true;
        program.classList.add("dragging-row");
      }
      s.x = e.clientX;
      s.y = e.clientY;
      const wasOutside = s.outside;
      s.outside = outsideCanvas(root, { x: s.x, y: s.y });
      root.classList.toggle("delete-preview", s.outside);
      root.classList.toggle("delete-blocked", s.outside && !canDelete(s.id));
      if (s.outside) {
        placeDraggedRow();
        status(
          root,
          canDelete(s.id)
            ? "Release outside the canvas to delete this row. Escape cancels."
            : "Deletion blocked: a populated row requires Free edit. Return to the canvas or cancel.",
          !canDelete(s.id),
        );
        return;
      }
      const to = Math.max(
        0,
        Math.min(s.base.length - 2, Math.round((s.pickupOffset + delta) / 22)),
      );
      if (to !== s.to || wasOutside) preview(to);
      else placeDraggedRow();
    });
    window.addEventListener("pointerup", (e) => {
      if (pendingDrag) {
        pendingDrag = null;
        controls.latch(false);
      }
      if (!session?.pointer) return;
      session.outside = outsideCanvas(root, { x: e.clientX, y: e.clientY });
      if (session.began) finish();
      else session.pointer = false;
    });
    window.addEventListener("pointercancel", () => cancel());
    window.addEventListener("blur", () => cancel());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (session || pendingDrag)) {
        e.preventDefault();
        const id = session?.id || pendingDrag.id;
        cancel();
        focusRow(id, "row");
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancel();
    });
    function rowKey(e, id) {
      if (
        e.target !== e.currentTarget ||
        e.isComposing ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (e.key === "F2" || (e.key === "Enter" && !session)) {
        e.preventDefault();
        activateCell(
          $(e.shiftKey ? ".pattern" : ".expression", nodes.get(id)),
          true,
        );
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (session) finish();
        else begin(id);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        if (session) preview(session.to + d);
        else {
          const i = rows.findIndex((r) => r.id === id);
          focusRow(
            rows[Math.max(0, Math.min(rows.length - 1, i + d))].id,
            "row",
          );
        }
      }
    }
    root.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const row = rows.find((r) => r.id === selected);
      const forceDelete = primary(e) && e.shiftKey && e.key === "Backspace";
      const emptyDelete =
        e.key === "Backspace" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        row &&
        !row.p.trim() &&
        !row.e.trim();
      if ((forceDelete || emptyDelete) && e.target.closest(".edit-row")) {
        e.preventDefault();
        deleteRow(selected);
        return;
      }
      if (e.key === "Escape" && session) {
        e.preventDefault();
        const id = session.id;
        cancel();
        focusRow(id, "row");
      } else if (e.key === "Escape" && activeCell) {
        e.preventDefault();
        const id = activeCell.closest(".edit-row").dataset.id;
        activeCell = null;
        syncCellAccess();
        getSelection()?.removeAllRanges();
        focusRow(id, "row");
      } else if (primary(e) && e.key === "Enter") {
        e.preventDefault();
        const i = rows.findIndex((r) => r.id === selected);
        insert(Math.min(rows.length - 1, i + (e.shiftKey ? 0 : 1)));
      } else if (primary(e) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoAction();
      }
    });
    function canDelete(id) {
      const row = rows.find((r) => r.id === id);
      return (
        row &&
        !row.result &&
        (settings.policy === "free" || (!row.p.trim() && !row.e.trim()))
      );
    }
    function deleteRow(id) {
      if (session || pendingDrag) cancel();
      if (!canDelete(id)) {
        status(
          root,
          "Deletion blocked: populated rows require Free edit. The result row cannot be removed.",
          true,
        );
        return;
      }
      const index = rows.findIndex((r) => r.id === id);
      const next = rows.filter((r) => r.id !== id);
      const focus = next[Math.min(index, next.length - 1)].id;
      activeCell = null;
      commit(
        next,
        "Deleted the row. One Undo restores it and its contents.",
        focus,
      );
      focusRow(focus, "row");
    }
    function undoAction() {
      if (session || pendingDrag) cancel();
      if (history.length) {
        rows = history.pop();
        selected = rows.some((r) => r.id === selected) ? selected : rows[0].id;
        render();
        status(root, "Undid one edit.");
        focusRow(selected, controls.active() ? "row" : "expression");
      }
    }
    undo.addEventListener("click", undoAction);
    $("[data-action=reset]", root).addEventListener("click", () => {
      cancel();
      commit(
        initial,
        "Restored the starting example. Reset can also be undone.",
        "n",
      );
    });
    document.addEventListener("cancel-gesture", () => cancel());
    document.addEventListener("study-settings", () =>
      status(
        root,
        settings.policy === "free"
          ? "Free edit: moves and deletions may change meaning or introduce errors."
          : "Checked row moves and empty-draft cleanup. Populated row deletion requires Free edit.",
      ),
    );
    $$("[data-row-drag]", root).forEach((b) =>
      b.addEventListener("click", () => {
        cancel();
        dragStyle = b.dataset.rowDrag;
        $$("[data-row-drag]", root).forEach((n) =>
          n.setAttribute("aria-pressed", String(n === b)),
        );
        root.dataset.rowDrag = dragStyle;
        status(
          root,
          dragStyle === "slot"
            ? "Slot: the row stays aligned in the nearest permitted position."
            : "Float: the row follows the pointer freely.",
        );
      }),
    );
    root.dataset.rowDrag = dragStyle;
    // Mouse activation is gated by double-click; Tab/Enter/F2 remain keyboard
    // equivalents. Leaving a cell ends its temporary text-selection/edit mode.
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (activeCell && !activeCell.contains(e.target)) {
          activeCell = null;
          syncCellAccess();
        }
      },
      true,
    );
    document.addEventListener(
      "focusin",
      (e) => {
        if (activeCell && e.target !== activeCell) {
          activeCell = null;
          syncCellAccess();
        }
      },
      true,
    );
    controls = mode(root, (active) => {
      // Holding Option while already editing must not steal that cell's text
      // input or word-navigation chords. Clicking the mode button leaves the
      // cell first, so an explicit mode change starts with rows locked.
      if (active && activeCell !== document.activeElement) activeCell = null;
      syncCellAccess();
      $$(".gap", program).forEach((g) =>
        g.setAttribute("aria-hidden", String(!active)),
      );
    });
    render(rows, false);
  }
  function initReferences() {
    const root = $("#reference-lab"),
      program = $(".reference-program", root);
    const bindings = [
      { id: "width-binding", name: "width", value: 6 },
      { id: "height-binding", name: "height", value: 4 },
    ];
    let slots = [null, null],
      history = [],
      picked = null,
      originSlot = null,
      drag = null,
      hovered = null,
      aimed = null,
      freePoint = null,
      landing = null,
      landingTimer = 0,
      suppressClick = false,
      suspended = false,
      controls;
    const hoverOption = $("[data-hover-links]", root);
    const names = new Map(),
      holes = [];
    const wire = new FurlReferenceWire(program);
    const floating = el("span", "reference-floating");
    floating.setAttribute("aria-hidden", "true");
    document.body.append(floating);
    const token = (text) => el("span", "ref-token", text);
    const valueCell = (text) => {
      const n = el("span", "ref-value");
      n.append(token(text));
      return n;
    };
    const result = valueCell("?");
    for (const b of bindings) {
      const row = el("div", "reference-row"),
        name = el("button", "ref-name");
      name.type = "button";
      name.dataset.binder = b.id;
      name.setAttribute("aria-label", `Use ${b.name}`);
      name.append(token(b.name));
      name.addEventListener("click", (e) => {
        if (!controls.active() || suppressClick) return;
        pick(b.id, e.detail ? { x: e.clientX, y: e.clientY } : null);
      });
      name.addEventListener("pointerdown", (e) => {
        if (e.button || !controls.active() || picked) return;
        e.preventDefault();
        name.focus({ preventScroll: true });
        clearLanding();
        originSlot = null;
        wire.clear();
        drag = {
          id: b.id,
          origin: null,
          x: e.clientX,
          y: e.clientY,
          moved: false,
        };
        controls.latch(true);
      });
      names.set(b.id, name);
      row.append(name, token(String(b.value)), valueCell(String(b.value)));
      program.append(row);
    }
    const row = el("div", "reference-row"),
      pattern = el("span", "ref-name");
    pattern.append(token("area"));
    const expression = el("span", "reference-expression");
    for (let i = 0; i < 2; i++) {
      if (i) expression.append(token(" * "));
      const hole = el("button", "hole");
      hole.type = "button";
      hole.dataset.hole = i;
      hole.append(token("□"));
      hole.addEventListener("pointerdown", (e) => {
        if (e.button || !controls.active() || !slots[i] || picked) return;
        e.preventDefault();
        hole.focus({ preventScroll: true });
        clearLanding();
        wire.clear();
        drag = {
          id: slots[i],
          origin: i,
          x: e.clientX,
          y: e.clientY,
          moved: false,
        };
        controls.latch(true);
      });
      hole.addEventListener("click", () => {
        if (suppressClick) return;
        if (picked) place(i);
        else if (controls.active())
          status(
            root,
            slots[i]
              ? "Drag this use to move or unplug it. Backspace removes it in Free edit."
              : "Choose a binding first.",
          );
      });
      hole.addEventListener("pointerenter", () => {
        hovered = i;
        updateLink();
      });
      hole.addEventListener("pointerleave", () => {
        if (hovered === i) hovered = null;
        updateLink();
      });
      hole.addEventListener("focus", () => {
        if (picked) aimed = i;
        updateLink();
      });
      hole.addEventListener("blur", () => {
        if (aimed === i && !drag) aimed = null;
        // focus-visible updates after the focus event sequence finishes.
        queueMicrotask(updateLink);
      });
      holes.push(hole);
      expression.append(hole);
    }
    row.append(pattern, expression, result);
    program.append(row, comb(66));
    function updateLink() {
      if (suspended) {
        wire.clear();
        return;
      }
      if (wire.retracting) return;
      let id, target, kind;
      if (picked) {
        id = picked;
        target =
          originSlot !== null && drag?.moved
            ? floating
            : aimed === null
              ? null
              : holes[aimed];
        kind = "drag";
      } else if (landing !== null) {
        id = slots[landing];
        target = holes[landing];
        kind = "landing";
      } else if (hoverOption.checked) {
        const focused = holes.findIndex((n) => n.matches(":focus-visible"));
        const index =
          hovered !== null ? hovered : focused >= 0 ? focused : null;
        if (index !== null) {
          id = slots[index];
          target = holes[index];
          kind = "hover";
        }
      }
      if (!id) {
        wire.clear();
        return;
      }
      wire.set({
        source: names.get(id),
        target,
        pointer: freePoint,
        style: "wire",
        anchor: "center",
        kind,
      });
    }
    function clearLanding() {
      clearTimeout(landingTimer);
      landingTimer = 0;
      landing = null;
    }
    function render() {
      for (const b of bindings) {
        const name = names.get(b.id);
        name.disabled = !controls?.active();
        name.classList.toggle("picked", picked === b.id);
      }
      holes.forEach((hole, i) => {
        const b = bindings.find((b) => b.id === slots[i]);
        const word = $(".ref-token", hole);
        if (word.textContent !== (b?.name || "□"))
          word.textContent = b?.name || "□";
        hole.classList.toggle("filled", !!b);
        hole.classList.toggle("target", !!picked && aimed === i);
        hole.classList.toggle("unplugging", originSlot === i && !!picked);
        // Filled references remain hoverable/focusable outside Structure mode.
        hole.disabled = !controls?.active() && !b;
        if (b) hole.dataset.reference = b.id;
        else delete hole.dataset.reference;
        hole.setAttribute(
          "aria-label",
          `${i ? "Second" : "First"} factor: ${b?.name || "empty"}`,
        );
      });
      $(".ref-token", result).textContent = slots.every(Boolean)
        ? String(
            slots.reduce(
              (v, id) => v * bindings.find((b) => b.id === id).value,
              1,
            ),
          )
        : "?";
      $("[data-action=undo]", root).disabled = !history.length;
      updateLink();
    }
    function pick(id, point = null) {
      clearLanding();
      wire.clear();
      originSlot = null;
      picked = id;
      aimed = null;
      freePoint = point;
      controls.latch(true);
      render();
      names.get(id).focus({ preventScroll: true });
      status(
        root,
        `Connect ${bindings.find((b) => b.id === id).name} to a factor, or click elsewhere to retract the cable. Escape also cancels.`,
      );
    }
    function place(index) {
      if (!picked) return;
      const changesSource = originSlot !== null && originSlot !== index;
      const changed = slots[index] !== picked || changesSource;
      const permitted =
        !changed ||
        settings.policy === "free" ||
        (settings.policy === "refine" && originSlot === null && !slots[index]);
      if (!permitted) {
        cancel();
        status(
          root,
          settings.policy === "refactor"
            ? "Refactor blocks creating a use. Choose Refine to fill an empty hole."
            : "Refine only fills empty holes. Replacing or moving a use requires Free edit.",
          true,
        );
        return;
      }
      const hole = holes[index],
        previousWidth = hole.getBoundingClientRect().width;
      if (changed) {
        history.push([...slots]);
        if (changesSource) slots[originSlot] = null;
        slots[index] = picked;
      }
      clearLanding();
      landing = index;
      picked = null;
      originSlot = null;
      drag = null;
      aimed = null;
      floating.style.display = "none";
      root.classList.remove("delete-preview", "delete-blocked");
      controls.latch(false);
      render();
      hole.focus({ preventScroll: true });
      if (changed && !reduced()) {
        hole.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        const width = hole.getBoundingClientRect().width;
        const timing = { duration: 180, easing: "cubic-bezier(.2,0,0,1)" };
        hole.animate(
          [{ width: `${previousWidth}px` }, { width: `${width}px` }],
          timing,
        );
        $(".ref-token", hole).animate(
          [
            { opacity: 0, transform: "scaleX(.75)" },
            { opacity: 1, transform: "none" },
          ],
          timing,
        );
      }
      updateLink();
      landingTimer = setTimeout(
        () => {
          landing = null;
          updateLink();
        },
        reduced() ? 0 : 220,
      );
      status(
        root,
        !changed
          ? "That factor already refers to this binding."
          : slots.every(Boolean)
            ? "Both uses are in place. Hover a reference to see its binding; area has a value."
            : "Connected. The reference opened in the hole; its binding stayed in place.",
      );
    }
    function aimAt(e) {
      freePoint = { x: e.clientX, y: e.clientY };
      if (originSlot !== null && drag?.moved) {
        floating.style.display = "block";
        floating.textContent = bindings.find((b) => b.id === picked).name;
        floating.style.left = `${e.clientX}px`;
        floating.style.top = `${e.clientY}px`;
      }
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("#reference-lab [data-hole]");
      aimed = target ? Number(target.dataset.hole) : null;
      holes.forEach((hole, i) =>
        hole.classList.toggle("target", !!picked && aimed === i),
      );
      const unplug = originSlot !== null && aimed === null && !!drag?.moved;
      root.classList.toggle("delete-preview", unplug);
      root.classList.toggle(
        "delete-blocked",
        unplug && settings.policy !== "free",
      );
      if (unplug)
        status(
          root,
          settings.policy === "free"
            ? "Release here to unplug this use; the binding stays. Escape cancels."
            : "Unplugging requires Free edit. Return to a factor or press Escape.",
          settings.policy !== "free",
        );
      else if (originSlot !== null && aimed !== null)
        status(
          root,
          aimed === originSlot
            ? "Release to keep this use in its original factor."
            : settings.policy === "free"
              ? "Release to move this use to the highlighted factor."
              : "Moving a use requires Free edit. Return to its original factor or press Escape.",
          aimed !== originSlot && settings.policy !== "free",
        );
      else if (originSlot !== null)
        status(
          root,
          "Click here to cancel the pickup and retract the cable. The original use stays in place.",
        );
      updateLink();
    }
    window.addEventListener("pointermove", (e) => {
      if (drag) {
        if (
          !drag.moved &&
          Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5
        )
          return;
        if (!drag.moved) {
          drag.moved = true;
          picked = drag.id;
          originSlot = drag.origin;
          controls.latch(true);
          render();
        }
      }
      if (picked) aimAt(e);
    });
    window.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const moved = drag.moved;
      if (moved) {
        aimAt(e);
        if (aimed !== null) place(aimed);
        else if (originSlot !== null) removeUse(originSlot, freePoint);
        else cancelWithRetraction(freePoint);
        // A completed drag must not also fire a binder/hole click.
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      } else {
        drag = null;
        controls.latch(false);
      }
    });
    // Capture before binder/control handlers: the initiating click runs before
    // there is a pickup, but the next non-target click dismisses that pickup
    // instead of starting another cable or activating an unrelated control.
    document.addEventListener(
      "click",
      (e) => {
        if (
          !picked ||
          suppressClick ||
          drag?.moved ||
          e.button !== 0 ||
          e.target.closest("#reference-lab [data-hole]")
        )
          return;
        const point = e.detail
          ? { x: e.clientX, y: e.clientY }
          : freePoint ||
            wire.anchor(
              aimed === null ? names.get(picked) : holes[aimed],
              { left: 0, top: 0 },
              false,
            );
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelWithRetraction(point);
      },
      true,
    );
    function clearPickup() {
      clearLanding();
      drag = null;
      picked = null;
      originSlot = null;
      aimed = null;
      freePoint = null;
      hovered = null;
      floating.style.display = "none";
      root.classList.remove("delete-preview", "delete-blocked");
      controls.latch(false);
    }
    function cancel() {
      wire.clear();
      clearPickup();
      render();
      status(root, "Canceled. Bindings and references are unchanged.");
    }
    function cancelWithRetraction(point) {
      if (!picked) {
        cancel();
        return;
      }
      wire.retract(names.get(picked), point);
      clearPickup();
      render();
      status(
        root,
        "Canceled the connection. Bindings and references are unchanged.",
      );
    }
    function removeUse(index, point = null) {
      const id = slots[index];
      if (!id) return;
      if (settings.policy !== "free") {
        cancel();
        status(
          root,
          "Unplugging removes information and requires Free edit.",
          true,
        );
        return;
      }
      const rect = $(".ref-token", holes[index]).getBoundingClientRect();
      const endpoint = point || {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      // Keep the source intact throughout pickup. Removal is one transaction
      // at release; Escape, refused drops and tool changes cannot lose the use.
      history.push([...slots]);
      slots[index] = null;
      clearLanding();
      drag = null;
      picked = null;
      originSlot = null;
      aimed = null;
      hovered = null;
      freePoint = null;
      floating.style.display = "none";
      root.classList.remove("delete-preview", "delete-blocked");
      controls.latch(false);
      wire.retract(names.get(id), endpoint);
      render();
      status(
        root,
        "Unplugged this use, leaving a hole. The binding remains; Undo reconnects it.",
      );
    }
    root.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const hole = e.target.closest("[data-hole]");
      if (
        hole &&
        controls.active() &&
        (e.key === "Backspace" || e.key === "Delete") &&
        !e.altKey
      ) {
        e.preventDefault();
        removeUse(Number(hole.dataset.hole));
        return;
      }
      if (
        hole &&
        controls.active() &&
        e.key === " " &&
        slots[Number(hole.dataset.hole)] &&
        !picked
      ) {
        e.preventDefault();
        const index = Number(hole.dataset.hole);
        pick(slots[index]);
        originSlot = index;
        holes[index].focus({ preventScroll: true });
        render();
        status(
          root,
          "Picked up this use. Tab to another factor and Enter to move; Escape cancels.",
        );
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      if (primary(e) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    });
    document.addEventListener("keydown", (e) => {
      // Keyboard destination picking may Tab beyond this example's controls.
      if (e.key === "Escape" && (picked || drag)) {
        e.preventDefault();
        cancel();
      }
    });
    window.addEventListener("pointercancel", () => {
      if (drag || picked) cancel();
    });
    window.addEventListener("blur", () => {
      suspended = true;
      if (drag || picked) cancel();
      else wire.clear();
    });
    window.addEventListener("focus", () => {
      suspended = false;
      updateLink();
    });
    document.addEventListener("visibilitychange", () => {
      suspended = document.hidden;
      if (suspended && (drag || picked)) cancel();
      else updateLink();
    });
    root.addEventListener("pointerleave", () => {
      hovered = null;
      updateLink();
    });
    window.addEventListener("scroll", () => wire.request(), true);
    new ResizeObserver(() => wire.request()).observe(program);
    function undo() {
      wire.clear();
      if (drag || picked) cancel();
      clearLanding();
      holes.forEach((n) =>
        n.getAnimations({ subtree: true }).forEach((a) => a.cancel()),
      );
      if (history.length) {
        slots = history.pop();
        render();
        status(root, "Undid one reference edit.");
      }
    }
    $("[data-action=undo]", root).addEventListener("click", undo);
    $("[data-action=reset]", root).addEventListener("click", () => {
      cancel();
      holes.forEach((n) =>
        n.getAnimations({ subtree: true }).forEach((a) => a.cancel()),
      );
      history.push([...slots]);
      slots = [null, null];
      render();
      status(root, "The two factors are empty again.");
    });
    hoverOption.addEventListener("change", updateLink);
    document.addEventListener("cancel-gesture", cancel);
    document.addEventListener("study-settings", () =>
      status(
        root,
        settings.policy === "refactor"
          ? "Refactor: creating, replacing and unplugging uses are blocked."
          : settings.policy === "refine"
            ? "Refine: fill empty factors. Choose Free edit to move, replace or unplug uses."
            : "Free edit: fill, replace, move or unplug a use. Its binding always stays.",
      ),
    );
    controls = mode(root, (active) => {
      if (!active && !drag) picked = null;
      render();
    });
    render();
  }
  function initStories() {
    const root = $("#story-lab"),
      choice = $("#story-choice"),
      program = $(".story-program", root);
    let story = FURL_INTERACTION_STORIES[0],
      step = 0;
    const nodes = new Map();
    for (const s of FURL_INTERACTION_STORIES) {
      const option = el("option", "", s.title);
      option.value = s.id;
      choice.append(option);
    }
    function render() {
      const state = step ? story.after : story.before;
      const maxRows = Math.max(
        story.before.rows.length,
        story.after.rows.length,
        5,
      );
      const lanes = story.before.lanes || story.after.lanes || 1;
      program.dataset.lanes = lanes;
      program.style.minWidth = lanes === 2 ? "980px" : "760px";
      program.style.height = `${maxRows * 22}px`;
      const laneWidth = lanes === 2 ? 470 : 0;
      const present = new Set();
      state.rows.forEach((r, index) => {
        const [id, p, e, v, lane = 0, slot = index] = r;
        present.add(id);
        let row = nodes.get(id);
        if (!row) {
          row = el("div", "story-row");
          row.dataset.storyRow = id;
          row.append(el("span", "p"), el("span", "e"), el("span", "v"));
          program.append(row);
          nodes.set(id, row);
        }
        $(".p", row).textContent = p;
        $(".e", row).textContent = e;
        $(".e", row).classList.toggle("parameter", e === "·");
        $(".v", row).textContent = v;
        row.style.transform = `translate(${lane * laneWidth}px, ${slot * 22}px)`;
        row.style.opacity = "1";
        row.setAttribute("aria-hidden", "false");
      });
      for (const [id, row] of nodes)
        if (!present.has(id)) {
          row.style.opacity = "0";
          row.setAttribute("aria-hidden", "true");
        }
      $(".story-combs", program)?.remove();
      const svg = document.createElementNS(svgNS, "svg");
      svg.classList.add("story-combs");
      svg.setAttribute("aria-hidden", "true");
      function path(d) {
        const p = document.createElementNS(svgNS, "path");
        p.setAttribute("d", d);
        svg.append(p);
      }
      for (const [start, end, depth, parameterEnd] of state.scopes) {
        const x = 29 + depth * 10,
          y = start * 22 + 2;
        path(
          `M ${x + 5} ${y} Q ${x} ${y} ${x} ${y + 6} L ${x} ${end * 22 - 2}`,
        );
        if (parameterEnd !== undefined)
          path(`M ${x} ${parameterEnd * 22} H ${x + 6}`);
      }
      if (state.fork) {
        path(
          `M 39 22 C 39 16 43 16 48 16 H ${laneWidth + 34} Q ${laneWidth + 39} 16 ${laneWidth + 39} 22 V 64`,
        );
      }
      program.prepend(svg);
      program.setAttribute(
        "aria-label",
        `${story.title}. ${step ? "After" : "Before"}. ${state.rows.map((r) => `${r[1]}: ${r[2]}`).join("; ")}`,
      );
      $(".story-status", root).textContent = step
        ? story.message
        : "Before the proposed operation. Choose After to inspect the change.";
      $(".story-status", root).classList.toggle(
        "warn",
        step === 1 && story.id === "resize",
      );
      $(".story-mouse").replaceChildren(
        el("strong", "", "Mouse"),
        document.createTextNode(` · ${story.mouse}`),
      );
      $(".story-keyboard").replaceChildren(
        el("strong", "", "Keyboard"),
        document.createTextNode(` · ${story.keyboard}`),
      );
      $(".story-rule").textContent = story.rule;
      $(".story-evidence").textContent =
        `Source: ${story.source}. Values are preset.`;
      $(".story-before", root).textContent = story.codeBefore;
      $(".story-after", root).textContent = story.codeAfter;
      $$("[data-step]", root).forEach((b) =>
        b.setAttribute("aria-pressed", String(Number(b.dataset.step) === step)),
      );
    }
    choice.addEventListener("change", () => {
      story = FURL_INTERACTION_STORIES.find((s) => s.id === choice.value);
      step = 0;
      nodes.forEach((n) => n.remove());
      nodes.clear();
      render();
    });
    $$("[data-story]").forEach((link) =>
      link.addEventListener("click", () => {
        choice.value = link.dataset.story;
        choice.dispatchEvent(new Event("change"));
      }),
    );
    $$("[data-step]", root).forEach((b) =>
      b.addEventListener("click", () => {
        step = Number(b.dataset.step);
        render();
      }),
    );
    $("#motion").checked = !reduced();
    $("#motion").addEventListener("change", () =>
      root.classList.toggle("no-motion", !$("#motion").checked),
    );
    render();
  }
  function initInventory() {
    const search = $("#inventory-search"),
      origin = $("#inventory-origin"),
      stage = $("#inventory-stage"),
      groups = $$("#inventory .inventory-stage"),
      rows = $$("#inventory [data-action-id]");
    function filter() {
      const q = search.value.trim().toLowerCase();
      let count = 0;
      rows.forEach((row) => {
        row.hidden = !(
          row.textContent.toLowerCase().includes(q) &&
          (!origin.value || row.dataset.origin === origin.value) &&
          (!stage.value || row.dataset.stage === stage.value)
        );
        if (!row.hidden) count++;
      });
      $("#inventory-count").textContent = `${count} of ${rows.length} actions`;
      groups.forEach((group) => {
        const children = $$("[data-action-id]", group);
        const visible = children.filter((row) => !row.hidden).length;
        group.hidden = visible === 0;
        $(".stage-count", group).textContent =
          visible === children.length
            ? `${visible} actions`
            : `${visible} of ${children.length} actions`;
        if (visible && (q || origin.value || stage.value)) group.open = true;
      });
      $("#inventory-empty").hidden = count !== 0;
    }
    search.addEventListener("input", filter);
    origin.addEventListener("change", filter);
    stage.addEventListener("change", filter);
    $("[data-clear-inventory]").addEventListener("click", () => {
      search.value = origin.value = stage.value = "";
      filter();
    });
    function revealHash() {
      const target = document.getElementById(location.hash.slice(1));
      const group = target?.closest(".inventory-stage");
      if (!group) return;
      if (group.hidden || target.hidden) {
        search.value = origin.value = stage.value = "";
        filter();
      }
      group.open = true;
      target.scrollIntoView({ block: "start" });
    }
    $$("[data-stage-link]").forEach((link) =>
      link.addEventListener("click", () => {
        search.value = origin.value = "";
        stage.value = "";
        filter();
        $(`#inventory-${link.dataset.stageLink}`).open = true;
      }),
    );
    window.addEventListener("hashchange", revealHash);
    filter();
    revealHash();
  }
  initRows();
  initReferences();
  initStories();
  initInventory();
})();
