# Old Furl parity round

The live target is Edit / Move / Copy, with Refactor / Refine / Free independent.
Move and Copy share targeting: a name creates a reference; an expression's
operator or delimiter picks the whole corresponding term; row whitespace at
least one character away from syntax picks its binding subtree. No token-gap
drops. Refine copies into compatible holes, while moving a populated source
leaves a hole and therefore requires Free. Free may replace a complete term.
Hover previews must show the complete source/destination, not just a delimiter.
The existing connected-variable cable remains the atomic instance of this.

Implemented in this round: faint delayed insertion hints beginning at the pattern text;
shared Move/Copy; native whole-term targeting/transfers; row copies with fresh
identities and collision-free names; term extraction and unresolved-name
definition through the boundary above the source row; generated row names;
a complete studies menu; optional old-Furl-inspired theme.

Two new standalone study sheets: (1) offside recovery space and term palettes,
comparing a vertical rail, a shelf, and separate patches, with move-out stash
versus copy-out palette semantics; (2) naming, emoji aliases, usage styling and
theme choices. They are dated design records, not maintained replicas of live
Hazel. Emoji aliases are presentation proposals, not a rename of program source.

Implementation checks: native identities, lexical and type gates, precedence,
overlap/self-drop, fresh names including unresolved identifiers, Undo/Redo,
same-scope extraction, pointer/keyboard parity, theme metrics and hit positions,
animated cancellation, and reduced motion. Keep old sources and the Big Book
read-only. Full Hazel refactorings is not merged; record any selective reuse.


Boundaries deliberately retained: expression terms only (no token whitespace, pattern/type transfer or embedded projector copies); same-let-scope row copying; extraction immediately above the term's row; conservative totality checks for checked transformations. Generic terms carry a source-text preview and the native containers reflow on commit. The existing atomic reference opening/removal animation and wire physics remain in use; full compound-term glyph morphing is not claimed. The offside and emoji/usage proposals remain independent sketches. The optional pixel theme is live and measured, with stable mild glyph offsets rather than the old larger displacement.


Verification completed: FurlDocument native suite (33 cases, including fresh copied identities, grouping, lexical rejection, recursive self references, extracted/defined names and exact Undo); browser suites for whole terms, shared targeting, named draft focus, row movement/resistance, existing reference opening/removal, nested functions/matches, theme geometry and responsive layouts. Standalone studies exercise parking/returning, template copy-out, editing/Undo, alternate layouts and unique stable aliases. Generated reference, interaction, study and live bundle checks are required before publication.


## Review revision: appearance and offside rail

Emoji aliases remain deferred from live Furl. The appearance sheet adds circles
(on by default) with lilac/cream/mint/slate/rose colors. The accepted usage scheme
is muted unused, normal once, underlined multiple; ink, dots and the old underline
experiment remain comparisons. Margin ticks are retired. Live Furl uses native
lexical occurrence counts, replacing the unused warning backing while retaining
inspector totals. Old-Furl colors/hover, operator/callee tiles, stronger selected
shards and white-shadow unused names are presentation only; holes stay upright.

The revised offside sheet chooses one rail. Cards are inert row or expression
syntax, ordered through drops near the line, scrollable, collapsible and movable
or copyable. Starter templates are ordinary cards. Nested hole filling/term
replacement now work in its small template tree; it has no Hazel typechecking,
evaluation or arbitrary text entry. Shelf/patch arrangements, card joining and
binding-environment metadata are deferred. Reinsertion interprets names in the
destination; native policy checks still matter when this reaches live Furl.

Live extraction now refuses bare bound-variable aliases in all three policies;
unresolved names still create definitions. Example changes clear cross-program
motion. Match layout has an icon and a horizontal comb gesture using actual
native branches: pull a secondary stem inward to collapse; pull the single fork
outward to expand. Preview/cancel changes only view state and never Undo/source.
The selected branch remains the visible card at collapse. Reduced motion skips
tweening. Basic clicks still provide source unfurling / branch cycling.

Possible next boundary interaction: latch or hold a dedicated insertion modifier
to reveal slots only while needed; alternatively pick an anchor row and choose
Before/After with a small transient pointer-distance selector. Neither needs a
permanent gap or extra code row. These remain proposals, not implemented modes.
Keep the comb's resting geometry disciplined; use elastic motion during gestures
rather than randomizing scope endpoints.

The appearance sheet records ↳ / ◇ / ▶ entry-marker candidates and recommends
separating lexical placement from sibling editor views when extracting helpers.
The live result label remains unchanged pending a choice.

Revision validation: all 33 FurlDocument tests passed, including the new
bound-reference extraction refusal in all three policies. Browser checks passed
for study nested drops/ordering/scroll/collapse/emoji swatches, native match
motion/cancellation/history/reduced motion, usage/role/selection styling, term
editing, call/branch navigation, cable landing and reference opening/removal.
Desktop and narrow layouts were visually inspected. Generated interaction,
study and live packages pass their byte-for-byte checks.
