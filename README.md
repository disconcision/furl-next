# Furl

An environment for working with code, bindings, and the values they produce. Furl owns the interface; Hazel supplies the language and structural editing foundation.

**[Read the interactive reference](https://andrewblinn.com/furl-next/)** · [Study switcher](https://andrewblinn.com/furl-next/studies.html)

The current page contains seven interactive design studies with preset values. It supports granular furling, attribute visibility, display alternatives, and call navigation. It does not yet edit or evaluate Hazel programs. Each published page is a self-contained HTML file that also opens offline.

## Repository organization

| Location | Purpose |
| --- | --- |
| [`furl/reference/`](furl/reference/) | Editable page, shared study renderer, styles, and preset programs |
| [`furl/design/`](furl/design/) | Layout model, implementation decisions, and source notes |
| [`furl/archive/`](furl/archive/) | Preserved conversation study and its original standalone export |
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

The next implementation slice is one Furl scope containing actual Hazel expression and pattern editors, with values obtained through the probe machinery. See the [architecture and first slice](furl/design/architecture.md), [layout invariants](furl/design/layout.md), and [source notes](furl/design/sources.md).

The reference remains fast to change as this integration develops. Stable syntax identities, call identities, and grid constraints should be shared across both implementations; preset samples must not become a substitute evaluator.

Hazel build instructions are in [INSTALL.md](INSTALL.md), with tests in [test/README.md](test/README.md). The existing MIT [license](LICENSE) and [icon notices](licenses/Icons.md) are retained.
