# Interaction studies

A separate design document for source-editing gestures. It does not modify the live Furl editor or use its browser storage.

- `inventory.json`: 26 sourced actions with proposed mouse/keyboard equivalents and constraints.
- `stories.js`: eight fixed before/after programs; values are presets.
- `study.js`: arithmetic row lab, reference-placement lab, storyboard renderer, and inventory filters.
- `page.html`, `style.css`: document and Furl presentation, sharing `../reference/book.css`.
- `build.py`: inlines everything into `docs/interactions.html`; Python standard library only.
- `test.cjs`: browser-level input, transaction, and offline checks, including `motion-test.cjs` for intermediate animation frames and `cell-mode-test.cjs` for whole-row dragging and cell activation.

```sh
python3 furl/interactions/build.py
python3 furl/interactions/build.py --check
node --check furl/interactions/study.js
node --check furl/interactions/stories.js
node furl/interactions/test.cjs
```

The browser test requires Playwright and installed Chrome (make Playwright available through `NODE_PATH` if needed). It defaults to opening the generated artifact with `file://`, aborts external requests, and writes screenshots to a temporary directory. `TEST_URL` can point it at a served copy. Motion checks pause browser animations and seek through insertion, rapid drag reversals, drop, and refusal. They assert painted positions as well as final row order; the previous append-and-measure loop fails the first insertion-frame check.

The row lab uses ordinary HTML inputs and a small JavaScript parser, with no Hazel editor or backend. It accepts numbers, identifiers, parentheses, unary minus, addition, subtraction, and multiplication; it never evaluates input as JavaScript. The refactor gate checks valid arithmetic and unique, in-scope names before and after a move. Completely blank drafts are omitted from that check because they bind and use no names, but remain visible as holes. Other invalid or incomplete arithmetic still blocks Refactor; this is not Hazel refactoring. Reload resets both labs; Undo is session-local.

Row motion tracks stable IDs: capture current painted positions, cancel old tweens, complete all DOM moves, measure final positions, then animate the displacement. This ordering matters when a new preview interrupts an unfinished tween. The actual dragged row stays in document flow as its own placeholder, while a transform keeps all its columns at the pointer's original grab offset. Neighbors animate; the dragged row does not lag behind the pointer. Drop and cancellation settle from the last painted position. Reduced motion skips these tweens while retaining direct pointer tracking.

Structure mode reserves no side handle or action gutter. Press anywhere on a binding row to select it, then drag to move; double-click a cell to activate text editing or read-only value selection/copying. Pointer pickup waits for movement so the two clicks do not rearrange DOM nodes or compete with cell activation. The active cell allows normal text selection until focus leaves or Escape returns to its row. The derived result row cannot move, but its expression and value follow the same activation rule. Tab into a cell also activates it; Enter/F2 on a row edits its expression. Space on a row begins keyboard movement, arrows preview, Enter commits, and Escape cancels. Normal mode retains single-click editing; insertion immediately activates the new expression.

The two syntax examples and layout studies elsewhere remain their own renderers. This page is an isolated input experiment; implement approved behavior through the live `FurlDocument` source/identity/history model, not by importing this arithmetic parser or scraping the DOM.

[Design notes](../design/interactions.md) record the old implementation, Big Book slide order, refactor branch snapshot, Dragology assessment, merge policy, and voice-input options. [Port ledger](../design/ports.md) keeps inspected/imported snapshots distinct from completed integrations.
