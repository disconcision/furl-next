# Furl front end and reference

## Decision

Furl owns the top-level workspace, page structure, navigation, and visual language. Hazel is the language and editing foundation. The intended identity is **Furl, powered by Hazel**. This fork permits changes to Hazel's styles and front end without turning every design experiment into an upstream component-extraction project.

The working branch, `furl`, starts at remote `modular-editors` commit `97cbeb3489b66415dc8b7a67b46a556fa1f7abad`. This is an integration starting point, not a claim that embeddable pattern editors are already a finished API. `src/haz3lcore/Editor.re` stores an explicit `root: Sort.t` and carries it through construction and persistence, which is useful for editors whose root is a pattern rather than an expression.

## Two implementations with distinct jobs

The reference is an executable design document. Its syntax and sample fixtures are small, use OCaml-like illustrative syntax, and do not evaluate code. It remains available offline and editable without the OCaml toolchain. The tabbed and continuous views use the same renderer, fixtures, and CSS.

The live interface uses Hazel syntax, editing actions, typechecking, and evaluation. It reuses the editor core, caret, selection, clipboard support, and probe machinery. Furl supplies the projection, program-level undo, and surrounding workspace. It does not maintain a second language model by scraping DOM text or reparsing each displayed cell independently.

The live entry point is `src/web/FurlMain.re`, with the implementation under `src/web/furl/`, using the existing Dune/js_of_ocaml toolchain. It is published at `/live/`; the root continues to serve the reference during this first study. Hazel's original entry point remains available in the source tree.

## Implemented projection

`FurlDocument` owns one Hazel `Segment.t`. A cell addresses a child of a stable tile ID, plus an offset for the trailing expression of a let scope. Function bodies and match scrutinees/arms use `Span` addresses bounded by neighboring syntax IDs. A splice restores the surrounding prefix and suffix; changing an earlier arm's length cannot shift later arm addresses. Native `CodeEditable` actions operate on an expression-root or pattern-root zipper; an edit splices its resulting pieces into the original program. Whole-program analysis supplies each cell's lexical context. Evaluation supplies real samples by syntax occurrence ID. Furling changes projection only.

Each cached cell retains its last authoritative source slice as well as its editor. Reassembling a selected zipper can allocate fresh pieces, so comparing the zipper's reconstructed pieces would spuriously reset the editor and erase selection. Comparing the stored source slice preserves selection and carets across display changes and unrelated edits. Obsolete addresses are discarded after structural edits. Undo/redo snapshots contain the program and cell states; switching to source and back adds no history.

Cursor and selection actions update only the active cell using Hazel's selection-only cache path. They retain whole-program statics, probe samples, cached value text, and inactive cells. They do not mark syntax edited or rebuild every cell. Actual edits still reanalyze and evaluate the shared program.

Arrow navigation follows visible editable cells. Left/right cross pattern/expression boundaries in reading order; up/down stay in the same attribute column, skipping static labels and values. Within multiline cells Hazel handles ordinary vertical movement. At a boundary, Furl transfers the desired `col_target` into the adjacent editor, compensating for pattern indentation. The target remains unclamped when the visible caret lands on a short line, so subsequent moves recover the intended column. Mouse and horizontal movement reset that target through Hazel's normal action handling. DOM focus follows the model after rendering, and the program scrolls to keep the caret visible.

The projection recognizes continuous `let … = … in` tiles, `fun … ->` prefixes, and `case … end` tiles with `| … =>` arms. It recursively projects their bodies, including nested lets, functions, and matches. Function tuple parameters remain one native pattern editor, marked with a dot in the expression column and a separator on the function comb. Malformed shells stay in native code; child holes remain editable. Typing a new structured expression does not automatically dismantle the active cell: explicitly furl it after editing.

Matches can show all arms as parallel columns or one arm at a time. A global display choice controls the mode. In single-branch mode, clicking its vertical match stem cycles branches (Shift-click reverses); Ctrl+Alt+Left/Right cycles the focused match. The horizontal fork still unfolds source. This stem gesture is provisional: the self-contained `src/web/www/navigation.html` compares cycling, arrows within the stem, and a floating pattern chooser. No local controls allocate a code row. Nested matches keep independent branch choices. A branch switch does not select a runtime branch, change syntax, re-evaluate, or add undo history. Repeated scrutinees and enclosing result patterns address the same syntax/editor state, but each rendered editor has a distinct view ID, so only the clicked echo owns DOM focus and a caret. Up/down navigation stays in a branch's attribute column and can leave for an enclosing continuation without visiting sibling branches.

All rows share one measured pattern/expression/value column plan. Single-branch mode measures the hidden arms too, so cycling branches keeps those column starts stable. Parallel regions sum their lane requirements; sequential scopes reuse the maximum. A match's first arm stays in its enclosing lane. Nested matches reserve additional lanes, and values keep those lanes when expressions are hidden. Pattern indentation cannot shift expression/value starts or the offside comb. The whole program scrolls horizontally on narrow screens.

The live column plan measures the widest visible native editor in each attribute. Wide programs scroll as one grid; individual cells do not scroll or clip SVG decorations. This avoids a vertical scrollbar caused by a caret extending slightly below a single text row. The reference still explores wrapping independently. `border` is an enclosing binding whose defining expression contains `twice`; its pattern therefore remains outdented, even though its displayed return expression belongs to that inner scope.

Selecting a nonblank live value inside a function with multiple calls reveals previous/next arrows in the existing value gutter. Left/right navigate calls while the value is focused; Escape restores the retained editor caret. Controls follow the nearest enclosing function, stay available if the selected value becomes blank, and disappear on code focus or projection changes. Selection is view state, outside source/history, and the controls allocate no row or column space.

Function call controls select a body probe sample in entry order, starting with the outer call. Its exact call stack and evaluation step interval constrain descendant values; the corresponding parameter sample supplies the arguments. This prevents a recursive callee's base-case value appearing alongside its caller's parameters. Calls nested inside a selected invocation are constrained by that invocation's interval. Unexecuted arms have blank values. The final program result retains its own top-level context. Selecting calls recomputes cached display values without typechecking or evaluation.

Evaluation remains synchronous with a 20,000-step budget. Values are read-only text. Call choices are indexes into the current execution and may shift after program edits; there is not yet caller/callee step-into navigation. Nested closures invoked after their enclosing call returns may show blank inner values because they fall outside its step interval; linking those to their creation environment remains future work. History, cell cursors, branch choices, and call choices are session-local; programs persist per example using Hazel's structured editor persistence. The UI reports storage failures rather than promising a save.

`test/Test_FurlDocument.re` checks evaluation, dependent samples, lexical-context changes, nested splicing, stable targets, selection across projection changes, undo/redo, reset, and evaluation-limit recovery. Browser checks exercise actual keyboard editing, echoed-cell focus, all/single branch switching, the branch shortcut, call navigation, column alignment, narrow screens, and saved-program reloads.

## Integration sequence and next steps

1. Render one let scope using Furl's grid and colors. Replace one expression field and one pattern field with Hazel editors. Retain one underlying program and lexical context so edits update the appropriate source occurrence.
2. Carry stable Hazel occurrence IDs into projected cells. Two visual echoes of a match scrutinee must route edits to the same occurrence. A display row is not a second binding or an independent program.
3. Obtain values from an actual evaluation, identified by syntax occurrence plus invocation. Reuse probe sample selection and caller/callee navigation. Read `src/haz3lcore/projectors/implementations/ProbeProj.re` and `src/web/app/probesystem/ProbeSidebar.re` as implementation references, not copied UI chrome.
4. Furl and unfurl the scope while preserving selection, caret, undo history, and call focus. Re-measure the grid when embedded editors change size.
5. The function, match, and recursive examples now exercise native parameter editors, nested scopes, and shared echoes. Next, add source-moving gestures and invocation step-into while retaining these invariants.

This makes the difficult boundary concrete while leaving room to sketch extraction, drag and drop, keyboard actions, and transitions in the reference.

## Keep the reference and live interface aligned

- Share semantic examples and expected layouts, with explicit adapters where Hazel syntax differs from the illustrative fixtures.
- Reuse the palette and grid constraints. The reference renderer is `furl/reference/study.js`; preset programs and calls are in `fixtures.js`.
- Keep syntax, invocation, projection, and geometry identities distinct. See `layout.md`.
- Record a gesture with source before/after, selection before/after, and an undo expectation. Animate identified structural states after the edit is correct.
- Keep display toggles local to a view. Hiding a comb or attribute changes presentation, not syntax or runtime state.

## Visual constraints

Use a character grid, compact uninterrupted rows, blue-gray surfaces, and restrained purple/green structure marks. Commentary belongs around the example; avoid explanatory labels inside the program. Pattern indentation is optional. Comb rails are offside decoration, not an additional indentation level. Source block names and values share a vertical alignment choice. Scope combs have no bottom foot. `FurlCombs` now supplies a shared SVG renderer and a column-local rail plan: one character between levels, with later match arms starting a local stack. Rails, forks, and parameter ticks share a 1.4px stroke with round caps. The parameter tick is 0.65 characters long. A match directly beneath function parameters starts its fork and first stem at that boundary, suppressing the upward curl that would enter the parameter row. Scope heights come from the containing layout without stretching a viewBox. See the live comb geometry in `layout.md`.

The comb is not uniformly redundant. Parameter dots and arity marks identify functions; case-pattern styling and alternative branches suggest matches. Removing the comb can still erase scope extent or the grouping of neighboring branch structures, especially with indentation or attributes hidden. The visibility switch is a design experiment, not a claim that the remaining view is always an unambiguous serialization.

## Publication

GitHub Pages publishes the `furl` branch's `/docs` directory to `https://andrewblinn.com/furl-next/`. The generated documents use relative links. The fork inherits the account's existing Pages domain; it does not alter the personal site's repository or domain settings.

The reference build is independent of Hazel compilation. Original upstream workflows are archived in `.github/upstream-workflows/`; they are available when establishing Furl's live build checks, but must not deploy this fork into Hazel's build repository.
