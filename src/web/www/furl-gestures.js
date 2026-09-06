/* Furl's provisional input surface. Source identities, eligibility and edits
 * come exclusively from FurlGestures/FurlDocument. This file never parses code. */
(() => {
  const $ = (s, n = document) => n.querySelector(s);
  const $$ = (s, n = document) => [...n.querySelectorAll(s)];
  const rect = (n) => n.getBoundingClientRect();
  const inside = (r, p) =>
    p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  const paths = {
    edit: "M8 3h8M12 3v18M8 21h8M4 8v8M2 8h4M2 16h4",
    rows: "M3 5h11M3 12h11M3 19h11M19 4v16m-3-13 3-3 3 3m-6 10 3 3 3-3",
    connect:
      "M5 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4M19 16a2 2 0 1 0 0 4a2 2 0 1 0 0-4M7 6c15-4-14 17 10 12",
    refactor: "M4 8h16M4 16h16",
    refine: "M4 5v14h16M4 11h13m-3-3 3 3-3 3",
    free: "m4 16 11-11 4 4L8 20H4v-4Zm9-9 4 4",
    slot: "M3 5h18M3 19h18M4 10h16v4H4z",
    float: "M3 5h10M3 19h10m-2-9 9-3 2 6-9 3z",
    links:
      "M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12ZM12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4",
    motion: "M2 7h7M2 12h4M2 17h7M14 6l7 6-7 6V6Z",
    zen: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
  };
  window.createFurlGestures = (root) => {
    const program = $(".furl-program", root),
      overlay = $(".furl-gesture-overlay", root);
    const tools = $(".furl-gesture-tools", root),
      status = $(".furl-gesture-status", root);
    const ac = new AbortController(),
      signal = ac.signal;
    const wire = new FurlReferenceWire($(".furl-wire-layer", root));
    // Native Hazel measurements already identify each word's exact bounds.
    wire.anchor = (node, origin) => {
      const r = rect(node);
      return {
        x: r.left + r.width / 2 - origin.left,
        y: r.top + r.height / 2 - origin.top,
      };
    };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let mode = "edit",
      policy = "refine",
      style = "slot",
      links = true,
      motion = true;
    let held = false,
      pointer = { x: 0, y: 0 },
      activeCell = null,
      pending = null,
      drag = null,
      connection = null;
    let data = null,
      query,
      dispatch,
      layoutFrame = 0,
      gapNodes = [],
      positions = null,
      committing = false,
      commitKind = "",
      opening = null;
    let blockedClick = false,
      transactionRevision = null,
      lastLayout = "",
      lastRaw = "",
      destroyed = false;
    wire.motion = {
      get matches() {
        return !motion || media.matches;
      },
    };
    const animate = (n, frames, options = {}) =>
      !motion || media.matches
        ? null
        : n.animate(frames, {
            duration: 180,
            easing: "cubic-bezier(.2,0,0,1)",
            ...options,
          });
    const on = (n, type, fn, capture = false) =>
      n.addEventListener(type, fn, { capture, signal });
    const stop = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const say = (text) => {
      status.textContent = text;
      status.hidden = !text;
    };
    const marked = () => $$(".furl-hit", root);
    const hitAt = (x, y) => marked().find((n) => inside(rect(n), { x, y }));
    const sourceNode = (binder, near = null) => {
      const candidates = marked().filter(
        (n) => n.dataset.kind === "binder" && n.dataset.id === binder,
      );
      if (near) {
        const r = rect(near);
        candidates.sort(
          (a, b) =>
            Math.hypot(rect(a).left - r.left, rect(a).top - r.top) -
            Math.hypot(rect(b).left - r.left, rect(b).top - r.top),
        );
      }
      return candidates[0];
    };
    const effectiveMode = () =>
      held && inside(rect(program), pointer)
        ? hitAt(pointer.x, pointer.y)?.dataset.binder
          ? "connect"
          : "rows"
        : mode;
    const button = (group, value, label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.dataset[group] = value;
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[value]}"/></svg>`;
      b.addEventListener("click", fn, { signal });
      tools.append(b);
      return b;
    };
    ["edit", "rows", "connect"].forEach((k) =>
      button(
        "tool",
        k,
        {
          edit: "Edit cells",
          rows: "Rows — drag anywhere; double-click to edit a cell",
          connect: "Connect — pull references from bindings",
        }[k],
        () => {
          cancel();
          mode = k;
          refreshMode();
        },
      ),
    );
    const divider = () => {
      const n = document.createElement("span");
      n.className = "furl-tool-divider";
      tools.append(n);
    };
    divider();
    ["refactor", "refine", "free"].forEach((k) =>
      button(
        "policy",
        k,
        {
          refactor: "Refactor — checked moves",
          refine: "Refine — also fill compatible holes",
          free: "Free edit — also move, replace and delete",
        }[k],
        () => {
          cancel();
          policy = k;
          refreshMode();
        },
      ),
    );
    divider();
    button(
      "variant",
      "slot",
      "Slot motion — rows stay in candidate positions",
      () => {
        cancel();
        style = "slot";
        refreshMode();
      },
    );
    button(
      "variant",
      "float",
      "Float motion — compare pointer-following rows",
      () => {
        cancel();
        style = "float";
        refreshMode();
      },
    );
    button("option", "links", "Show binding wires on hover", () => {
      links = !links;
      wire.clear();
      refreshMode();
    });
    button("option", "motion", "Animate row movement and wires", () => {
      motion = !motion;
      if (!motion) {
        wire.points = null;
        wire.request();
      }
      refreshMode();
    });
    divider();
    const zenButton = button("view", "zen", "Enter Zen mode (F9)", () =>
      zen.toggle(),
    );
    const zen = window.createFurlZen(root, zenButton, {
      beforeChange: () => {
        cancel(false);
        positions = null;
      },
      onLayout: () => {
        placeGaps();
        if (wire.connection) wire.request();
      },
    });
    tools.setAttribute("role", "toolbar");
    tools.setAttribute(
      "aria-label",
      "Provisional interaction tools and policy",
    );
    function refreshMode() {
      const selected = effectiveMode();
      root.dataset.tool = selected;
      root.dataset.policy = policy;
      $$("[data-tool]", tools).forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.tool === mode),
      );
      $$("[data-policy]", tools).forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.policy === policy),
      );
      $$("[data-variant]", tools).forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.variant === style),
      );
      $$("[data-option]", tools).forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          b.dataset.option === "links" ? links : motion,
        ),
      );
      marked().forEach((n) => (n.tabIndex = selected === "connect" ? 0 : -1));
      gapNodes.forEach(
        (n) => (n.hidden = selected !== "rows" || !!activeCell || !!connection),
      );
    }
    function request(command, commit = false) {
      try {
        return JSON.parse(
          (commit ? dispatch : query)(JSON.stringify({ ...command, policy })),
        );
      } catch {
        return {
          ok: false,
          message: "That source target is no longer available.",
        };
      }
    }
    function capture() {
      return new Map(
        $$(".furl-binding,.furl-tail,.furl-native-cell", program).map((n) => [
          identity(n),
          rect(n).toJSON(),
        ]),
      );
    }
    function identity(n) {
      return (
        n.dataset.binding ||
        (n.classList.contains("furl-tail")
          ? "tail:" + n.dataset.owner
          : n.dataset.view)
      );
    }
    function finishLayout() {
      if (destroyed) return;
      layoutFrame = 0;
      const before = positions;
      positions = null;
      syncMarkers();
      syncBoundaries();
      if (before) {
        // All VDOM changes have finished before any final geometry is measured.
        const nodes = $$(".furl-binding,.furl-tail", program);
        const final = new Map(nodes.map((n) => [n, rect(n)]));
        const displacement = (n) => {
          const old = before.get(identity(n)),
            now = final.get(n);
          return old && now
            ? { x: old.left - now.left, y: old.top - now.top }
            : { x: 0, y: 0 };
        };
        for (const n of nodes) {
          const old = before.get(identity(n));
          if (old) {
            const d = displacement(n),
              parent = n.parentElement.closest(".furl-binding,.furl-tail"),
              p = parent ? displacement(parent) : { x: 0, y: 0 };
            const dx = d.x - p.x,
              dy = d.y - p.y;
            if (Math.abs(dy) + Math.abs(dx) > 0.1)
              animate(n, [
                { transform: `translate(${dx}px,${dy}px)` },
                { transform: "none" },
              ]);
          } else animate(n, [{ opacity: 0 }, { opacity: 1 }]);
        }
      }
      if (opening) {
        const candidates = marked().filter(
          (n) =>
            n.dataset.kind === "reference" &&
            n.dataset.binder === opening.binder &&
            n.closest("[data-cell]")?.dataset.cell === opening.cell,
        );
        const target = opening.source
          ? candidates.find((n) => n.dataset.id === opening.source)
          : candidates.filter(
              (n) => !opening.previous.includes(n.dataset.id),
            )[0];
        if (target) {
          // The native source supplies the new word; reveal it and shift following tokens.
          const cell = target.closest("[data-cell]"),
            r = rect(target);
          const tokens = $$(".token", cell).filter(
            (n) =>
              rect(n).left >= r.left - 0.5 &&
              Math.abs(rect(n).top - r.top) < data.lineHeight / 2,
          );
          tokens.forEach((n) => {
            const b = rect(n);
            animate(
              n,
              b.left < r.right
                ? [
                    {
                      opacity: 0,
                      transform: "scaleX(.15)",
                      transformOrigin: "left",
                    },
                    { opacity: 1, transform: "none" },
                  ]
                : [
                    {
                      transform: `translateX(${-Math.max(0, r.width - data.pitch)}px)`,
                    },
                    { transform: "none" },
                  ],
              { duration: 210 },
            );
          });
        }
        opening = null;
      }
      if (committing) {
        committing = false;
        const editor = $("#active-code-editor", root);
        if (editor) {
          if (commitKind === "insert" || mode === "edit") {
            activate(editor.closest("[data-cell]"));
            editor.focus({ preventScroll: true });
          } else {
            activate(null);
            const member = bindingFor(editor);
            if (mode === "rows") member?.focus({ preventScroll: true });
          }
        }
      }
      refreshMode();
    }
    function syncMarkers() {
      const map = new Map(data.cells.map((c) => [c.target, c.markers]));
      $$(".furl-native-cell", root).forEach((cell) => {
        const layer = $(".furl-hit-layer", cell),
          markers = map.get(cell.dataset.cell) || [];
        const old = new Map([...layer.children].map((n) => [n.dataset.id, n]));
        for (const m of markers) {
          let n = old.get(m.id);
          old.delete(m.id);
          if (!n) {
            n = document.createElement("span");
            n.className = "furl-hit";
            n.setAttribute("role", "button");
            layer.append(n);
          }
          Object.assign(n.dataset, {
            id: m.id,
            kind: m.kind,
            binder: m.binder,
            name: m.name,
          });
          n.style.cssText = `left:${m.col * data.pitch}px;top:${m.row * data.lineHeight}px;width:${m.width * data.pitch}px;height:${data.lineHeight}px`;
          n.title =
            m.kind === "binder"
              ? `Connect ${m.name}`
              : m.kind === "hole"
                ? "Connect here"
                : `Move ${m.name}; hover to trace binding`;
          n.setAttribute("aria-label", n.title);
        }
        old.forEach((n) => n.remove());
      });
      $$(".furl-binding", program).forEach((n) => {
        n.tabIndex = 0;
        n.setAttribute("aria-label", "Binding row");
      });
    }
    function syncBoundaries() {
      const old = new Map(
        gapNodes.map((n) => [n.dataset.scope + "|" + n.dataset.before, n]),
      );
      gapNodes = [];
      const add = (scope, before, anchor) => {
        const key = scope + "|" + before;
        let n = old.get(key);
        old.delete(key);
        if (!n) {
          n = document.createElement("button");
          n.type = "button";
          n.className = "furl-gap";
          n.tabIndex = -1;
          n.setAttribute("aria-label", "Insert binding at this boundary");
          overlay.append(n);
        }
        n.dataset.scope = scope;
        n.dataset.before = before;
        n._anchor = anchor;
        gapNodes.push(n);
      };
      $$(".furl-scope", program).forEach((scope) => {
        [...scope.children]
          .filter((n) => n.matches(".furl-binding,.furl-tail"))
          .forEach((member) =>
            add(scope.dataset.scope, member.dataset.binding || "", member),
          );
      });
      // A body with no leading lets still has a real lexical insertion point.
      const emptyBodies = $$("[data-body]", program)
        .map((owner) => ({
          scope: owner.dataset.body,
          anchor: owner.classList.contains("furl-function")
            ? $(".furl-function-content", owner).lastElementChild
            : owner.lastElementChild,
        }))
        .filter((x) => !x.anchor.classList.contains("furl-scope"));
      const top = $(".furl-program-content", program).lastElementChild;
      if (top?.classList.contains("furl-row"))
        emptyBodies.push({ scope: top.dataset.expression, anchor: top });
      for (const { scope, anchor } of emptyBodies) add(scope, "", anchor);
      old.forEach((n) => n.remove());
      // Retain button identity, but keep the owned overlay in source order when
      // examples or rows change (the terminal boundary is often reused).
      gapNodes.forEach((n, i) => {
        if (overlay.children[i] !== n)
          overlay.insertBefore(n, overlay.children[i] || null);
      });
      placeGaps();
    }
    function placeGaps() {
      const clip = rect(program);
      for (const n of gapNodes) {
        const r = rect(n._anchor);
        n.style.cssText = `left:${Math.max(clip.left + 5, r.left - 14)}px;top:${r.top - 4}px;width:${Math.min(r.width + 14, clip.right - r.left + 9)}px`;
        n.style.visibility =
          r.top >= clip.top + 4 && r.top <= clip.bottom - 4
            ? "visible"
            : "hidden";
      }
    }
    function activate(cell) {
      if (activeCell) delete activeCell.dataset.cellActive;
      activeCell = cell;
      if (activeCell) activeCell.dataset.cellActive = "true";
      refreshMode();
    }
    function bindingFor(target) {
      if (target.matches(".furl-binding")) return target;
      const id = target.closest(".furl-row")?.dataset.bindingRow;
      return id
        ? $$(".furl-binding", program).find((n) => n.dataset.binding === id)
        : null;
    }
    function insertionTarget(row, above) {
      if (!row) return null;
      const owner = row.closest(".furl-scope,.furl-function,.furl-branch");
      if (owner?.matches(".furl-function,.furl-branch"))
        return {
          scope: owner.dataset.body,
          before: firstBinding(owner.dataset.body),
        };
      const binding = row.closest(".furl-binding");
      if (owner?.classList.contains("furl-scope")) {
        const members = [...owner.children].filter((n) =>
          n.classList.contains("furl-binding"),
        );
        const index = members.indexOf(binding);
        return {
          scope: owner.dataset.scope,
          before:
            index < 0
              ? ""
              : (above ? binding : members[index + 1])?.dataset.binding || "",
        };
      }
      return { scope: row.dataset.expression, before: "" };
    }
    function firstBinding(scope) {
      return (
        $$(".furl-binding", program).find((n) => n.dataset.owner === scope)
          ?.dataset.binding || ""
      );
    }
    function doCommit(command) {
      const check = request(command);
      if (!check.ok) {
        say(check.message);
        return false;
      }
      if (!check.changed) {
        say("");
        return false;
      }
      positions = capture();
      committing = true;
      commitKind = command.kind;
      transactionRevision = data.revision;
      const result = request(command, true);
      if (!result.ok) {
        positions = null;
        committing = false;
        say(result.message);
        return false;
      }
      say("");
      return true;
    }
    function clearRows(animateBack = true) {
      if (!drag) return;
      for (const member of drag.members) {
        const old = rect(member);
        member.getAnimations().forEach((a) => a.cancel());
        member.style.transform = "";
        member.removeAttribute("data-picked");
        if (animateBack) {
          const next = rect(member);
          animate(member, [
            {
              transform: `translate(${old.left - next.left}px,${old.top - next.top}px)`,
            },
            { transform: "none" },
          ]);
        }
      }
      program.classList.remove("furl-delete-preview", "furl-preview");
    }
    function cancel(retract = true) {
      pending = null;
      clearRows();
      drag = null;
      if (connection) {
        const c = connection;
        connection = null;
        c.use?.classList.remove("furl-unplugging");
        c.word?.remove();
        if (retract) wire.retract(c.anchor, pointer);
        else wire.clear();
      } else wire.clear();
      marked().forEach((n) => n.classList.remove("furl-drop-target"));
      program.classList.remove("furl-preview");
      say("");
      refreshMode();
    }
    function beginRow(member, keyboard = false, grab = pointer) {
      activate(null);
      wire.clear();
      const parent = member.parentElement,
        members = [...parent.children].filter((n) =>
          n.classList.contains("furl-binding"),
        );
      const start = new Map(members.map((n) => [n, rect(n).toJSON()]));
      members.forEach((n) => {
        n.getAnimations().forEach((a) => a.cancel());
        n.style.transform = "";
      });
      const base = new Map(members.map((n) => [n, rect(n).toJSON()]));
      const source = base.get(member);
      drag = {
        member,
        members,
        order: [...members],
        base,
        keyboard,
        index: members.indexOf(member),
        scope: member.dataset.owner,
        offset: { x: grab.x - source.left, y: grab.y - source.top },
        lastGood: members.indexOf(member),
        off: false,
        cache: new Map(),
      };
      transactionRevision = data.revision;
      member.dataset.picked = "true";
      program.classList.add("furl-preview");
      member.focus({ preventScroll: true });
      for (const n of members) {
        const old = start.get(n),
          end = base.get(n);
        if (Math.abs(old.top - end.top) > 0.1)
          animate(n, [
            { transform: `translateY(${old.top - end.top}px)` },
            { transform: "none" },
          ]);
      }
      previewRow(drag.index);
    }
    function rowCommand(index, remove = false) {
      const others = drag.members.filter((n) => n !== drag.member);
      return remove
        ? {
            kind: "delete",
            scope: drag.scope,
            id: drag.member.dataset.binding,
            emptyOnly: false,
          }
        : {
            kind: "move",
            scope: drag.scope,
            id: drag.member.dataset.binding,
            before: others[index]?.dataset.binding || "",
          };
    }
    function previewRow(index) {
      if (!drag) return;
      index = Math.max(0, Math.min(index, drag.members.length - 1));
      const cmd = rowCommand(index, drag.off),
        key = JSON.stringify(cmd);
      if (!drag.cache.has(key)) drag.cache.set(key, request(cmd));
      const allowed = drag.cache.get(key);
      if (!allowed.ok) {
        say(allowed.message);
      } else {
        say(drag.off ? "Release to delete this binding." : "");
        drag.lastGood = index;
      }
      drag.command = cmd;
      drag.valid = allowed.ok;
      const others = drag.members.filter((n) => n !== drag.member);
      const order = [...others];
      order.splice(allowed.ok ? index : drag.lastGood, 0, drag.member);
      const old = new Map(drag.members.map((n) => [n, rect(n).toJSON()]));
      drag.members.forEach((n) => n.getAnimations().forEach((a) => a.cancel()));
      let y = Math.min(...[...drag.base.values()].map((r) => r.top));
      for (const n of order) {
        const original = drag.base.get(n);
        let dx = 0,
          dy = y - original.top;
        if (n === drag.member && style === "float" && !drag.keyboard) {
          dx = pointer.x - drag.offset.x - original.left;
          dy = pointer.y - drag.offset.y - original.top;
        }
        n.style.transform = `translate(${dx}px,${dy}px)`;
        const prior = old.get(n),
          next = { left: original.left + dx, top: original.top + dy };
        if (n !== drag.member || style === "slot" || drag.keyboard) {
          if (
            Math.abs(prior.top - next.top) + Math.abs(prior.left - next.left) >
            0.1
          )
            animate(n, [
              {
                transform: `translate(${prior.left - original.left}px,${prior.top - original.top}px)`,
              },
              { transform: `translate(${dx}px,${dy}px)` },
            ]);
        }
        y += original.height;
      }
      drag.order = order;
      drag.index = index;
      program.classList.toggle("furl-delete-preview", drag.off);
    }
    function updateRow() {
      const d = drag;
      if (!d) return;
      d.off = !inside(rect(program), pointer);
      const others = d.members.filter((n) => n !== d.member);
      let index = 0,
        y = Math.min(...[...d.base.values()].map((r) => r.top));
      for (const n of others) {
        const h = d.base.get(n).height;
        if (pointer.y > y + h / 2) index++;
        y += h;
      }
      if (index !== d.index || d.wasOff !== d.off || style === "float") {
        d.wasOff = d.off;
        previewRow(index);
      }
    }
    function dropRow() {
      const d = drag;
      if (!d) return;
      const before = capture();
      clearRows(false);
      drag = null;
      if (d.valid) {
        const result = doCommit(d.command);
        if (result) positions = before;
      } else {
        for (const n of d.members) {
          const old = before.get(identity(n)),
            now = rect(n);
          animate(n, [
            {
              transform: `translate(${old.left - now.left}px,${old.top - now.top}px)`,
            },
            { transform: "none" },
          ]);
        }
      }
      refreshMode();
    }
    function beginConnection(hit, picked = false) {
      const binder = hit.dataset.binder,
        anchor = hit.dataset.kind === "binder" ? hit : sourceNode(binder, hit);
      if (!anchor) {
        say("Show the binding to start its wire.");
        return;
      }
      activate(null);
      wire.clear();
      const use = hit.dataset.kind === "reference" ? hit : null;
      connection = {
        binder,
        anchor,
        use,
        source: use?.dataset.id || "",
        picked,
        word: null,
      };
      transactionRevision = data.revision;
      if (use) {
        use.classList.add("furl-unplugging");
        const word = document.createElement("span");
        word.className = "furl-floating-reference";
        word.textContent = hit.dataset.name;
        overlay.append(word);
        connection.word = word;
      }
      program.classList.add("furl-preview");
      updateConnection();
      refreshMode();
    }
    function updateConnection() {
      const c = connection;
      if (!c) return;
      const hit = hitAt(pointer.x, pointer.y);
      const target = hit && hit.dataset.kind !== "binder" ? hit : null;
      marked().forEach((n) =>
        n.classList.toggle("furl-drop-target", n === target),
      );
      c.target = target;
      if (c.word) {
        c.word.style.left = `${pointer.x}px`;
        c.word.style.top = `${pointer.y}px`;
      }
      wire.set({
        source: c.anchor,
        target,
        pointer,
        kind: "drag",
        style: "wire",
        anchor: "center",
      });
    }
    function dropConnection(target, clicked = false) {
      const c = connection;
      if (!c) return;
      if (!target && (clicked || !c.source)) {
        cancel();
        return;
      }
      const command = {
        kind: "connect",
        binder: c.binder,
        source: c.source,
        destination: target?.dataset.id || "",
      };
      const check = request(command);
      if (!check.ok) {
        cancel();
        say(check.message);
        return;
      }
      if (target?.dataset.id === c.source) {
        cancel(false);
        return;
      }
      if (target)
        opening = {
          binder: c.binder,
          source: c.source,
          previous: marked().map((n) => n.dataset.id),
          cell: target.closest("[data-cell]").dataset.cell,
        };
      connection = null;
      c.use?.classList.remove("furl-unplugging");
      c.word?.remove();
      if (!target) wire.retract(c.anchor, pointer);
      else wire.clear();
      marked().forEach((n) => n.classList.remove("furl-drop-target"));
      program.classList.remove("furl-preview");
      doCommit(command);
      refreshMode();
    }
    on(
      document,
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        pointer = { x: e.clientX, y: e.clientY };
        if (connection?.picked) {
          stop(e);
          blockedClick = true;
          const hit = hitAt(pointer.x, pointer.y);
          dropConnection(hit?.dataset.kind !== "binder" ? hit : null, true);
          return;
        }
        if (!program.contains(e.target) && !e.target.closest(".furl-gap"))
          return;
        if (
          e.target.closest(
            ".furl-comb,.furl-open,.furl-match-bridge,.context-menu",
          )
        )
          return;
        const current = effectiveMode();
        const gap = e.target.closest(".furl-gap");
        if (gap && current === "rows") {
          stop(e);
          blockedClick = true;
          if (drag?.keyboard) {
            if (gap.dataset.scope !== drag.scope) {
              say("Move within the same let scope for now.");
            } else {
              updateRow();
              dropRow();
            }
          } else {
            doCommit({
              kind: "insert",
              scope: gap.dataset.scope,
              before: gap.dataset.before,
            });
          }
          return;
        }
        const cell = e.target.closest(".furl-native-cell,.furl-value");
        if (activeCell === cell) return;
        if (current === "rows") {
          stop(e);
          const member = bindingFor(e.target);
          const row = e.target.closest(".furl-row");
          if (member) {
            member.focus({ preventScroll: true });
            pending = { kind: "row", member, start: pointer };
          } else if (row) {
            row.tabIndex = 0;
            row.focus({ preventScroll: true });
          }
        } else if (current === "connect") {
          const hit = hitAt(pointer.x, pointer.y);
          if (hit?.dataset.binder) {
            stop(e);
            hit.focus({ preventScroll: true });
            pending = { kind: "connection", hit, start: pointer };
          }
        }
      },
      true,
    );
    on(
      document,
      "pointermove",
      (e) => {
        pointer = { x: e.clientX, y: e.clientY };
        if (
          pending &&
          Math.hypot(
            pointer.x - pending.start.x,
            pointer.y - pending.start.y,
          ) >= 5
        ) {
          const p = pending;
          pending = null;
          p.kind === "row"
            ? beginRow(p.member, false, p.start)
            : beginConnection(p.hit);
        }
        if (drag && !drag.keyboard) {
          stop(e);
          updateRow();
        } else if (connection) {
          updateConnection();
        } else {
          refreshMode();
          const hit =
            links && inside(rect(program), pointer)
              ? hitAt(pointer.x, pointer.y)
              : null;
          const anchor =
            hit?.dataset.kind === "reference"
              ? sourceNode(hit.dataset.binder, hit)
              : null;
          if (anchor)
            wire.set({
              source: anchor,
              target: hit,
              style: "wire",
              anchor: "center",
              kind: "hover",
            });
          else if (!wire.retracting) wire.clear();
        }
      },
      true,
    );
    on(
      document,
      "pointerup",
      (e) => {
        if (e.button !== 0) return;
        if (drag && !drag.keyboard) {
          stop(e);
          blockedClick = true;
          dropRow();
        } else if (connection && !connection.picked) {
          stop(e);
          blockedClick = true;
          dropConnection(connection.target);
        } else if (pending) {
          const p = pending;
          pending = null;
          if (p.kind === "connection") {
            stop(e);
            blockedClick = true;
            beginConnection(p.hit, true);
          }
        }
      },
      true,
    );
    on(
      document,
      "click",
      (e) => {
        if (blockedClick) {
          blockedClick = false;
          stop(e);
        }
      },
      true,
    );
    on(
      program,
      "dblclick",
      (e) => {
        if (effectiveMode() !== "rows") return;
        const cell = e.target.closest(".furl-native-cell,.furl-value");
        if (!cell) return;
        pending = null;
        activate(cell);
        const editable = $(".code-editor", cell);
        if (editable) {
          editable.focus();
          editable.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              clientX: e.clientX,
              clientY: e.clientY,
              button: 0,
              pointerId: 1,
            }),
          );
          editable.dispatchEvent(
            new PointerEvent("pointerup", {
              bubbles: true,
              clientX: e.clientX,
              clientY: e.clientY,
              button: 0,
              pointerId: 1,
            }),
          );
        } else {
          cell.tabIndex = 0;
          cell.focus();
          $(".furl-value-text", cell)?.click();
        }
      },
      true,
    );
    on(
      document,
      "focusin",
      (e) => {
        const cell = e.target.closest?.(".furl-native-cell,.furl-value");
        if (
          cell &&
          program.contains(cell) &&
          !e.target.classList.contains("furl-hit")
        )
          activate(cell);
        else if (activeCell && !activeCell.contains(e.target)) activate(null);
        if (connection?.picked && e.target.matches?.(".furl-hit")) {
          const r = rect(e.target);
          pointer = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          updateConnection();
        }
        if (links && e.target.matches?.(".furl-hit[data-kind=reference]")) {
          const anchor = sourceNode(e.target.dataset.binder, e.target);
          if (anchor && !connection)
            wire.set({
              source: anchor,
              target: e.target,
              kind: "hover",
              style: "wire",
              anchor: "center",
            });
        }
      },
      true,
    );
    on(
      document,
      "keydown",
      (e) => {
        if (e.isComposing) return;
        if (
          e.key === "Alt" &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.getModifierState("AltGraph")
        ) {
          held = true;
          refreshMode();
          return;
        }
        if (
          e.key === "Escape" &&
          (drag ||
            connection ||
            pending ||
            (activeCell && effectiveMode() === "rows"))
        ) {
          stop(e);
          const cell = activeCell;
          cancel();
          activate(null);
          cell?.closest(".furl-binding,.furl-row")?.focus();
          return;
        }
        if (!root.contains(e.target)) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
          cancel(false);
          positions = capture();
          return;
        }
        if (e.target.closest(".context-menu")) return;
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          const member = e.target.matches(".furl-binding") ? e.target : null;
          const row =
            e.target.closest(".furl-row") ||
            $("#active-code-editor", root)?.closest(".furl-row");
          const dest = member
            ? {
                scope: member.dataset.owner,
                before:
                  (e.shiftKey ? member : member.nextElementSibling)?.dataset
                    .binding || "",
              }
            : insertionTarget(row, e.shiftKey);
          if (dest) {
            stop(e);
            cancel();
            doCommit({ kind: "insert", ...dest });
          }
          return;
        }
        const member = bindingFor(e.target);
        if (
          e.key === "Backspace" &&
          member &&
          (((e.metaKey || e.ctrlKey) && e.shiftKey) ||
            (!e.metaKey &&
              !e.ctrlKey &&
              !e.altKey &&
              member.dataset.blank === "true"))
        ) {
          stop(e);
          cancel();
          doCommit({
            kind: "delete",
            scope: member.dataset.owner,
            id: member.dataset.binding,
            emptyOnly: !e.shiftKey,
          });
          return;
        }
        if (drag?.keyboard) {
          if (["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
            stop(e);
            if (e.key === "Enter") dropRow();
            else previewRow(drag.index + (e.key === "ArrowDown" ? 1 : -1));
          }
          return;
        }
        const hit = e.target.closest(".furl-hit");
        if (hit && effectiveMode() === "connect") {
          if (["Enter", " "].includes(e.key)) {
            stop(e);
            if (connection) {
              dropConnection(hit.dataset.kind === "binder" ? null : hit, true);
            } else if (hit.dataset.binder) {
              pointer = {
                x: rect(hit).left + rect(hit).width / 2,
                y: rect(hit).top + 11,
              };
              beginConnection(hit, true);
            }
            return;
          }
          if (
            ["Backspace", "Delete"].includes(e.key) &&
            hit.dataset.kind === "reference"
          ) {
            stop(e);
            const anchor = sourceNode(hit.dataset.binder, hit);
            pointer = { x: rect(hit).left, y: rect(hit).top };
            if (
              doCommit({
                kind: "connect",
                binder: hit.dataset.binder,
                source: hit.dataset.id,
                destination: "",
              }) &&
              anchor
            )
              wire.retract(anchor, pointer);
            return;
          }
        }
        if (e.target === member && [" ", "Enter", "F2"].includes(e.key)) {
          stop(e);
          if (e.key === " ") beginRow(member, true);
          else {
            const cell = $(".furl-expression .furl-native-cell", member);
            activate(cell);
            $(".code-editor", cell)?.focus();
          }
          return;
        }
      },
      true,
    );
    on(
      document,
      "keyup",
      (e) => {
        if (e.key === "Alt") {
          held = false;
          refreshMode();
        }
      },
      true,
    );
    on(window, "blur", () => {
      held = false;
      cancel();
      activate(null);
    });
    on(document, "visibilitychange", () => {
      if (document.hidden) {
        held = false;
        cancel();
        activate(null);
      }
    });
    on(document, "pointercancel", () => cancel());
    on(
      document,
      "scroll",
      () => {
        placeGaps();
        if (connection) updateConnection();
        else if (wire.connection) wire.request();
      },
      true,
    );
    on(window, "resize", () => {
      cancel();
      placeGaps();
    });
    return {
      update(raw, nextQuery, nextDispatch) {
        query = nextQuery;
        dispatch = nextDispatch;
        if (raw === lastRaw) return;
        lastRaw = raw;
        const next = JSON.parse(raw);
        const layout =
          JSON.stringify(next.view) + next.cells.map((c) => c.target).join("|");
        if (
          data &&
          (next.revision !== data.revision || layout !== lastLayout)
        ) {
          if (!committing) {
            cancel(false);
            positions = capture();
          } else {
            clearRows(false);
            drag = null;
            pending = null;
          }
        }
        data = next;
        lastLayout = layout;
        if (!layoutFrame) layoutFrame = requestAnimationFrame(finishLayout);
      },
      destroy() {
        destroyed = true;
        zen.destroy();
        ac.abort();
        cancelAnimationFrame(layoutFrame);
        wire.clear();
        gapNodes.forEach((n) => n.remove());
        tools.replaceChildren();
        overlay.replaceChildren();
      },
    };
  };
})();
