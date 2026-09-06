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
      referenceMotion = null,
      landing = null,
      landingTimer = 0,
      rowFrame = 0,
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
      marked().forEach((n) => (n.tabIndex = selected === "connect" ? 0 : -1));
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
          selected !== "rows" ||
          !!activeCell ||
          !!connection ||
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
        const old = new Map(
          $$(":scope > .furl-hit", layer).map((n) => [n.dataset.id, n]),
        );
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
    function hoverRow(target = null) {
      const next =
        target && effectiveMode() === "rows" && !drag && !activeCell
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
      rowFrame = 0;
      if (!drag) return;
      for (const member of drag.members) {
        const old = rect(member);
        member.getAnimations().forEach((a) => a.cancel());
        member.style.transform = "";
        if (animateBack && member.dataset.picked)
          member.dataset.rowSettling = "true";
        member.removeAttribute("data-picked");
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
      program.classList.remove("furl-delete-preview", "furl-preview");
    }
    function cancel(retract = true) {
      clearLanding();
      referenceMotion = null;
      clearReferenceAnimations();
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
        cache: new Map(),
      };
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
          (n === drag.member && style === "float" && !drag.keyboard);
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
      if (moving) rowFrame = requestAnimationFrame(paintRows);
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
        say(
          drag.off
            ? "Release to delete this binding."
            : drag.outsideScope
              ? scopeMessage(drag)
              : "",
        );
        drag.lastGood = index;
      }
      drag.command = cmd;
      drag.valid = allowed.ok && !drag.outsideScope;
      const others = drag.members.filter((n) => n !== drag.member);
      const order = [...others];
      order.splice(allowed.ok ? index : drag.lastGood, 0, drag.member);
      // Advance toward the old targets first. Time spent resting in a slot
      // must not be counted as elapsed motion toward a just-selected target.
      cancelAnimationFrame(rowFrame);
      paintRows(performance.now());
      let y = Math.min(...[...drag.base.values()].map((r) => r.top));
      for (const n of order) {
        const original = drag.base.get(n);
        let dx = 0,
          dy = y - original.top;
        if (n === drag.member && style === "float" && !drag.keyboard) {
          dx = pointer.x - drag.offset.x - original.left;
          dy = pointer.y - drag.offset.y - original.top;
        }
        const s = drag.motion.get(n);
        s.tx = dx;
        s.ty = dy;
        y += original.height;
      }
      drag.order = order;
      drag.index = index;
      program.classList.toggle("furl-delete-preview", drag.off);
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
      const others = d.members.filter((n) => n !== d.member);
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
      if (
        index !== d.index ||
        d.wasOff !== d.off ||
        outsideScope !== d.outsideScope ||
        style === "float"
      ) {
        d.wasOff = d.off;
        d.outsideScope = outsideScope;
        previewRow(index);
      }
    }
    function dropRow() {
      const d = drag;
      if (!d) return;
      const before = capture();
      clearRows(false);
      // Keep the moving row above its neighbors until it settles. Otherwise
      // dropping mid-flight superimposes their glyphs during the final reflow.
      d.member.dataset.rowSettling = "true";
      drag = null;
      if (d.valid && doCommit(d.command)) {
        positions = before;
      } else {
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
    function clearLanding() {
      clearTimeout(landingTimer);
      landingTimer = 0;
      landing = null;
    }
    function updateLink() {
      // A native edit may replace the target hole before its new use is measured.
      // Keep the last drag curve until finishLayout hands it to that use.
      if (drag || connection || referenceMotion || wire.retracting) return;
      const showLinks = links && effectiveMode() === "connect";
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
              const before = gap.dataset.before;
              const others = drag.members.filter((n) => n !== drag.member);
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
        if (current === "rows") {
          stop(e);
          const member = bindingFor(e.target);
          const row = e.target.closest(".furl-row");
          if (member) {
            member.focus({ preventScroll: true });
            pending = { kind: "row", member, start: pointer };
            refreshMode();
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
            refreshMode();
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
          hoverRow(e.target);
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
    on(media, "change", () => {
      if (media.matches) clearReferenceAnimations();
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
