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
