# Furl layout model — alignment revision

The previous renderer sized each row from its local width. A containing scope and a match branch therefore assigned different horizontal positions to the same expression or value column. Character-grid snapping alone could not enforce alignment.

## Separate identities

- **Syntax:** stable node IDs, expression kinds, definitions, parameters, and branches. In a live editor, echoed match references should retain the identity of their shared syntax occurrence for selection and editing.
- **Evaluation:** invocation IDs, caller/callee links, argument values, and samples associated with syntax nodes. Choosing a call changes the inspected samples, not the source program.
- **Projection:** rows identify their source node, structural branch position, and visible pattern/expression/value cells. Values additionally identify their invocation.
- **Geometry:** a single column plan places all these cells. Decorations consume the resulting rectangles.

The studies use preset samples and explicit call records. A live implementation should retrieve samples by syntax-node ID and invocation ID, rather than infer them from displayed text.

## Plan columns before rendering rows

1. Assign structural branch regions. The first branch continues its enclosing region; siblings receive adjacent regions. Sequential scopes reuse regions. Parallel branches add their required widths, while sequential children take the maximum requirement.
2. Solve pattern, expression, and value widths once for the alignment group. The prototype uses bounded widths in character cells. A production measurement pass can collect content requirements before applying width limits.
3. Each cell uses its named column start. Enclosing rows and branch rows consume the same starts. Pattern indentation is internal to the pattern cell and cannot alter an expression or value start.
4. Place each value in the branch region associated with its invocation. Enclosing parameter values and values within that branch share the same value-column start. Multiple invocations retain distinct value positions.
5. Wrap text inside assigned cells. Row heights are whole multiples of the text line height. On narrow surfaces, stack branch regions while preserving the common column starts.
6. Draw combs, parameter marks, and block decorations from the final rectangles. Their shape and click targets cannot allocate code indentation.

Furling changes which rows are shown. It does not let an individual row invent a new column plan. Explicit source can wrap within its existing expression column; the name and value use the same top/bottom alignment choice.

## Call navigation

The recursive example represents one run, `sum [2,4,6] → 12`. Sample arrows select an invocation from that run, and a recursive result can step into its callee. The focused call and its caller are shown outside the code. The outer answer's value is suppressed when that source occurrence is outside the focused invocation.

This borrows sample navigation and step-into concepts from Hazel's probe UI; it is not connected to Hazel's evaluator.

## Verification constraints

- Same expression region ⇒ identical expression starts across enclosing rows, branches, and returns.
- Same invocation region ⇒ identical value starts across parameter and body rows.
- Hiding expressions preserves distinct branch value regions.
- Pattern indentation leaves expression, value, and comb positions fixed.
- Source-block name and value share the selected vertical alignment.
- Navigating calls leaves the source program unchanged.

Nested branch planning and live sample routing should remain separate: geometric nesting is not a substitute for runtime call identity.

## Live branch projection

The live implementation now applies the shared lane plan to nested matches. `All columns` sums branch widths; `One branch` shows one selected arm at each match. Native editor measurements determine shared source attribute widths before rendering; live values divide the container’s remaining width among the visible lanes and use Hazel’s structural probe abbreviation to fit. They do not wrap, change row heights, or enlarge the grid. Single-branch mode measures all source arms, so cycling branches keeps column starts stable. Branch results align at the bottom when neighboring arms contain different numbers of let rows. The live view scrolls the whole grid on narrow surfaces.

Syntax addresses and view IDs are separate: repeated match inputs and result bindings share editable syntax, while focus identifies exactly one visual echo. A branch choice does not alter execution. Function call selection uses real Hazel probe call stacks and step intervals, independently of the geometric branch choice.

## Live comb geometry

`FurlCombs.plan` counts structural rail levels per column before drawing. Adjacent rails have a pitch of one text character. The innermost reserved level is one character to the left of the code. Sequential scopes share the same rail plan; pattern indentation does not participate.

The first match arm continues the enclosing column's levels. Each later arm begins with its own match stem at level zero, and its body adds levels inward. The branch gutter reserves enough space for those local rails. This is why the recursive example's second arm has two rails: the match stem, then the local `let tail = sum(rest) in head + tail` scope. The let rail belongs inside its match stem. Single-branch mode reserves levels for every alternative, avoiding rail jumps while cycling. Hiding combs retains the same layout.

All comb ink is SVG, including the curved hooks, match fork/bridge, branch stems, and function parameter tick. Strokes are 1.4 CSS pixels with round caps. Curves use unscaled character-based coordinates; vertical lines inherit their containing scope's height. The parameter tick extends 0.65 characters. Match forks retain their pointed junctions; scope bottoms have rounded ends without feet. Transparent buttons provide the click areas separately from the strokes, and let/function rail tooltips show the corresponding source scope.
