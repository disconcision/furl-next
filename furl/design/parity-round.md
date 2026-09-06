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
