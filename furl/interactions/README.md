# Interaction studies

A separate design document for source-editing gestures. It does not modify the live Furl editor or use its browser storage.

- `inventory.json`: 26 sourced actions with proposed mouse/keyboard equivalents and constraints.
- `stories.js`: eight fixed before/after programs; values are presets.
- `study.js`: arithmetic row lab, reference-placement lab, storyboard renderer, and inventory filters.
- `page.html`, `style.css`: document and Furl presentation, sharing `../reference/book.css`.
- `build.py`: inlines everything into `docs/interactions.html`; Python standard library only.
- `test.cjs`: browser-level input, transaction, and offline checks.

```sh
python3 furl/interactions/build.py
python3 furl/interactions/build.py --check
node --check furl/interactions/study.js
node --check furl/interactions/stories.js
node furl/interactions/test.cjs
```

The browser test requires Playwright and installed Chrome (make Playwright available through `NODE_PATH` if needed). It defaults to opening the generated artifact with `file://`, aborts external requests, and writes screenshots to a temporary directory. `TEST_URL` can point it at a served copy. The row lab accepts numbers, identifiers, parentheses, unary minus, addition, subtraction, and multiplication; it never evaluates input as JavaScript. It uses a small lexical dependency check, not Hazel refactoring. Reload resets both labs; Undo is session-local.

The two syntax examples and layout studies elsewhere remain their own renderers. This page is an isolated input experiment; implement approved behavior through the live `FurlDocument` source/identity/history model, not by importing this arithmetic parser or scraping the DOM.

[Design notes](../design/interactions.md) record the old implementation, Big Book slide order, refactor branch snapshot, Dragology assessment, merge policy, and voice-input options. [Port ledger](../design/ports.md) keeps inspected/imported snapshots distinct from completed integrations.
