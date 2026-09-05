# Furl

An environment for working with code, bindings, and the values they produce. Furl owns the interface; Hazel supplies the language and structural editing foundation.

**[Try the live editor](https://andrewblinn.com/furl-next/live/)** · [Interactive reference](https://andrewblinn.com/furl-next/) · [Study switcher](https://andrewblinn.com/furl-next/studies.html)

The live study embeds Hazel's structural expression and pattern editors in Furl's grid. Editing a cell changes one underlying program, rechecks its lexical context, and updates dependent values using Hazel's evaluator and probes. Lets, function literals, and matches can be furled into rows or unfurled into source. Arrow keys move between editors: up/down preserve the intended column through short lines and nested indentation, and left/right cross cell boundaries. Undo/redo, display toggles, reset, and browser persistence work across four examples. Matches offer **All columns** and **One branch** views. In one-branch mode use the local arrows; **Ctrl+Alt+Left/Right** switches branches in the focused match in either mode. Function call arrows select coherent parameter/body values, including the recursive example. Temporary Violet, Coral, and Teal controls let us compare caret colors.

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

Before publishing, run `python3 furl/live/build.py --check` to verify the generated live bundle. Commit live sources and `docs/live` together, then push to `furl`. The page uses only local assets; clipboard access depends on the browser's permissions.

The live projection expands lets, function parameters/bodies, and match arms, including nesting. Repeated match inputs and result bindings share syntax/editor state with distinct visual focus. Branch navigation changes presentation; call navigation changes inspected samples. Syntax-moving gestures, cross-cell selections, and the reference's more advanced comb variations remain future work. Evaluation runs on the UI thread with a 20,000-step limit, suitable for these small studies. Undo history is session-local; each example's program is saved in browser storage. See the [architecture](furl/design/architecture.md), [layout invariants](furl/design/layout.md), and [source notes](furl/design/sources.md).

The reference remains fast to change as this integration develops. Stable syntax identities, call identities, and grid constraints should be shared across both implementations; preset samples must not become a substitute evaluator.

Hazel build instructions are in [INSTALL.md](INSTALL.md), with tests in [test/README.md](test/README.md). The existing MIT [license](LICENSE) and [icon notices](licenses/Icons.md) are retained.
