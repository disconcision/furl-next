# Editing the reference

- `page.html`: reading sequence and prose; `{{study:...}}` places an independent example.
- `study.html`: shared controls and editor template, also used by the switcher.
- `fixtures.js`: seven preset programs and their example values.
- `study.js`: independent view state, common column plan, cells, and comb geometry.
- `study.css`: editor appearance. `book.css`: surrounding page.
- `build.py`: inlines everything into `docs/index.html` and `docs/studies.html`.

Run `python3 furl/reference/build.py` from the repository root. `--check` verifies generated files match their sources. Both output pages work from `file://` without runtime resource requests. Companion-page and GitHub links are ordinary navigation, not dependencies of the examples.

The source archive in `../archive/` preserves the conversation fragment and its first standalone export. Edit the shared source here for further iteration rather than independently changing generated HTML or keeping another evolving renderer.

Further layout changes should check `../design/layout.md`, especially alignment across enclosing rows and branches, and verify multiple examples remain independent. When these become live examples, use actual Hazel syntax and evaluation expectations; the reference does not provide an evaluator.
