# Reference sources

The narrative is adapted from Andrew Blinn's **Furl Big Book** (103-slide supplied source deck), reordered to introduce a cell before a scope, then functions, matches, invocation context, traces, and transformations.

| Page | Main source material |
| --- | --- |
| Introduction | Slide 3: granular projection and editor splices; slide 46: let block as a common intermediate form |
| Bindings | Slides 23–31: grid, comb, and scope; slides 59–76: cells and attribute views |
| Functions | Slides 32–36: parameter openings, arity, and nested helper functions |
| Matches | Slides 37–44: branch comb, shared scrutinee, repeated result binding, and aligned returns |
| Function + match | Slides 45–48: regularizing let, function, and match forms |
| Calls and traces | Slides 49–52: repeated evaluations, values beside syntax, and trace columns |
| Extraction | Slides 46–48: transformations through regular forms; slide 95: circle/distance helper example |
| Live implementation | Slide 57: Furl with Hazel editor splices; revised to give Furl ownership of the surrounding interface |

Programs are new illustrative fixtures rather than exact deck transcriptions. Call navigation takes inspiration from Hazel's probe interface. The recursive study represents one run with four invocation records; values are preset.

Layout and comb choices incorporate the subsequent discussion: a text grid, independently visible bindings/expressions/values, granular furling, offside combs, optional pattern indentation, shared column planning, paired name/value alignment, curved match junctions, and whole-comb visibility.

The deck and old Furl repo remain separate reference sources. This repository contains the working HTML and derived notes; it does not need a second PowerPoint copy to build.

The hazelnut mark is embedded from `src/web/www/img/hazelnut.svg`, recolored for this interface. Inherited attribution is in `licenses/Icons.md`; the MIT notice is in `LICENSE`.

The navigation study at `/live/navigation.html` compares new branch gestures without extra code rows. A fresh inspection of the Big Book's match sequence (37–44) and trace sequence (49–52), including the rendered shared-scrutinee and trace diagrams on 41 and 50, found parallel columns rather than a specified branch-switching gesture. The selected-value arrows follow Hazel's probe affordance (`ProbeProj.re` and `proj-probe.css`); Furl uses its own call-context selection and layout.

## Interaction inventory (September 2026)

`furl/interactions/` and `design/interactions.md` add a source-backed interaction inventory and a separate offline proposal. The implementation was inspected at old Furl `4967561c010bdfc65a5100d6c2db266b3fcc0a50`; Hazel refactorings was inspected at `7dbd77039d7caccc2d077ce922a8beece97167d6`. Neither historical app nor refactor suite was run as part of that source inventory.

The full PowerPoint was extracted and rendered, including hidden slides 56, 57, and 97. All slide references use the original 103-slide order. Default PDF export omits those three, so its page numbers diverge after slide 55. Gesture sources are especially slides 10–12, 17–18, 37–48, 53–55, and 84–96. Row insertion/movement/reference demos are new isolated prototypes; the eight larger transforms are fixed before/after states with preset values.

Dragology assessment uses the local `draggable-diagrams/d2-paper.pdf` (Fig. 1 and architectural discussion), `declarative-dragging/main.tex` as a separate draft source, and the library guide/code. No paper or PowerPoint binary is republished. `design/interactions.md` includes a bounded voice-input assessment with current official API/browser sources.
