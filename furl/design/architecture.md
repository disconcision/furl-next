# Furl front end and reference

## Decision

Furl owns the top-level workspace, page structure, navigation, and visual language. Hazel is the language and editing foundation. The intended identity is **Furl, powered by Hazel**. This fork permits changes to Hazel's styles and front end without turning every design experiment into an upstream component-extraction project.

The working branch, `furl`, starts at remote `modular-editors` commit `97cbeb3489b66415dc8b7a67b46a556fa1f7abad`. This is an integration starting point, not a claim that embeddable pattern editors are already a finished API. `src/haz3lcore/Editor.re` stores an explicit `root: Sort.t` and carries it through construction and persistence, which is useful for editors whose root is a pattern rather than an expression.

## Two implementations with distinct jobs

The reference is an executable design document. Its syntax and sample fixtures are small, use OCaml-like illustrative syntax, and do not evaluate code. It remains available offline and editable without the OCaml toolchain. The tabbed and continuous views use the same renderer, fixtures, and CSS.

The live interface uses Hazel syntax, editing actions, typechecking, and evaluation. It reuses the editor core, caret, selection, clipboard support, and probe machinery. Furl supplies the projection, program-level undo, and surrounding workspace. It does not maintain a second language model by scraping DOM text or reparsing each displayed cell independently.

The live entry point is `src/web/FurlMain.re`, with the implementation under `src/web/furl/`, using the existing Dune/js_of_ocaml toolchain. It is published at `/live/`; the root continues to serve the reference during this first study. Hazel's original entry point remains available in the source tree.

## Implemented first slice

`FurlDocument` owns one Hazel `Segment.t`. A cell addresses a child of a stable tile ID, plus an offset for the trailing expression of a let scope. Native `CodeEditable` actions operate on an expression-root or pattern-root zipper; an edit splices its resulting pieces into the original program. Whole-program analysis supplies each cell's lexical context. Evaluation supplies real samples by syntax occurrence ID. Furling changes projection only.

Each cached cell retains its last authoritative source slice as well as its editor. Reassembling a selected zipper can allocate fresh pieces, so comparing the zipper's reconstructed pieces would spuriously reset the editor and erase selection. Comparing the stored source slice preserves selection and carets across display changes and unrelated edits. Obsolete addresses are discarded after structural edits. Undo/redo snapshots contain the program and cell states; switching to source and back adds no history.

The first projection recognizes continuous `let … = … in` tiles, including nested definitions. Other forms remain real Hazel syntax, so functions, cases, holes, and incomplete edits still use Hazel's normal language behavior. All rows share one column plan. Pattern indentation cannot shift expression/value columns or the offside comb.

Limits are deliberate: evaluation is synchronous with a 20,000-step budget, values display the first probe sample at each visible expression occurrence, and there is no invocation-selection UI yet. This projection does not descend into functions or case alternatives, avoiding ambiguous sample mixtures inside those bodies. A future projection must select samples by invocation as well as occurrence. History and cell cursors are session-local; programs persist per example using Hazel's structured editor persistence. The UI reports storage failures rather than promising a save.

`test/Test_FurlDocument.re` checks evaluation, dependent samples, lexical-context changes, nested splicing, stable targets, selection across projection changes, undo/redo, reset, and evaluation-limit recovery. Browser checks exercise actual keyboard editing and saved-program reloads.

## Integration sequence

1. Render one let scope using Furl's grid and colors. Replace one expression field and one pattern field with Hazel editors. Retain one underlying program and lexical context so edits update the appropriate source occurrence.
2. Carry stable Hazel occurrence IDs into projected cells. Two visual echoes of a match scrutinee must route edits to the same occurrence. A display row is not a second binding or an independent program.
3. Obtain values from an actual evaluation, identified by syntax occurrence plus invocation. Reuse probe sample selection and caller/callee navigation. Read `src/haz3lcore/projectors/implementations/ProbeProj.re` and `src/web/app/probesystem/ProbeSidebar.re` as implementation references, not copied UI chrome.
4. Furl and unfurl the scope while preserving selection, caret, undo history, and call focus. Re-measure the grid when embedded editors change size.
5. Add the function example with a pattern-root parameter editor, then the match example. Check nested scopes and echoed references before adding gestures that move syntax.

This makes the difficult boundary concrete while leaving room to sketch extraction, drag and drop, keyboard actions, and transitions in the reference.

## Keep the reference and live interface aligned

- Share semantic examples and expected layouts, with explicit adapters where Hazel syntax differs from the illustrative fixtures.
- Reuse the palette and grid constraints. The reference renderer is `furl/reference/study.js`; preset programs and calls are in `fixtures.js`.
- Keep syntax, invocation, projection, and geometry identities distinct. See `layout.md`.
- Record a gesture with source before/after, selection before/after, and an undo expectation. Animate identified structural states after the edit is correct.
- Keep display toggles local to a view. Hiding a comb or attribute changes presentation, not syntax or runtime state.

## Visual constraints

Use a character grid, compact uninterrupted rows, blue-gray surfaces, and restrained purple/green structure marks. Commentary belongs around the example; avoid explanatory labels inside the program. Pattern indentation is optional. Comb rails are offside decoration, not an additional indentation level. Source block names and values share a vertical alignment choice. Scope combs have no bottom foot.

The comb is not uniformly redundant. Parameter dots and arity marks identify functions; case-pattern styling and alternative branches suggest matches. Removing the comb can still erase scope extent or the grouping of neighboring branch structures, especially with indentation or attributes hidden. The visibility switch is a design experiment, not a claim that the remaining view is always an unambiguous serialization.

## Publication

GitHub Pages publishes the `furl` branch's `/docs` directory to `https://andrewblinn.com/furl-next/`. The generated documents use relative links. The fork inherits the account's existing Pages domain; it does not alter the personal site's repository or domain settings.

The reference build is independent of Hazel compilation. Original upstream workflows are archived in `.github/upstream-workflows/`; they are available when establishing Furl's live build checks, but must not deploy this fork into Hazel's build repository.
