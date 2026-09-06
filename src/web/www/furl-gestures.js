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
  paths.move =
    "M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4";
  paths.copy = "M8 8h13v13H8zM16 4V2H2v14h2M11 14h7M14.5 10.5v7";
  paths.theme = "M5 19V5h13M5 12h10M17 14l1 2 3 1-3 1-1 3-1-3-2-1 2-1z";
  window.createFurlGestures = (root) => {
    const program = $(".furl-program", root),
      overlay = $(".furl-gesture-overlay", root);
    const tools = $(".furl-gesture-tools", root),
      status = $(".furl-gesture-status", root);
    const ac = new AbortController(),
      signal = ac.signal;
    const appearance = window.createFurlAppearance(root);
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
    const matchMotion = window.createFurlMatchMotion(root, () => motion);
    let held = false,
      pointer = { x: 0, y: 0 },
      activeCell = null,
      pending = null,
      drag = null,
      connection = null,
      termDrag = null;
    let data = null,
      query,
      dispatch,
      layoutFrame = 0,
      gapNodes = [],
      positions = null,
      committing = false,
      commitKind = "",
      referenceMotion = null,
      landing = null,
      landingTimer = 0,
      rowFrame = 0,
      rowRecoilTimer = 0,
      statusTimer = 0,
      rowHover = null;
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
    function animateRow(n, frames) {
      const a = animate(n, frames);
      if (n.dataset.rowSettling) {
        const done = () => delete n.dataset.rowSettling;
        if (a) {
          a.addEventListener("finish", done, { once: true });
          a.addEventListener("cancel", done, { once: true });
        } else done();
      }
      return a;
    }
    const referenceAnimations = new Set(),
      referenceGhosts = new Set();
    function clearReferenceAnimations() {
      referenceAnimations.forEach((a) => a.cancel());
      referenceAnimations.clear();
      referenceGhosts.forEach((n) => n.remove());
      referenceGhosts.clear();
    }
    function animateReference(n, frames, ghost = false) {
      const a = animate(n, frames);
      if (!a) {
        if (ghost) n.remove();
        return;
      }
      referenceAnimations.add(a);
      if (ghost) referenceGhosts.add(n);
      const done = () => {
        referenceAnimations.delete(a);
        if (ghost) {
          n.remove();
          referenceGhosts.delete(n);
        }
      };
      a.addEventListener("finish", done, { once: true });
      a.addEventListener("cancel", done, { once: true });
    }
    function retireFloatingWord(n) {
      if (n)
        animateReference(
          n,
          [
            { opacity: 1, transform: "translate(-50%,-50%) scale(1)" },
            { opacity: 0, transform: "translate(-50%,-50%) scale(.2)" },
          ],
          true,
        );
    }
    const on = (n, type, fn, capture = false) =>
      n.addEventListener(type, fn, { capture, signal });
    const stop = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const say = (text) => {
      clearTimeout(statusTimer);
      if (status.textContent !== text) status.textContent = text;
      status.hidden = !text;
      root.dataset.gestureMessage = String(!!text);
      $(".furl-cursor-details", root).setAttribute(
        "aria-hidden",
        String(!!text),
      );
      // During pickup, keep the reason visible. After release or a refused
      // standalone command, return to the retained native inspector shortly.
      if (text && !drag && !termDrag && !connection && !pending && !committing)
        statusTimer = setTimeout(() => say(""), 2400);
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
      held && inside(rect(program), pointer) && mode === "edit" ? "move" : mode;
    const structureMode = () => effectiveMode() !== "edit";
    const copyMode = () => mode === "copy";
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
    ["edit", "move", "copy"].forEach((k) =>
      button(
        "tool",
        k,
        {
          edit: "Edit cells",
          move: "Move — drag terms by handles; rows from whitespace; double-click to edit",
          copy: "Copy — the same row and term targets, leaving the original",
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
    button(
      "option",
      "links",
      "Show binding wires on hover in Connect mode",
      () => {
        links = !links;
        updateLink();
        refreshMode();
      },
    );
    button("option", "motion", "Animate row movement and wires", () => {
      motion = !motion;
      if (!motion) {
        clearReferenceAnimations();
        wire.points = null;
        wire.request();
      }
      refreshMode();
    });
    divider();
    const themeButton = button("view", "theme", "Try old Furl styling", () => {
      cancel(false);
      appearance.toggle();
      themeButton.setAttribute("aria-pressed", appearance.playful);
    });
    themeButton.setAttribute("aria-pressed", appearance.playful);
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
      const changed = root.dataset.tool !== selected;
      root.dataset.tool = selected;
      root.dataset.policy = policy;
      root.dataset.gesture = drag
        ? "row"
        : termDrag
          ? "term"
          : connection
            ? "connection"
            : pending
              ? "pending"
              : committing
                ? "commit"
                : "";
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
      marked().forEach((n) => (n.tabIndex = selected !== "edit" ? 0 : -1));
      gapNodes.forEach((n) => {
        // Keyboard pickup may still finish at a clicked boundary. It is a
        // placement target then, never an insertion button or plus hint.
        const placing = !!drag?.keyboard;
        n.classList.toggle("furl-place-boundary", placing);
        n.setAttribute(
          "aria-label",
          placing
            ? "Place picked binding at this boundary"
            : "Insert binding at this boundary",
        );
        n.hidden =
          selected === "edit" ||
          !!activeCell ||
          !!connection ||
          !!termDrag ||
          !!pending ||
          committing ||
          (!!drag && !placing);
      });
      // Entering/leaving the modifier mode must update a stationary hover too.
      if (changed) updateLink();
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
    const nativeSlot = (n) => ({
      x: parseFloat(n.style.left),
      y: parseFloat(n.style.top),
      width: parseFloat(n.style.width),
    });
    function captureReferenceMotion(command) {
      const markers = marked();
      return {
        command,
        previous: new Set(markers.map((n) => n.dataset.id)),
        changes: markers
          .filter(
            (n) =>
              n.dataset.id === command.source ||
              n.dataset.id === command.destination,
          )
          .map((n) => {
            const cell = n.closest("[data-cell]");
            return {
              role: n.dataset.id === command.source ? "source" : "destination",
              view: cell.dataset.view,
              cell: cell.dataset.cell,
              ...nativeSlot(n),
              name: n.dataset.name,
              kind: n.dataset.kind,
              opacity: n.classList.contains("furl-unplugging") ? 0.3 : 1,
              box: rect(n),
              parent: rect(cell),
            };
          }),
      };
    }
    function finishReferenceMotion() {
      const snapshot = referenceMotion;
      referenceMotion = null;
      const { command, previous, changes } = snapshot;
      const cells = $$(".furl-native-cell", program);
      // One native connection replaces at most two single-line pieces. Match
      // the destination by occurrence identity, then locate the new source hole
      // at its native grid position, accounting for a replacement before it.
      for (const c of changes) {
        c.node = cells.find(
          (n) => n.dataset.view === c.view && n.dataset.cell === c.cell,
        );
        if (!c.node || c.role !== "destination") continue;
        c.target = $$(".furl-hit", c.node).find(
          (n) =>
            n.dataset.kind === "reference" &&
            n.dataset.binder === command.binder &&
            (command.source
              ? n.dataset.id === command.source
              : !previous.has(n.dataset.id)),
        );
        if (c.target) c.next = nativeSlot(c.target);
      }
      for (const c of changes) {
        if (!c.node || c.role !== "source") continue;
        const shift = changes
          .filter(
            (d) =>
              d.view === c.view &&
              d.role === "destination" &&
              d.next &&
              d.y === c.y &&
              d.x < c.x,
          )
          .reduce((dx, d) => dx + d.next.width - d.width, 0);
        c.target = $$(".furl-hit[data-kind=hole]", c.node).find((n) => {
          const p = nativeSlot(n);
          return Math.abs(p.x - c.x - shift) < 0.5 && Math.abs(p.y - c.y) < 0.5;
        });
        if (c.target) c.next = nativeSlot(c.target);
      }
      for (const node of new Set(changes.map((c) => c.node).filter(Boolean))) {
        const edits = changes.filter((c) => c.node === node);
        // A stale or unexpected projection gets the correct final source, with
        // no guessed motion. Ordinary typing never enters this path.
        if (edits.some((c) => !c.next)) continue;
        const parent = rect(node),
          oldParent = edits[0].parent;
        const leaves = $$(
          ".code-text .token,.code-text .comment,.code-text .in-unparsed-buffer,.code-text .empty-hole,.furl-hit,.code-deco .indication svg,.code-deco .selects svg",
          node,
        ).map((n) => ({ n, b: rect(n) }));
        // Read all geometry before any leaf gets a transform.
        for (const { n, b } of leaves) {
          const x = b.left - parent.left,
            y = (b.top + b.bottom) / 2 - parent.top;
          const row = edits.filter(
            (c) =>
              Math.abs(y - c.next.y - data.lineHeight / 2) <
              data.lineHeight / 2,
          );
          if (!row.length) continue;
          const slot = row.find(
            (c) => x >= c.next.x - 0.5 && x < c.next.x + c.next.width - 0.5,
          );
          if (
            slot &&
            b.right - parent.left > slot.next.x + slot.next.width + 0.5
          )
            continue;
          const dx =
            oldParent.left -
            parent.left +
            (slot
              ? slot.x - slot.next.x
              : -row
                  .filter((c) => c.next.x + c.next.width <= x + 0.5)
                  .reduce((s, c) => s + c.next.width - c.width, 0));
          const dy = oldParent.top - parent.top;
          const scale =
            slot?.role === "destination" ? slot.width / slot.next.width : 1;
          if (slot || Math.abs(dx) + Math.abs(dy) > 0.1)
            animateReference(n, [
              {
                opacity: slot ? 0 : 1,
                transform: `translate(${dx}px,${dy}px) scaleX(${scale})`,
                transformOrigin: "left center",
              },
              { opacity: 1, transform: "none", transformOrigin: "left center" },
            ]);
        }
        for (const c of edits) {
          if (c.kind !== "reference" || !motion || media.matches) continue;
          // Hazel has already committed. Retain only a pointer-inert visual of
          // the retired word while its space closes; never delay source/history.
          const ghost = document.createElement("span");
          ghost.className = "furl-exiting-reference";
          ghost.setAttribute("aria-hidden", "true");
          ghost.textContent = c.name;
          ghost.style.cssText = `left:${c.next.x}px;top:${c.next.y}px;width:${c.width}px`;
          $(".furl-hit-layer", node).append(ghost);
          const dx = c.box.left - parent.left - c.next.x,
            dy = c.box.top - parent.top - c.next.y;
          animateReference(
            ghost,
            [
              {
                opacity: c.opacity,
                transform: `translate(${dx}px,${dy}px) scaleX(1)`,
              },
              { opacity: 0, transform: `scaleX(${c.next.width / c.width})` },
            ],
            true,
          );
        }
      }
      const destinations = changes.filter(
        (c) => c.role === "destination" && c.target,
      );
      if (destinations.length) {
        destinations.sort(
          (a, b) =>
            Math.hypot(a.box.left - pointer.x, a.box.top - pointer.y) -
            Math.hypot(b.box.left - pointer.x, b.box.top - pointer.y),
        );
        landConnection(destinations[0].target);
      } else if (command.destination) wire.clear();
    }
    function finishLayout() {
      if (destroyed) return;
      layoutFrame = 0;
      const before = positions;
      positions = null;
      syncMarkers();
      syncBoundaries();
      appearance.paint(data);
      matchMotion.layout();
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
              animateRow(n, [
                { transform: `translate(${dx}px,${dy}px)` },
                { transform: "none" },
              ]);
            else delete n.dataset.rowSettling;
          } else animate(n, [{ opacity: 0 }, { opacity: 1 }]);
        }
      }
      if (referenceMotion) finishReferenceMotion();
      if (committing) {
        committing = false;
        const editor = $("#active-code-editor", root);
        if (editor) {
          if (
            commitKind === "insert" ||
            commitKind === "delete" ||
            mode === "edit"
          ) {
            activate(editor.closest("[data-cell]"));
            editor.focus({ preventScroll: true });
          } else {
            activate(null);
            const member = bindingFor(editor);
            if (mode !== "edit") member?.focus({ preventScroll: true });
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
        const old = new Map(
          $$(":scope > .furl-hit", layer).map((n) => [n.dataset.key, n]),
        );
        for (const m of markers) {
          let n = old.get(m.key);
          old.delete(m.key);
          if (!n) {
            n = document.createElement("span");
            n.className = "furl-hit";
            n.setAttribute("role", "button");
            layer.append(n);
          }
          Object.assign(n.dataset, {
            key: m.key,
            id: m.id,
            uses: m.uses,
            role: m.role,
            kind: m.kind,
            binder: m.binder,
            name: m.name,
          });
          n._code = m.code;
          n._glyph = m.glyph;
          n._regions = m.regions;
          n.style.cssText = `left:${m.col * data.pitch}px;top:${m.row * data.lineHeight}px;width:${m.width * data.pitch}px;height:${data.lineHeight}px`;
          n.title =
            m.kind === "binder"
              ? `Connect ${m.name}`
              : m.kind === "hole"
                ? "Connect here"
                : m.kind === "reference"
                  ? `Move ${m.name}; hover to trace binding`
                  : `Move term: ${m.code}. Command/Ctrl+Shift+Enter extracts above this row.`;
          n.setAttribute("aria-label", n.title);
        }
        old.forEach((n) => n.remove());
      });
      $$(".furl-binding", program).forEach((n) => {
        n.tabIndex = 0;
        const rows = $$(".furl-row", n).length;
        n.setAttribute(
          "aria-label",
          `${bindingName(n)} binding${rows > 1 ? `, including ${rows} display rows` : ""}`,
        );
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
        n.style.cssText = `left:${Math.max(clip.left + 5, r.left)}px;top:${r.top - 4}px;width:${Math.min(r.width, clip.right - r.left - 5)}px`;
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
      if (activeCell) hoverRow();
      refreshMode();
    }
    function bindingFor(target) {
      if (target.matches(".furl-binding")) return target;
      const id = target.closest(".furl-row")?.dataset.bindingRow;
      // Stay in this projection instance when a match echoes a binding.
      for (
        let n = target.closest(".furl-binding");
        n;
        n = n.parentElement.closest(".furl-binding")
      )
        if (n.dataset.binding === id) return n;
      return null;
    }
    function rowWhitespace(target) {
      const row = target.closest?.(".furl-row");
      if (!row) return false;
      return !$$(
        ".token,.comment,.in-unparsed-buffer,.empty-hole,.furl-hit",
        row,
      ).some((n) => {
        const r = rect(n);
        return (
          r.width > 0 &&
          pointer.y >= r.top &&
          pointer.y <= r.bottom &&
          pointer.x >= r.left - data.pitch &&
          pointer.x <= r.right + data.pitch
        );
      });
    }
    let highlightedTerm = null;
    function highlightTerm(hit, kind = "hover") {
      const key = hit
        ? hit.closest("[data-view]").dataset.view + hit.dataset.id + kind
        : null;
      if (highlightedTerm === key) return;
      highlightedTerm = key;
      $$(".furl-term-range", root).forEach((n) => n.remove());
      if (!hit || activeCell || hit.dataset.kind === "binder") return;
      const layer = hit.parentElement;
      for (const r of hit._regions || []) {
        const n = document.createElement("span");
        n.className = "furl-term-range";
        n.dataset.kind = kind;
        n.style.cssText = `left:${r.col * data.pitch}px;top:${r.row * data.lineHeight}px;width:${r.width * data.pitch}px;height:${data.lineHeight}px`;
        layer.prepend(n);
      }
    }
    function clearTerm() {
      if (termDrag) {
        termDrag.ghost.remove();
        termDrag = null;
      }
      gapNodes.forEach((n) => n.classList.remove("furl-extract-boundary"));
      highlightTerm(null);
    }
    function beginTerm(hit, picked = false, grab = pointer) {
      activate(null);
      hoverRow();
      clearLanding();
      wire.clear();
      const cell = hit.closest("[data-cell]"),
        r = rect(cell);
      const regions = hit._regions;
      const x = r.left + Math.min(...regions.map((r) => r.col)) * data.pitch;
      const y =
        r.top + Math.min(...regions.map((r) => r.row)) * data.lineHeight;
      const ghost = document.createElement("div");
      ghost.className = "furl-floating-term";
      ghost.textContent = hit._code;
      ghost.setAttribute("aria-hidden", "true");
      root.append(ghost);
      termDrag = {
        hit,
        source: hit.dataset.id,
        copy: copyMode(),
        picked,
        ghost,
        offset: { x: grab.x - x, y: grab.y - y },
        cache: new Map(),
      };
      transactionRevision = data.revision;
      updateTerm();
      refreshMode();
    }
    function extractionGap() {
      return gapNodes.find((n) => {
        const r = rect(n._anchor);
        return (
          Math.abs(pointer.y - r.top) <= 6 &&
          pointer.x >= r.left &&
          pointer.x <= r.right
        );
      });
    }
    function updateTerm() {
      const t = termDrag;
      if (!t) return;
      t.ghost.style.left = `${pointer.x - t.offset.x}px`;
      t.ghost.style.top = `${pointer.y - t.offset.y}px`;
      const hit = hitAt(pointer.x, pointer.y);
      t.target = hit?.dataset.kind !== "binder" ? hit : null;
      // Extraction uses existing *row* boundaries, never text whitespace.
      t.gap = !t.copy && !t.target ? extractionGap() : null;
      t.off = !inside(rect(program), pointer);
      t.command = t.gap
        ? {
            kind: "extract",
            scope: t.gap.dataset.scope,
            before: t.gap.dataset.before,
            source: t.source,
          }
        : {
            kind: "term",
            source: t.source,
            destination: t.target?.dataset.id || "",
            copy: t.copy,
          };
      const hasDestination =
        !!t.target || !!t.gap || (t.off && !t.copy && !t.picked);
      const key = JSON.stringify(t.command);
      if (hasDestination && !t.cache.has(key))
        t.cache.set(key, request(t.command));
      const check = hasDestination ? t.cache.get(key) : null;
      t.valid = !!check?.ok;
      gapNodes.forEach((n) =>
        n.classList.toggle("furl-extract-boundary", n === t.gap && t.valid),
      );
      highlightTerm(t.target, t.valid ? "target" : "refused");
      say(
        check && !check.ok
          ? check.message
          : t.gap
            ? "Release to extract a binding here."
            : t.off && !t.copy
              ? "Release to remove this term."
              : "",
      );
    }
    function dropTerm(clicked = false) {
      const t = termDrag;
      if (!t) return;
      if (!t.valid || (clicked && !t.target && !t.gap)) {
        const message = status.textContent;
        clearTerm();
        refreshMode();
        say(message);
        return;
      }
      const ghost = t.ghost,
        target = t.target;
      // The native transaction supplies the actual replacement; the carried
      // preview merely settles toward its destination and fades away.
      termDrag = null;
      highlightTerm(null);
      gapNodes.forEach((n) => n.classList.remove("furl-extract-boundary"));
      const done = doCommit(t.command);
      if (done && target) {
        const from = rect(ghost),
          to = rect(target);
        const a = animate(ghost, [
          { opacity: 0.8, transform: "none" },
          {
            opacity: 0,
            transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(.95)`,
          },
        ]);
        if (a) {
          a.onfinish = () => ghost.remove();
          a.oncancel = () => ghost.remove();
        } else ghost.remove();
      } else ghost.remove();
      refreshMode();
    }
    function hoverRow(target = null) {
      const next =
        target &&
        structureMode() &&
        !drag &&
        !termDrag &&
        !connection &&
        !activeCell &&
        rowWhitespace(target)
          ? bindingFor(target)
          : null;
      if (rowHover === next) return;
      if (rowHover) delete rowHover.dataset.rowHover;
      rowHover = next;
      if (rowHover) rowHover.dataset.rowHover = "true";
    }
    function bindingName(member) {
      return (
        $$(".furl-row", member)
          .find((n) => n.dataset.bindingRow === member.dataset.binding)
          ?.querySelector(".furl-pattern .code")
          ?.textContent.trim() || "This binding"
      );
    }
    function scopeMessage(d) {
      const owner = d.member.parentElement.closest(".furl-binding");
      return owner
        ? `${bindingName(d.member)} belongs to ${bindingName(owner)}. Moving it outside that definition needs a scope-changing move, which is not implemented yet.`
        : "Move within the same let scope for now.";
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
      clearReferenceAnimations();
      clearLanding();
      referenceMotion =
        command.kind === "connect" ? captureReferenceMotion(command) : null;
      positions = capture();
      committing = true;
      commitKind = command.kind;
      transactionRevision = data.revision;
      refreshMode();
      const result = request(command, true);
      if (!result.ok) {
        positions = null;
        referenceMotion = null;
        committing = false;
        refreshMode();
        say(result.message);
        return false;
      }
      say("");
      return true;
    }
    function clearRows(animateBack = true) {
      cancelAnimationFrame(rowFrame);
      clearTimeout(rowRecoilTimer);
      rowFrame = 0;
      if (!drag) return;
      const restore = drag.copyGhost
        ? new Map(
            $$(".furl-binding,.furl-tail", program).map((n) => [
              n,
              rect(n).toJSON(),
            ]),
          )
        : null;
      drag.copyGhost?.remove();
      if (drag.copyScope) drag.copyScope.style.minHeight = drag.oldMinHeight;
      const membersToClear = drag.copyReal || drag.members;
      for (const member of membersToClear) {
        const old = restore?.get(member) || rect(member);
        member.getAnimations().forEach((a) => a.cancel());
        member.style.transform = "";
        if (animateBack && member.dataset.picked)
          member.dataset.rowSettling = "true";
        member.removeAttribute("data-picked");
        member.removeAttribute("data-row-blocked");
        if (animateBack) {
          const next = rect(member);
          animateRow(member, [
            {
              transform: `translate(${old.left - next.left}px,${old.top - next.top}px)`,
            },
            { transform: "none" },
          ]);
        }
      }
      if (animateBack && restore)
        for (const [n, old] of restore) {
          if (membersToClear.includes(n) || drag.copyScope.contains(n))
            continue;
          const now = rect(n);
          if (Math.abs(old.top - now.top) > 0.1)
            animateRow(n, [
              { transform: `translateY(${old.top - now.top}px)` },
              { transform: "none" },
            ]);
        }
      program.classList.remove("furl-delete-preview", "furl-preview");
    }
    function cancel(retract = true) {
      clearLanding();
      referenceMotion = null;
      clearReferenceAnimations();
      clearTerm();
      highlightTerm(null);
      pending = null;
      hoverRow();
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
      hoverRow();
      clearLanding();
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
        copy: copyMode(),
        index: members.indexOf(member),
        scope: member.dataset.owner,
        offset: { x: grab.x - source.left, y: grab.y - source.top },
        height: source.height,
        motion: new Map(
          members.map((n) => [
            n,
            {
              x: start.get(n).left - base.get(n).left,
              y: start.get(n).top - base.get(n).top,
              vx: 0,
              vy: 0,
              tx: 0,
              ty: 0,
            },
          ]),
        ),
        clock: performance.now(),
        lastGood: members.indexOf(member),
        off: false,
        edge: 0,
        keyboardPull: 0,
        cache: new Map(),
      };
      if (drag.copy) {
        const ghost = member.cloneNode(true);
        ghost.classList.remove("furl-binding");
        ghost.classList.add("furl-row-copy-ghost");
        ghost.setAttribute("aria-hidden", "true");
        for (const n of [ghost, ...ghost.querySelectorAll("*")]) {
          n.removeAttribute("id");
          n.removeAttribute("tabindex");
          n.removeAttribute("data-binding");
          n.removeAttribute("data-view");
          n.removeAttribute("data-cell");
          n.classList.remove("furl-binding", "furl-native-cell", "furl-tail");
        }
        ghost.querySelectorAll(".furl-hit-layer").forEach((n) => n.remove());
        ghost.style.cssText = `position:fixed;left:${source.left}px;top:${source.top}px;width:${source.width}px;pointer-events:none;z-index:18`;
        const computed = getComputedStyle(member);
        for (const prop of [
          "--columns",
          "--lane-width",
          "--col-width",
          "--row-height",
        ])
          ghost.style.setProperty(prop, computed.getPropertyValue(prop));
        root.append(ghost);
        drag.copyGhost = ghost;
        drag.copyScope = parent;
        drag.oldMinHeight = parent.style.minHeight;
        const outerBefore = new Map(
          $$(".furl-binding,.furl-tail", program)
            .filter((n) => !parent.contains(n))
            .map((n) => [n, rect(n).toJSON()]),
        );
        drag.copyReal = [...parent.children].filter((n) =>
          n.matches(".furl-binding,.furl-tail"),
        );
        drag.copyOrigins = new Map(
          drag.copyReal.map((n) => [n, rect(n).toJSON()]),
        );
        parent.style.minHeight = `${rect(parent).height + source.height}px`;
        for (const n of drag.copyReal)
          if (!drag.motion.has(n))
            drag.motion.set(n, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
        drag.copyLogical = new Map(
          drag.copyReal.map((n) => [n, rect(n).toJSON()]),
        );
        drag.motion.set(ghost, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
        for (const [n, old] of outerBefore) {
          const now = rect(n);
          if (Math.abs(old.top - now.top) > 0.1)
            animateRow(n, [
              { transform: `translateY(${old.top - now.top}px)` },
              { transform: "none" },
            ]);
        }
      }
      transactionRevision = data.revision;
      member.dataset.picked = "true";
      program.classList.add("furl-preview");
      member.focus({ preventScroll: true });
      previewRow(drag.index);
      refreshMode();
    }
    // A critically damped spring retains velocity across new candidate slots.
    // Unlike restarting an ease-out on each pointer event, reversals and Float
    // neighbor reflow stay continuous and independent of event frequency.
    function paintRows(now) {
      rowFrame = 0;
      if (!drag) return;
      const dt = Math.max(0, Math.min((now - drag.clock) / 1000, 0.05));
      drag.clock = now;
      let moving = false;
      for (const [n, s] of drag.motion) {
        const immediate =
          !motion ||
          media.matches ||
          (n === (drag.copyGhost || drag.member) &&
            style === "float" &&
            !drag.keyboard &&
            !drag.blocked);
        for (const axis of ["x", "y"]) {
          const target = s["t" + axis],
            velocity = "v" + axis;
          const delta = s[axis] - target;
          if (
            immediate ||
            (Math.abs(delta) < 0.02 && Math.abs(s[velocity]) < 0.2)
          ) {
            s[axis] = target;
            s[velocity] = 0;
          } else {
            const omega = 22,
              decay = Math.exp(-omega * dt);
            const c = s[velocity] + omega * delta;
            s[axis] = target + (delta + c * dt) * decay;
            s[velocity] = (s[velocity] - omega * c * dt) * decay;
            moving = true;
          }
        }
        n.style.transform = `translate(${s.x}px,${s.y}px)`;
      }
      if (drag.keyboard) placeGaps();
      if (moving) rowFrame = requestAnimationFrame(paintRows);
    }
    function rowCommand(index, remove = false) {
      const others = drag.copy
        ? drag.members
        : drag.members.filter((n) => n !== drag.member);
      return remove
        ? {
            kind: "delete",
            scope: drag.scope,
            id: drag.member.dataset.binding,
            emptyOnly: false,
          }
        : {
            kind: drag.copy ? "copy-row" : "move",
            scope: drag.scope,
            id: drag.member.dataset.binding,
            before: others[index]?.dataset.binding || "",
          };
    }
    function previewRow(index) {
      if (!drag) return;
      const requestedIndex = index;
      index = Math.max(
        0,
        Math.min(index, drag.members.length - (drag.copy ? 0 : 1)),
      );
      if (drag.keyboard) drag.edge = Math.sign(requestedIndex - index);
      const cmd = rowCommand(index, drag.off),
        key = JSON.stringify(cmd);
      if (!drag.cache.has(key)) drag.cache.set(key, request(cmd));
      const allowed = drag.cache.get(key);
      if (drag.copy && drag.off) {
        say("Release outside to cancel this copy.");
        drag.command = cmd;
        drag.valid = false;
        drag.blocked = false;
        positionRows();
        return;
      }
      if (!allowed.ok) {
        say(allowed.message);
      } else {
        say(
          drag.outsideScope
            ? scopeMessage(drag)
            : drag.off
              ? "Release to delete this binding."
              : drag.edge < 0
                ? "Start of this let block."
                : drag.edge > 0
                  ? "End of this let block."
                  : "",
        );
        if (!drag.outsideScope) drag.lastGood = index;
      }
      drag.command = cmd;
      drag.valid = allowed.ok && !drag.outsideScope;
      drag.blocked = !drag.valid || (!drag.off && drag.edge !== 0);
      drag.member.toggleAttribute("data-row-blocked", drag.blocked);
      const others = drag.members.filter((n) => n !== drag.member);
      const order = [...others];
      order.splice(drag.valid ? index : drag.lastGood, 0, drag.member);
      drag.order = order;
      drag.index = index;
      clearTimeout(rowRecoilTimer);
      drag.keyboardPull =
        drag.keyboard && drag.blocked
          ? 6 * Math.sign(index - drag.lastGood || drag.edge)
          : 0;
      positionRows();
      if (drag.keyboardPull) {
        const d = drag;
        rowRecoilTimer = setTimeout(() => {
          if (drag !== d) return;
          d.keyboardPull = 0;
          positionRows();
        }, 110);
      }
      program.classList.toggle("furl-delete-preview", drag.off);
    }
    function positionRows() {
      // Resistance is paint-only: never propose fractional or illegal source
      // positions. A longer pull approaches a bounded offset asymptotically.
      const limit = data.lineHeight * 0.4;
      const resist = (distance) =>
        Math.sign(distance) *
        limit *
        (1 - Math.exp((-Math.abs(distance) * 0.32) / limit));
      // Advance toward the old targets first. Time spent resting in a slot
      // must not be counted as elapsed motion toward a just-selected target.
      cancelAnimationFrame(rowFrame);
      paintRows(performance.now());
      if (drag.copy) {
        const index = drag.valid ? drag.index : drag.lastGood;
        const origin = drag.base.get(drag.member);
        const top = Math.min(...[...drag.base.values()].map((r) => r.top));
        const slotY =
          top +
          drag.members
            .slice(0, index)
            .reduce((h, n) => h + drag.base.get(n).height, 0);
        for (const [i, n] of drag.copyReal.entries()) {
          const state = drag.motion.get(n);
          state.tx = 0;
          state.ty =
            drag.copyOrigins.get(n).top +
            (i >= index ? drag.height : 0) -
            drag.copyLogical.get(n).top;
        }
        const ghost = drag.motion.get(drag.copyGhost);
        ghost.tx =
          style === "float" && !drag.keyboard
            ? pointer.x - drag.offset.x - origin.left
            : 0;
        ghost.ty =
          style === "float" && !drag.keyboard
            ? pointer.y - drag.offset.y - origin.top
            : slotY - origin.top;
        if (drag.blocked && motion && !media.matches)
          ghost.ty += drag.keyboard
            ? drag.keyboardPull
            : resist(pointer.y - drag.offset.y - slotY);
        cancelAnimationFrame(rowFrame);
        paintRows(drag.clock);
        return;
      }
      let y = Math.min(...[...drag.base.values()].map((r) => r.top));
      for (const n of drag.order) {
        const original = drag.base.get(n);
        const slotY =
          drag.copy && n === drag.member
            ? Math.min(...[...drag.base.values()].map((r) => r.top)) +
              drag.members
                .slice(0, drag.valid ? drag.index : drag.lastGood)
                .reduce((h, n) => h + drag.base.get(n).height, 0)
            : y;
        let dx = 0,
          dy = slotY - original.top;
        if (n === drag.member) {
          if (drag.blocked) {
            if (motion && !media.matches) {
              dx =
                drag.keyboard ||
                (style === "slot" && !drag.off && !drag.outsideScope)
                  ? 0
                  : resist(pointer.x - drag.offset.x - original.left);
              dy += drag.keyboard
                ? drag.keyboardPull
                : resist(pointer.y - drag.offset.y - slotY);
            }
          } else if (style === "float" && !drag.keyboard) {
            dx = pointer.x - drag.offset.x - original.left;
            dy = pointer.y - drag.offset.y - original.top;
          }
        }
        const s = drag.motion.get(n);
        s.tx = dx;
        s.ty = dy;
        y += original.height;
      }
      cancelAnimationFrame(rowFrame);
      paintRows(drag.clock);
    }
    function updateRow() {
      const d = drag;
      if (!d) return;
      d.off = !inside(rect(program), pointer);
      const nested = d.member.parentElement.closest(".furl-binding");
      const outsideScope =
        !d.off && !!nested && !inside(rect(d.member.parentElement), pointer);
      const others = d.copy
        ? d.members
        : d.members.filter((n) => n !== d.member);
      const centers = [];
      let y =
        Math.min(...[...d.base.values()].map((r) => r.top)) + d.height / 2;
      centers.push(y);
      for (const n of others) {
        y += d.base.get(n).height;
        centers.push(y);
      }
      // Compare candidate centers to the *grabbed row's* center. Collapsing the
      // source's gap made a horizontal pickup move down a slot; using raw pointer
      // y made a tall definition jump when grabbed near its bottom.
      const center = pointer.y - d.offset.y + d.height / 2;
      let index = d.index;
      const hysteresis = 3;
      while (
        index < centers.length - 1 &&
        center > (centers[index] + centers[index + 1]) / 2 + hysteresis
      )
        index++;
      while (
        index > 0 &&
        center < (centers[index - 1] + centers[index]) / 2 - hysteresis
      )
        index--;
      d.edge =
        center < centers[0] - hysteresis
          ? -1
          : center > centers.at(-1) + hysteresis
            ? 1
            : 0;
      d.outsideScope = outsideScope;
      // Eligibility is cached per native candidate. Update paint targets even
      // within a refused slot, so resistance follows the distance being pulled.
      previewRow(index);
    }
    function dropRow() {
      const d = drag;
      if (!d) return;
      const explanation = status.textContent;
      const before = capture();
      clearRows(false);
      // Keep the moving row above its neighbors until it settles. Otherwise
      // dropping mid-flight superimposes their glyphs during the final reflow.
      d.member.dataset.rowSettling = "true";
      drag = null;
      // Pulling against an endpoint (or returning to the original slot) is
      // feedback only, including when the native splice would allocate anew.
      const moved = d.copy || d.off || d.index !== d.members.indexOf(d.member);
      if (d.valid && moved && doCommit(d.command)) {
        positions = before;
      } else {
        say(status.textContent || explanation);
        for (const n of d.members) {
          const old = before.get(identity(n)),
            now = rect(n);
          animateRow(n, [
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
      clearLanding();
      wire.clear();
      const use = hit.dataset.kind === "reference" ? hit : null;
      connection = {
        binder,
        anchor,
        use,
        source: copyMode() ? "" : use?.dataset.id || "",
        picked,
        word: null,
        cache: new Map(),
      };
      transactionRevision = data.revision;
      if (use) {
        if (!copyMode()) use.classList.add("furl-unplugging");
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
      c.gap = c.source && !target ? extractionGap() : null;
      c.extract = c.gap
        ? {
            kind: "extract",
            scope: c.gap.dataset.scope,
            before: c.gap.dataset.before,
            source: c.source,
          }
        : null;
      const command =
        c.extract ||
        (target
          ? {
              kind: "connect",
              binder: c.binder,
              source: c.source,
              destination: target.dataset.id,
            }
          : null);
      const key = JSON.stringify(command);
      if (command && !c.cache.has(key)) c.cache.set(key, request(command));
      const check = command ? c.cache.get(key) : null;
      gapNodes.forEach((n) =>
        n.classList.toggle("furl-extract-boundary", n === c.gap && check?.ok),
      );
      highlightTerm(target, check?.ok ? "target" : "refused");
      say(
        check && !check.ok
          ? check.message
          : c.gap
            ? "Release to extract a binding here."
            : "",
      );
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
    function clearLanding() {
      clearTimeout(landingTimer);
      landingTimer = 0;
      landing = null;
    }
    function updateLink() {
      // A native edit may replace the target hole before its new use is measured.
      // Keep the last drag curve until finishLayout hands it to that use.
      if (drag || termDrag || connection || referenceMotion || wire.retracting)
        return;
      const showLinks = links && structureMode();
      const hovered =
        showLinks && inside(rect(program), pointer)
          ? hitAt(pointer.x, pointer.y)
          : null;
      const focused = showLinks
        ? $(".furl-hit[data-kind=reference]:focus-visible", program)
        : null;
      const target =
        landing || (hovered?.dataset.kind === "reference" ? hovered : focused);
      const anchor = target?.isConnected
        ? sourceNode(target.dataset.binder, target)
        : null;
      if (anchor)
        wire.set({
          source: anchor,
          target,
          style: "wire",
          anchor: "center",
          kind: landing ? "landing" : "hover",
        });
      else wire.clear();
    }
    function landConnection(target) {
      clearLanding();
      landing = target;
      // Called after native geometry is synchronized, without resetting masses.
      const anchor = sourceNode(target.dataset.binder, target);
      if (anchor)
        wire.set({
          source: anchor,
          target,
          kind: "landing",
          style: "wire",
          anchor: "center",
        });
      else wire.clear();
      landingTimer = setTimeout(
        () => {
          clearLanding();
          updateLink();
        },
        !motion || media.matches ? 0 : 220,
      );
    }
    function dropConnection(target, clicked = false) {
      const c = connection;
      if (!c) return;
      if (c.extract) {
        const command = c.extract;
        cancel();
        doCommit(command);
        return;
      }
      highlightTerm(null);
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
        connection = null;
        c.use?.classList.remove("furl-unplugging");
        c.word?.remove();
        marked().forEach((n) => n.classList.remove("furl-drop-target"));
        program.classList.remove("furl-preview");
        landConnection(target);
        refreshMode();
        return;
      }
      connection = null;
      if (!target) wire.retract(c.anchor, pointer);
      marked().forEach((n) => n.classList.remove("furl-drop-target"));
      program.classList.remove("furl-preview");
      const committed = doCommit(command);
      c.use?.classList.remove("furl-unplugging");
      if (committed && !target) retireFloatingWord(c.word);
      else c.word?.remove();
      if (!committed && target) wire.retract(c.anchor, pointer);
      refreshMode();
    }
    on(
      document,
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        if (
          !drag &&
          !termDrag &&
          !connection &&
          !pending &&
          root.contains(e.target)
        )
          say("");
        pointer = { x: e.clientX, y: e.clientY };
        if (termDrag?.picked) {
          stop(e);
          blockedClick = true;
          updateTerm();
          dropTerm(true);
          return;
        }
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
        if (gap && current !== "edit") {
          stop(e);
          blockedClick = true;
          if (drag?.keyboard) {
            if (gap.dataset.scope !== drag.scope) {
              say("Move within the same let scope for now.");
            } else {
              const before = gap.dataset.before;
              const others = drag.copy
                ? drag.members
                : drag.members.filter((n) => n !== drag.member);
              const index =
                before === drag.member.dataset.binding
                  ? drag.members.indexOf(drag.member)
                  : before
                    ? others.findIndex((n) => n.dataset.binding === before)
                    : others.length;
              previewRow(index);
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
        if (current !== "edit") {
          stop(e);
          const hit = hitAt(pointer.x, pointer.y);
          if (hit) {
            hit.focus({ preventScroll: true });
            if (hit.dataset.kind !== "hole")
              pending = {
                kind: hit.dataset.binder ? "connection" : "term",
                hit,
                start: pointer,
              };
          } else if (rowWhitespace(e.target)) {
            const member = bindingFor(e.target);
            if (member) {
              member.focus({ preventScroll: true });
              pending = { kind: "row", member, start: pointer };
            }
          }
          refreshMode();
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
            : p.kind === "term"
              ? beginTerm(p.hit, false, p.start)
              : beginConnection(p.hit);
        }
        if (drag && !drag.keyboard) {
          stop(e);
          updateRow();
        } else if (termDrag) {
          updateTerm();
        } else if (connection) {
          updateConnection();
        } else {
          refreshMode();
          hoverRow(e.target);
          highlightTerm(
            structureMode() && !activeCell ? hitAt(pointer.x, pointer.y) : null,
          );
          updateLink();
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
        } else if (termDrag && !termDrag.picked) {
          stop(e);
          blockedClick = true;
          dropTerm();
        } else if (connection && !connection.picked) {
          stop(e);
          blockedClick = true;
          dropConnection(connection.target);
        } else if (pending) {
          const p = pending;
          pending = null;
          if (p.kind === "term") {
            stop(e);
            blockedClick = true;
            beginTerm(p.hit, true, p.start);
          } else if (p.kind === "connection") {
            stop(e);
            blockedClick = true;
            beginConnection(p.hit, true);
          }
          refreshMode();
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
        if (!structureMode()) return;
        const cell = e.target.closest(".furl-native-cell,.furl-value");
        if (!cell) return;
        cancel();
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
        if (
          structureMode() &&
          !termDrag &&
          !connection &&
          e.target.matches?.(".furl-hit")
        )
          highlightTerm(e.target);
        if (termDrag?.picked && e.target.matches?.(".furl-hit")) {
          const r = rect(e.target);
          pointer = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          updateTerm();
        }
        if (e.target.matches?.(".furl-hit")) updateLink();
      },
      true,
    );
    on(
      document,
      "keydown",
      (e) => {
        if (e.isComposing) return;
        if (
          !drag &&
          !termDrag &&
          !connection &&
          !pending &&
          root.contains(e.target)
        )
          say("");
        if (
          e.key === "Alt" &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.getModifierState("AltGraph")
        ) {
          held = true;
          if (mode === "edit") activate(null);
          refreshMode();
          return;
        }
        if (
          e.key === "Escape" &&
          (drag ||
            termDrag ||
            connection ||
            pending ||
            (activeCell && structureMode()))
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
        if (
          (e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          e.key === "Enter" &&
          e.target.matches(
            ".furl-hit:not([data-kind=binder]):not([data-kind=hole])",
          )
        ) {
          const hit = e.target,
            dest = insertionTarget(hit.closest(".furl-row"), true);
          if (dest) {
            stop(e);
            cancel();
            doCommit({ kind: "extract", ...dest, source: hit.dataset.id });
          }
          return;
        }
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
        if (
          structureMode() &&
          e.target.matches(".furl-hit") &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          stop(e);
          const from = rect(e.target),
            horizontal = ["ArrowLeft", "ArrowRight"].includes(e.key),
            sign = ["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1;
          const candidates = marked()
            .filter(
              (n) =>
                n !== e.target &&
                (!(termDrag || connection) || n.dataset.kind !== "binder"),
            )
            .map((n) => {
              const r = rect(n),
                dx = r.left + r.width / 2 - from.left - from.width / 2,
                dy = r.top + r.height / 2 - from.top - from.height / 2;
              return {
                n,
                forward: (horizontal ? dx : dy) * sign,
                cross: Math.abs(horizontal ? dy : dx),
              };
            })
            .filter((x) => x.forward > 2)
            .sort(
              (a, b) => a.forward + a.cross * 3 - (b.forward + b.cross * 3),
            );
          candidates[0]?.n.focus({ preventScroll: true });
          return;
        }
        if (termDrag?.picked && e.key === "Enter") {
          stop(e);
          updateTerm();
          dropTerm(true);
          return;
        }
        const hit = e.target.closest(".furl-hit");
        if (hit && structureMode()) {
          if (["Enter", " "].includes(e.key)) {
            stop(e);
            if (connection) {
              dropConnection(hit.dataset.kind === "binder" ? null : hit, true);
            } else if (!hit.dataset.binder && hit.dataset.kind !== "hole") {
              const r = rect(hit);
              pointer = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
              beginTerm(hit, true);
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
            !["binder", "hole"].includes(hit.dataset.kind)
          ) {
            stop(e);
            const anchor = sourceNode(hit.dataset.binder, hit);
            pointer = { x: rect(hit).left, y: rect(hit).top };
            if (
              doCommit({
                ...(hit.dataset.binder
                  ? { kind: "connect", binder: hit.dataset.binder }
                  : { kind: "term", copy: false }),
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
          if (
            mode === "edit" &&
            !drag &&
            !termDrag &&
            !connection &&
            !pending &&
            document.activeElement?.matches(".code-editor")
          )
            activate(document.activeElement.closest("[data-cell]"));
          refreshMode();
        }
      },
      true,
    );
    on(media, "change", () => {
      if (media.matches) clearReferenceAnimations();
      if (drag) positionRows();
    });
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
        if (termDrag) updateTerm();
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
        if (raw === lastRaw) {
          appearance.paint(data);
          return;
        }
        lastRaw = raw;
        const next = JSON.parse(raw);
        const changedExample = data && next.example !== data.example;
        const layout =
          JSON.stringify(next.view) + next.cells.map((c) => c.target).join("|");
        if (
          data &&
          (next.revision !== data.revision || layout !== lastLayout)
        ) {
          if (!committing) {
            cancel(false);
            positions = changedExample || matchMotion.active ? null : capture();
            if (changedExample) matchMotion.reset();
            if (changedExample)
              program
                .getAnimations({ subtree: true })
                .forEach((a) => a.cancel());
          } else {
            clearRows(false);
            drag = null;
            pending = null;
          }
        }
        data = next;
        if (matchMotion.active) matchMotion.layout();
        lastLayout = layout;
        if (!layoutFrame) layoutFrame = requestAnimationFrame(finishLayout);
      },
      destroy() {
        destroyed = true;
        zen.destroy();
        appearance.destroy();
        matchMotion.destroy();
        clearTerm();
        ac.abort();
        cancelAnimationFrame(layoutFrame);
        cancelAnimationFrame(rowFrame);
        clearTimeout(rowRecoilTimer);
        clearTimeout(statusTimer);
        clearLanding();
        clearReferenceAnimations();
        wire.clear();
        gapNodes.forEach((n) => n.remove());
        tools.replaceChildren();
        overlay.replaceChildren();
      },
    };
  };
})();
