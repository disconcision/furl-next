# Furl

An environment for working with code, bindings, and the values they produce. Furl owns the interface; Hazel supplies the language and structural editing foundation.

**[Try the live editor](https://andrewblinn.com/furl-next/live/)** · [Interactive reference](https://andrewblinn.com/furl-next/) · [Study switcher](https://andrewblinn.com/furl-next/studies.html)

The live study embeds Hazel's structural expression and pattern editors in Furl's grid. Editing a cell changes one underlying program, rechecks its lexical context, and updates dependent values using Hazel's evaluator and probes. Lets, function literals, and matches can be furled into rows or unfurled into source. Arrow keys move between editors: up/down preserve the intended column through short lines and nested indentation, and left/right cross cell boundaries. Undo/redo, display toggles, reset, and browser persistence work across four examples. Matches offer **All columns** and **One branch** views. In one-branch mode click the vertical match stem to cycle branches (Shift-click reverses); **Ctrl+Alt+Left/Right** switches branches in the focused match in either mode. Select a live value inside a function to reveal its call arrows; ←/→ steps through coherent parameter/body values, and Escape returns to code. These controls use the existing margins without adding rows. A [self-contained navigation study](https://andrewblinn.com/furl-next/live/navigation.html) compares three provisional branch gestures. Temporary Violet, Coral, and Teal controls let us compare caret colors.

The reference contains seven interactive design studies with preset values, including more developed function/match projections and call navigation. Each reference page is a self-contained HTML file that opens offline. The live app is a separate, compiled web application.

## Repository organization

| Location | Purpose |
| --- | --- |
| [`furl/reference/`](furl/reference/) | Editable page, shared study renderer, styles, and preset programs |
| [`furl/design/`](furl/design/) | Layout model, implementation decisions, and source notes |
| [`furl/archive/`](furl/archive/) | Preserved conversation study and its original standalone export |
| [`src/web/furl/`](src/web/furl/) | Live program model, projection, app, and embedded editor views |
| [`furl/live/build.py`](furl/live/build.py) | Release compilation and Pages packaging |
| [`docs/live/`](docs/live/) | Generated live app and its local assets |
| [`docs/index.html`](docs/index.html) | Generated reference page; GitHub Pages entry point |
| [`docs/studies.html`](docs/studies.html) | Generated tabbed study view, using the same renderer |
| `src/`, `test/`, build files | Inherited Hazel implementation and toolchain |
| [`furl/UPSTREAM-README.md`](furl/UPSTREAM-README.md) | Original Hazel overview and build instructions |

`furl` is the working/default branch. It starts from Hazel's `modular-editors` commit `97cbeb3489b66415dc8b7a67b46a556fa1f7abad`. The repository is a fork of `hazelgrove/hazel`; the local `upstream` remote tracks that project and `origin` points here. The older `disconcision/furl` repo remains separate.

## Update the reference

```sh
python3 furl/reference/build.py
python3 furl/reference/build.py --check
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/`, or open `docs/index.html` directly. The build needs only Python's standard library. It inlines the CSS, JavaScript, and Hazel mark; the interactive page makes no external resource requests.

Edit the sources in `furl/reference/`, rebuild, and commit both sources and generated HTML. Push to `furl` to publish `/docs` through GitHub Pages. Generated output is committed so publication does not depend on a Hazel compilation. The original Hazel documentation also remains in `docs/`.

Inherited workflows are preserved under `.github/upstream-workflows/`. The Furl reference check runs separately; Hazel's deployment to `hazelgrove/build` is not used by this fork.

## Build the live interface

With the Hazel opam dependencies installed:

```sh
python3 furl/live/build.py
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/live/`. For a development build, run `opam exec -- dune build src/web/www/furl.js @src/web/default --profile dev`, serve `_build/default/src/web/www`, and open `/furl.html`. The Furl entry point is separate from Hazel's original `Main.re`.

Run the shared-program tests with:

```sh
opam exec -- dune build test/haz3ltest.bc.js --profile dev
IDB_STUB="$PWD/test/idb_stub.js" TEST_JS="$PWD/_build/default/test/haz3ltest.bc.js" bash test/run_node.sh test FurlDocument
```

Browser navigation checks use Playwright with Chrome installed (or make Playwright available through `NODE_PATH`):

```sh
TEST_URL=http://localhost:8000/live/ node furl/live/test-navigation.cjs
node furl/live/test-navigation-study.cjs
TEST_URL=http://localhost:8000/live/ node furl/live/test-inspector.cjs
TEST_URL=http://localhost:8000/live/ node furl/live/test-values.cjs
```

The first checks value inspection, caret restoration, branch gestures, nested call contexts, and control geometry. The second opens the study from `file://` with network requests blocked and exercises all three concepts. The inspector check covers caret/type/error information, shared-source error counts, holes, and evaluation feedback. The value check covers responsive structural abbreviation, bounded rows, shared branch widths, and call navigation. All save light/dark screenshots in a temporary directory.

Before publishing, run `python3 furl/live/build.py --check` to verify the generated live bundle. Commit live sources and `docs/live` together, then push to `furl`. The page uses only local assets; clipboard access depends on the browser's permissions.

Live values use the remaining column space, then Hazel’s structural probe abbreviation when they need to shrink. Resizing reveals or abbreviates detail without changing the program or reevaluating it.

The footer follows the caret with Hazel's syntactic form, type, and error explanation. The right side counts whole-program errors, with holes and warnings shown separately when present.

The live projection expands lets, function parameters/bodies, and match arms, including nesting. Repeated match inputs and result bindings share syntax/editor state with distinct visual focus. Branch navigation changes presentation; call navigation changes inspected samples. Syntax-moving gestures, cross-cell selections, and the reference's more advanced comb variations remain future work. Evaluation runs on the UI thread with a 20,000-step limit, suitable for these small studies. Undo history is session-local; each example's program is saved in browser storage. See the [architecture](furl/design/architecture.md), [layout invariants](furl/design/layout.md), and [source notes](furl/design/sources.md).

The reference remains fast to change as this integration develops. Stable syntax identities, call identities, and grid constraints should be shared across both implementations; preset samples must not become a substitute evaluator.

Hazel build instructions are in [INSTALL.md](INSTALL.md), with tests in [test/README.md](test/README.md). The existing MIT [license](LICENSE) and [icon notices](licenses/Icons.md) are retained.
