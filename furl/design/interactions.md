# Writing and manipulating programs in Furl

Design study, 2026-09-05. The [self-contained interaction page](https://andrewblinn.com/furl-next/interactions.html) accompanies this note. Its two working studies use a limited standalone implementation; the transformation storyboards are fixed before/after examples. Their exercised row/reference core is now also ported to the live Hazel-backed editor; the standalone page still uses its own limited implementation. The [staged inventory](../interactions/inventory.json) records their coverage separately from live Furl, with mouse/keyboard proposals, constraints, source evidence, and an explicit next step for each action.

## Recommendation

The exercised core is now ported: row insertion, selection, movement and deletion; reference creation, movement and unplugging; cancellation and one-step Undo. These share the native editing/navigation and let/function/match views in live Furl. Row movement remains within one let scope. This is a meaningful first Hazel prototype without waiting for every scope transformation.

Do one more focused study of shared Copy and token/form targeting as the next interaction experiment. The current **Edit / Rows / Connect** division is an affordance experiment: whole-row pickup competes with token pickup and caret placement. It is not a semantic classification or a commitment to three permanent tools. Compare row whitespace plus token/delimiter hits against whole-row primacy, and offer buttons that latch otherwise held modifiers. Keep the independent **Refactor / Refine / Free edit** policy provisional too; the study leaves ordinary typing unrestricted. Shape and Inspect are icon/targeting sketches, not agreed tool boundaries.

Use **Command+Enter** on macOS / **Ctrl+Enter** elsewhere for a new Furl binding below the focused logical row; add Shift for above. Preserve native Enter for now, including completion/menu acceptance and multiline source. We can compare plain Enter for insertion later; changing it immediately would make the same subeditor behave differently depending on projection and transient completion state.

For keyboard movement, focus the row itself, press Space to pick up, use arrows to inspect destinations, Enter to commit, and Escape to cancel. A picked-up row can also be placed by clicking a destination gap. With no move active, Enter/F2 edits its expression; Tab into any cell is the keyboard equivalent of double-click activation. Reuse the destination protocol for branches and comb endpoints. Do not replace Shift+Arrow text selection with the old prototype's row-swap shortcut.

The first page demonstrates insertion and dependency-checked/free row movement, reference creation, and before/after structural transformations. The row lab deliberately understands only numbers, identifiers, parentheses, +, -, and *; it is not a substitute language implementation. Other transformation values are preset examples.

## What was actually found

### Old implementation

Source inspection of `Dropbox/projects/furl`, commit `4967561c010bdfc65a5100d6c2db266b3fcc0a50`. The inventory describes reachable event/update paths, not a fresh runtime verification of this historical app. `furl-clj/src/hello_world/core.cljs` is an earlier character-input experiment; it does not supply the structural interactions discussed here.

The Reason implementation has:

- Always-active separators between rows, including before the first and after the last, with click insertion and drop targets (`BlockView.re:27`). Entire row backgrounds are draggable (`:50`); dropping on a row inserts after it.
- Row reordering and Shift-drag copying (`Update.re:179–225`). Keyboard Enter inserts below, Shift+Up/Down swaps rows, Space creates a word, arrows navigate, Delete/Backspace remove at the current structural focus (`Keyboard.re:3–20`, `Update.re:360–523`). Undo shortcuts are stubs, not functioning undo.
- Dragging a pattern variable copies its name into a later expression's word slot; the binder stays put. Word-gap drops insert and word drops replace (`Update.re:246–327`). This is a linear row-index check, not the binding-resolution machinery a nested Hazel program needs.
- Expression-word moves and Shift-copy; word separators; draggable palette words. These operate on words, not arbitrary expression trees.
- Dragging an unresolved name to the gap immediately above its own row creates a definition. Dragging a literal there creates a fresh binding and replaces the literal with its name (`Update.re:187–203`). These are narrower than general extraction.
- Dropping an expression word or row on the page background puts it into a visible trash collection; items can be dragged back. `PickupTrash` removes the item before a successful drop, with an explicit TODO about canceled restoration. Prefer ordinary deletion plus working undo before recreating this metaphor.
- Binder/use highlighting, unused/single/multiple-use styles, name/emoji display, and UID-based 150ms position/scale transitions (`PatView.re`, `Animate.re`). Animation is functional precedent, not a reason to inherit its overshoot or its always-active dragging.

There is no function or match constructor in this version's `Expression.t`; its live view is a flat sequence. `FurledBlock.re` substitutes single-use definitions and discards dead ones for a debug conversion; `DebugPrint` invokes it, but it is not a complete interactive nested projection. Do not attribute the Big Book's comb gestures to this code.

### Big Book

Inspected all 103 PPTX slides as extracted text plus rendered contact sheets, with larger renderings of interaction diagrams. Numbering here is **PowerPoint slide order, including hidden slides 56, 57, and 97**. The earlier default PDF export omitted those three, so PDF page numbers after 55 do not equal slide numbers. The source is Andrew's supplied `furl bigbook.pptx`; it remains outside the repo.

The main interaction material is:

| Slides | Evidence and implications |
| --- | --- |
| 10–12 | Modifier-drag creates argument/branch sections; a common block form can acquire parameters and branches. |
| 17–18 | Deliberately distinguishes dataflow-style reordering from lexical order; proposes semantic feedback and refactoring suggestions when dependencies break. Current Furl has Hazel lexical semantics. |
| 37–48 | Refutable patterns introduce matches; scrutinee and terminal binding are shared echoes, with inserted alignment space. Expression abstraction and its inverses bridge lets/functions/matches. |
| 49–55 | Multiple evaluation columns, identity abbreviation, non-persistent evaluation-inspired rewrites, exploding nested applications, adding a branch, specializing an example. |
| 64–65, 76, 79–82 | User/direct and derived attributes; automatic names; different cell views; later types, environments, assertions, comments. |
| 84–88 | Gutter row operations; keyboard modifiers; leftward gestural variants; move, copy, and create a nested block. Slide 87 keeps the right side available for drag-to-reference. |
| 89 | Resize a block by dragging comb endpoints. This changes scope, not merely layout. |
| 90 | Drag down from the top of a block to make crossed rows parameters and create an application below. |
| 91, 94 | Refutable pattern produces a fork; click or pull right to create a branch; enter its pattern/body using Tab or click. |
| 92 | Un-abstract a single-use abstraction, including partial and shared/unshared dependency cases. |
| 93 | Move upward while accumulating dependencies; abstract over a dependency that cannot be carried. |
| 95–96 | Concrete helper extraction and moving a shared helper out of branch structure. |
| 98–102 | Further view/highlighting/trace arrangements; these diagrams do not specify additional complete gestures. |

The deck suggests automatic form changes after pattern entry. Initial recommendation: show a fork proposal after the pattern is complete and explicitly accept it. This is an intentional deviation, consistent with today's rule that typing a new let does not automatically dismantle its active editor.

## Input and targeting contract

**Row and cell targeting.** The Rows tool uses the entire binding row as the drag target, including its pattern, expression, and value columns. There is no side handle or reserved action gutter. A single click focuses the row; crossing the pointer slop threshold begins a move. Double-click activates one cell for editing or value interaction, and that cell supports ordinary text selection until focus leaves or Escape returns to the row. Values remain read-only; activation allows selection/copying in the study. Normal mode keeps single-click cell editing. A new row immediately activates its expression. Insertion targets remain narrow overlays at true binding boundaries, not extra-height rows; their marks share the comb margin. A hovered row receives a subtle background across its width.

The comb continues to express scope. In normal mode its existing clicks furl/unfurl or navigate branches. The proposed Shape tool can reveal endpoint/fork handles that act on source. Endpoint hits must win over stem hits and row drags. When combs are hidden, structural commands remain available through the row surface and keyboard.

**Quasimode.** Option/Alt reveals pointer affordances only while the pointer is over a study/editor. Do not consume Alt text input, word-navigation chords, AltGr, composition, or browser menu shortcuts. Clear held state on blur/visibility loss. Latch the operation at pickup so releasing the modifier mid-drag does not change its meaning; Escape, pointer cancellation, or window blur cancels. This key is provisional: test on the actual macOS/browser combination before making it the only shortcut. The explicit toggle is always available, including touch.

**Logical targets.** A row is a projection artifact, not a source address. Operations carry the authoritative source occurrence, owning scope, branch path, and before/after relation. A let nested across six display rows moves as one binding with its defining subtree; its continuation does not move with it. A parameter row and a branch pattern are different target kinds. The final `result` label is derived and not draggable as a binding.

For Command+Enter, a caret in an ordinary let targets its enclosing let sequence. At a projected terminal result, insert immediately before that terminal expression. At a function parameter, insert at body start. At a branch pattern, insert at that arm's body start. In a multiline unexpanded cell, the whole cell's logical row determines the boundary; never split its source at the visible caret line. A fresh pattern hole has no binder identity and cannot be referenced until named. New expressions receive focus; reveal a hidden expression column when needed.

Echoed match scrutinees and enclosing result patterns must resolve to one original occurrence. A structural action on an echo acts once. Alignment-only blank rows are not insertion slots; a branch lane determines which lexical boundary a nearby gesture refers to. Select a specific scope when several boundaries coincide vertically.

**Transactions.** Pointer and keyboard request the same candidate operation. Freeze source revision, projection plan, selected source IDs, and caret when pickup begins. Preview without replacing live document state, persisting, or adding history. Cancel on source revision change. On commit, apply one transaction, reanalyze/evaluate once, restore focus by identity, and create one undo entry. Cancel restores source, projection, and caret exactly. Do not show old runtime samples as values of a changed candidate.

## Refactor means a checked transformation

Free edit permits dependency and scope changes, but still preserves tree well-formedness, unique IDs, and honest errors/holes. Refactor only offers transformations whose preconditions we actually check. Display “unavailable” with a relevant blocker rather than quietly falling through to a different operation.

A dependency-preserving swap is not a blanket equivalence proof. Hazel is strict: moving a computation out of an unselected branch, duplicating a divergent computation, or deleting an unused failing definition can change behavior. Even in pure terminating code, probes may show a different number/order of evaluations. Separate preservation of program results from preservation of the exact trace.

Likewise, inserting `let <pattern-hole> = <expression-hole> in body` introduces incomplete syntax and potential evaluation behavior. It is an ordinary reversible edit. If exact no-op insertion becomes important, choose an explicit unit-valued unused binding or a view-only draft row; these have different semantics and UX. The current proposal uses a real source edit and does not silently choose a default value.

Initial refactor gates should be deliberately narrow: same-scope independent definitions with distinct binders; known total expressions for operations that reorder or duplicate evaluation; no capture; known/disjoint branch patterns for branch reordering; no unresolved holes where a proof depends on them. Later transformations can widen that domain with focused tests. Do not determine preservation by comparing a few live values.

## Hazel branch: what to reuse

Inspected remote/local `refactorings` at `7dbd77039d7caccc2d077ce922a8beece97167d6`; remote SHA verified on 2026-09-05. Its current worktree also has unrelated uncommitted slide work; it was not changed. No branch was merged for this study.

- `RefactorRegistry.impl/applies` and each implementation's `prepare(~info_map, ~target, program)` separate applicability and a prepared term/focus result from input modality.
- `RefactorBase` preserves source IDs and secondary material through term/segment conversion, with explicit parentheses, comments, and slot-handling machinery.
- `RefactorInline`: extraction, feeds, inline, explosion/implosion. `RefactorMove`: hoist/sink, merge, dependency carry, parameter changes, arm reordering. `RefactorLift`: helper extraction at a function ceiling. `RefactorReduce`: stepping and staged substitution.
- `lines_swappable` checks name/type dependencies and disjoint binders. `swap_arms_rewrite` requires conservative pattern disjointness. These are useful concrete guards; the registry also contains editing actions that add holes, so membership in the registry alone is not a semantics guarantee.
- `RefactorGesture` resolves directions by syntax zone and reports blockers. A second upward insist can carry dependencies or lift a helper. Furl should expose that larger candidate explicitly before adopting repeated-key escalation.
- `RefactorDrag.drag_candidates` combines transforms with native `Measured` text positions, including shard anchors, frames, and cloning provenance. `CodeDrag` supplies pointer slop, directional tracks, stickiness, whole-buffer scrub, and release behavior. They are examples, not a drop-in Furl coordinate system.
- `Test_Refactor.re` includes transformation, gate, whitespace, identity, and print/reparse regression tests plus movement fuzzing. These were inspected, not rerun or claimed as current Furl coverage.
- `CodeFlip` animates the real text/SVG leaves using before/after measurements. Its stylesheet makes tokens, comments and buffer spans transformable; Furl now selectively ports that rule and uses the same real-element approach for reference opening in each native cell. The full engine's global pending state, active-editor lookup, syntax pairing and refactoring provenance still need adaptation before importing it: Furl has multiple mounted editors and chunked code-text wrappers.

Build a small **Furl command adapter** over the transform layer: logical selection → authoritative Hazel target → candidate source → Furl projection and layout → preview → commit. Expose a geometry-independent planner if the existing refactor API forces native caret targeting. Reuse the current Furl document's source slices, stable targets, whole-program statics, and history. Do not transform each subeditor independently.

Native branch chords are Cmd+Ctrl+arrows on macOS / Ctrl+Alt+arrows on PC, with Shift for explode/implode and Enter for stepping. The PC chord conflicts with today's Furl branch inspection. Resolve by focus context first: focused rows/branches use plain arrows, text retains its current commands. Do not add a second global handler that fires both operations.

## Dragology and gestures fit together

Read the local `draggable-diagrams/d2-paper.pdf` (Fig. 1 and architecture/operators discussion), and `declarative-dragging/main.tex`; the latter is a separate draft source, so do not assume byte-for-byte correspondence. Also inspected the local library's documented `closest`, `between`, floating, and drop-time composition model.

Use **candidate programs** to specify what a drag can do, and **gesture direction** to select a family of candidates. Reorder chooses nearby binding slots; a leftward pull can choose Group or Copy; dragging a comb endpoint chooses a scope boundary; crossing a function ceiling can offer helper extraction. Those candidates still pass through the same planner. Gestures need not bypass semantic checks, and declarative dragging need not mean generic list reordering.

Furl needs view-aware anchors: source occurrence + rendering instance + attribute + role. A single source may have several match echoes, or no visible name. A generated helper or copied term needs explicit source-to-clone correspondence. Many source destinations can project to the same point; scope/branch selection and direction must disambiguate instead of choosing a random nearest pixel.

Use bounded local successor states, not every permutation. Cache source analysis; project only candidate geometry; avoid evaluating whole programs at pointer frequency. Compare a row constrained to candidate slots (the study default) with a floating row and neighboring-row position transitions. Interpolate positions/opacity, not source text or runtime values. Add fork/comb path morphing only once the state identities are reliable. Keyboard previews use the same candidates. Reduced motion removes the tween, not information about the proposed edit.

The standalone row study compares Slot and Float. Slot keeps the actual row in a valid candidate position with columns aligned, tweening with neighbors; Float follows both pointer axes and leaves its in-flow slot as a placeholder. Stable IDs and current painted positions survive interrupted tweens. Finish all layout mutations before measuring destinations. Insertion displaces only following rows; drop and refusal begin at the current painted position. Browser checks sample insertion, both drag styles, rapid reversals and release, not merely eventual order.

This study uses ordinary HTML inputs and a local arithmetic parser, not any part of Hazel's editor/evaluator. Its small refactor gate ignores fully empty draft bindings, which introduce no names or uses, so independent rows can cross them. The drafts remain visibly incomplete; their insertion is not reclassified as a semantic no-op. Other invalid arithmetic remains outside this prototype's refactor guarantee.

Reference creation uses a flexible wire anchored at word centers, now the chosen design rather than selectors. The binder stays put while its endpoint follows the pointer and fills a hole. The name opens into its slot and following text moves horizontally. Optional hover/focus links remain available outside Connect. Edges sit behind text; two damped spring control points provide bend/inertia with exact endpoints and bounded integration. Existing uses drag as a word plus wire; source remains dimmed until a valid commit. A release anywhere without a valid factor target in Free edit replaces the occurrence with a hole and retracts its cable to the binder with an underdamped snap. Reduced motion retains static curves and immediate removal. The study remains standalone. Its renderer and accepted gestures are also used by the native port; this is not a full rope simulation.

## Tool primacy, policy, and deletion experiment

Tool targeting and semantic policy are independent. The study shares one selected tool and policy across its two separate documents, with local shortcuts to avoid returning to the top. Option/Alt temporarily activates the relevant study tool. Switching either setting cancels a pending gesture. The first three entries below are working toolbar tools; the last two are sketches:

| Tool | First pointer target | Operations / variants |
| --- | --- | --- |
| Edit | Cell/caret/selection | Text entry; later completion/templates/voice. In the study only the row lab has editable text. |
| Rows | Entire binding row or intervening boundary | Reorder, insert, delete; later copy and carry dependencies. Double-click activates an individual cell. |
| Connect | Binder or variable occurrence | Fill a hole, move a use, unplug. Later expressions, extraction and inlining can share source/destination targeting. |
| Shape (proposed) | Comb endpoint, fork, selected lexical region | Group/resize blocks, abstract/reorder parameters, add/reorder branches, extract helpers. |
| Inspect (proposed) | Live value or view decoration | Calls, branch views, furling, trace/attribute controls. Source specialization remains a separate command. |

The icon sketches use an I-beam, stacked rows with arrows, a loose cable, opposing scope brackets, and an eye. The inventory now records target and semantic operation separately, without assigning every action to a permanent tool. Separate modes are useful when overlapping hits need different meanings; disjoint whitespace, tokens, delimiters and comb endpoints may let some modes disappear. Shared Undo and motion settings are infrastructure.

**Next affordance study (R4, C4, C5, I3):** Copy should be a shared variant of pickup, with a held key and a latching button, across rows, tokens and complete syntax forms. Try Shift during structural pickup, preserving native Shift selection while editing. This is a proposal, not an implemented shortcut. Delimiter pickup should select its owning syntax form; arbitrary token fragments and a whole expression need distinct structural targets. A copied binder/form needs fresh source IDs and explicit name/capture behavior. Start copying in Free edit rather than assuming duplicated evaluation is a refactor. Compare generic token/form deletion with reference unplugging: only binding uses have a cable; deletion of other forms needs role-appropriate removal or a hole. Keep missed-target cancellation versus deliberate deletion explicit, particularly for click/keyboard pickup.

**Coverage distinctions:** H1 already recovers row and reference deletions through Undo in both studies. H2 is a future persistent stash, not missing Undo. V1 is existing live view furling/branch/call navigation; V3 explores alternative affordances and animation for those view changes. E5 is source-changing explode/implode. A fixed transformation storyboard does not implement its proposed mouse or keyboard gesture.

**Policy is an operation-set proposal:** checked refactors ⊆ refactors plus checked hole filling ⊆ arbitrary structural edits. This is a useful chain of permissions, not a proven lattice over all program transformations. The current policy gate covers structural commands; ordinary HTML typing remains unrestricted. A real policy covering Edit must validate an entire proposed cell transaction, not reject intermediate keystrokes. The standalone demo does not claim this live integration.

Hazelnut Live’s Theorem 4.2 states that suitably typed expression-hole filling commutes with reduction in the pure calculus. Filling can refine an incomplete result; function values can carry holes in their bodies/closures, so “every value is unchanged” is too strong. This is not a license for arbitrary edits of names, patterns or type holes, nor for effects. A live Refine gate needs the actual hole identity, expected type, lexical closure and effect assumptions. In these demos the finite numeric binders provide only a narrow example. [Live Functional Programming with Typed Holes, §4 and Appendix A.6](https://arxiv.org/html/1805.00155v4#S4).

| Structural command in the study | Refactor | Refine | Free edit |
| --- | --- | --- | --- |
| Arithmetic row move with valid dependencies | Yes | Yes | Yes |
| Dependency-breaking move | No | No | Yes |
| Binder → empty factor | No | Yes | Yes |
| Replace/move/unplug an existing use | No | No | Yes |
| Delete populated binding row | No | No | Yes |
| Create/remove a completely blank draft; Undo/Reset | Administrative exception | Administrative exception | Administrative exception |

Blank draft scaffolding is available in all policies for experimentation; adding an evaluated hole is not declared semantics-preserving. Likewise arbitrary unused expressions may diverge or fail, so deleting a populated row is conservatively Free edit. There is room for finer per-operation guarantees rather than widening Refactor based only on current samples.

**Deletion choices:** Backspace in either cell removes a binding row when both cells are blank. Cmd/Ctrl+Shift+Backspace explicitly requests deletion regardless of contents, still subject to policy. This leaves ordinary Cmd/Ctrl+Backspace alone. The result row cannot be deleted. A future “empty expression plus unused name” rule needs lexical use analysis, including shadowing and nested scopes; the study intentionally starts with the simpler two-hole criterion. Backspace/Delete on a focused use in Connect unplugs it; Space then Tab/Enter moves it by keyboard.

For row deletion, the canvas is the code viewport rectangle including padding, excluding toolbar/status. Leaving it shows a colored perimeter and deletion/refusal status; returning restores the candidate. Connect uses a target-based rule instead: dropping an existing use anywhere without a factor target unplugs it, including whitespace inside the editor. A factor target reconnects the use (or preserves it at its original factor); a non-target release of a new connection from a binder cancels and retracts its cable. For click-to-pick (including keyboard pickup), clicking anywhere without a factor target cancels and retracts without altering source, in every policy. Consume that cancellation click before other binder/control actions so it cannot restart the connection or trigger an unrelated edit. The preview status distinguishes reconnecting from unplugging. Keep source intact at pickup, mutate only on release, and record exactly one history entry. Escape, pointer cancellation, blur, and tool/policy changes must never consume the source. Undo restores row contents or occurrence binder IDs, and cancels any return animation. This rectangle is provisional; nested/editor-wide canvases will require a more explicit ownership model.

## Branch and upstream policy

Keep `furl` as the integration/deployment branch. Bring a chosen Hazel feature snapshot into a temporary integration branch, resolve there, run both suites, then merge. Record imported source SHAs and follow-up Furl fixes. Preserve a merge commit for feature imports; avoid rebasing public shared history or repeatedly squash-importing the same branch.

This is a substantial merge, not a small utility import: compared with Furl's imported modular-editors base `97cbeb…`, refactorings has 552 commits unique to its side (131 unique to the other side); its merge-base diff spans 131 files. These counts are an inspected snapshot, not an estimate of conflict count. Refactorings also imports newer dev and completion-provenance work. Inspect overlaps with Furl's current `CodeEditable`, keyboard, menu, source/zipper caching, and probe changes before attempting integration.

Keep reusable Hazel fixes in focused commits with native-core tests; keep Furl layout/gesture policy in Furl commits. When porting fixes upstream, create a focused branch on the relevant Hazel feature base (or dev), cherry-pick with `-x`, add a clean PR, and record its upstream commit/PR in the [port ledger](ports.md). On a later forward merge, reconcile equivalent patches rather than reapplying them. Periodic manual passes are sufficient; no sync automation is proposed here. Existing Furl changes to menu lifecycle and structural abbreviation are candidates for such a pass, not claims of submitted PRs.

## Voice input: small surface, separate delivery

A useful first version is **dictate text into the selected cell**, not an agent that guesses program transformations. Record only after an explicit click. Preserve target occurrence, cell sort, selection, and source revision; show provisional text separately; Enter inserts once and Escape cancels. If the target was edited or deleted meanwhile, return the transcript for retargeting instead of inserting elsewhere. Feed accepted text through Hazel's normal edit action so undo and parsing remain native.

Two plausible routes:

1. Browser `SpeechRecognition`: few integration steps and no app-owned transcription server, but support is limited and some browsers send audio to a service; on-device support needs feature/language checks. It is an experiment, not a portable offline promise. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [on-device flag](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally).
2. Record a short clip with `MediaRecorder` and send it to a transcription service through an authenticated endpoint. For example, OpenAI's current file transcription accepts context/keyword hints; in-scope names can improve identifier recognition, but hints can also introduce errors. Streaming is available if clip completion feels slow. [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription).

Microphone access needs permission and a secure context ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)). The existing HTTPS Pages site can host the UI; it cannot keep a service secret or run the transcription endpoint. Keep the long-lived key server-side, restrict callers, and bound recording/request size. Provider choice, retention policy, and acceptable latency/cost remain open; no service was configured or recording added here. Browser dictation is the cheaper integration experiment; a short-clip endpoint gives us more control over identifiers and service behavior. The difficult part to validate is correction effort on names, casing, and punctuation, not drawing a microphone icon. Sources checked 2026-09-05; no latency measurements made.

## Delivery order and acceptance

The inventory has ordered `stages` and `actions`, with stable IDs for reprioritizing an individual item. An action records separate Study and Hazel-backed Furl coverage, its bounded implemented slice, and its remaining task. A checkmark requires a working implementation on that platform. Partial native history/navigation does not imply the new gestures are integrated; inspected upstream transforms do not count as live Furl features. Stage order is a recommendation, not a semantic hierarchy.

1. **Implemented slices.** Working study interactions and their now-ported native slices appear first, alongside existing live features. These are baselines to preserve, not a claim that the palette or semantics are settled.
2. **Next: Copy and token/form targeting.** The core now uses a native target/transaction adapter. In the standalone document investigate shared Copy, tokens/forms, generic deletion and reduced mode separation. Try animated alternatives to existing furling after source/view identities are stable. Those unbuilt studies extend the working native baseline.
3. **Then: scopes and source transformations.** Extraction, grouping/resizing, abstraction, parameters, branches, inlining, dependency carry and helpers. Integrate the refactor foundation in a dedicated branch before relying on it. Each storyboard needs a real pointer/keyboard implementation and precondition checks. Test source/print roundtrips, lexical/type behavior, comments, probes, focus and history.
4. **Later: broader recovery and inspection.** Persistent stash, additional columns, specialization/stepping and voice remain independent extensions. Ordinary Undo and existing live columns/inspection are already accounted for above.

## Port parity contract

For each ported action, use its inventory ID and an observable interaction trace as the acceptance reference. Keep the study implementation and this record in sync when a design decision changes. Do not import the arithmetic parser or infer source structure from its DOM; translate the accepted behavior through Hazel's authoritative source, binder identities, analysis and history.

| Boundary | Required behavior / acceptance |
| --- | --- |
| Target and scope | Freeze authoritative source occurrence, owning scope, source revision and projection instance at pickup. Initially move bindings within one let scope. A multiline defining expression moves with its binding, never its continuation. Resolve match echoes once; reject alignment-only gaps and ambiguous boundaries. |
| Pointer primacy | Preserve whole-row hit targets, 5px pickup threshold, click selection, double-click cell/value activation, boundary insertion overlays, and the latched Option/Alt equivalent. Suppress insertion hints during pointer pickup/dragging; keyboard-picked rows may expose placement boundaries without insertion pluses. Suppress unrelated hover affordances during an active gesture. Check every column and the derived result row. Proposed combined targeting is a separate experiment until chosen. |
| Keyboard and focus | Cmd/Ctrl+Enter inserts below, Shift above; insertion focuses the new expression. Row Space/arrows/Enter and Escape share the same candidates as the pointer. Preserve native Enter/completion, text selection and cross-cell column targets. Restore focus by source identity after commit/Undo, revealing the necessary column. |
| Connection outcome | Binder-to-hole creates a use; a missed binder drag retracts without an edit. A dragged existing use in Free edit moves to a different target or unplugs on a miss; returning to its own target preserves it. Click/keyboard pickup followed by a non-target click cancels without deleting, and consumes that click. Use binder identity, not spelling, across shadowing. |
| Deletion and recovery | Rows delete beyond the code viewport; both-cell-empty Backspace cleans up a draft; explicit deletion is Cmd/Ctrl+Shift+Backspace. Result is not a removable binding. One Undo restores contents and occurrence identities. Generic term deletion and persistent stash are separate future actions. |
| Transactions and policy | After deletion, restore an editable caret to the preceding binding, falling back to the next binding or remaining result. Preview without source/history/persistence mutation. Escape, blur, pointer cancellation, tool/policy changes and stale revisions cancel. A commit creates one history entry and reanalysis; Undo cancels outstanding motion. Replace the small demo's arithmetic checks with explicit Hazel preconditions. Record any narrowing or semantic difference; do not silently relabel a free edit as a refactor. |
| Motion | Default to Slot: rows stay in a candidate position, columns aligned; following rows make space on insertion. Preserve identities and current painted positions across interrupted tweens. The study uses a 22px row grid and 180ms cubic-bezier(.2,0,0,1) reflow. The live drag audit replaces preview tweens with a critically damped position spring, preserving velocity on reversals; insertion/commit/cancel retain 180ms reflow. Grab-relative slot centers and a small hysteresis band prevent accidental slot changes. Retain Float only as the comparison. |
| Wires and reduced motion | Word-center endpoints, thin flexible curve behind text, exact endpoints and damped bends; the existing `wire.js` implementation is the motion reference. On cancellation/unplug, retract to the binder; after connection, the word opens into its slot. Reduced motion uses immediate placement/removal and static curves. Keep committed values visible during previews, attached to their rows; evaluate new values once the source edit commits. |

Port each accepted trace into native transformation checks plus browser checks, including intermediate painted positions, rapid reversal, invalid targets, cancellation and one-step Undo. Then mark Hazel coverage implemented for that exact slice. Where nested scopes or native editor composition force a difference, document and expose it for review rather than claiming exact parity.


## Native port: observed agreement and deliberate limits

The live `Row gestures` and `Connections` fixtures use the same programs as the two labs. New controls are icon-only with hover titles and accessible names. Whole-row primacy, 5px pickup, double-click cell/value activation, gap/keyboard insertion, Slot/Float, deletion, click-versus-drag connection outcomes and native Undo are ported. Motion uses the study’s timing and the same wire renderer. Native tests and private browser traces cover source identity, lexical/type refusal, insertion’s initial painted frame, focus, cancellation, real evaluation and nested projection boundaries. Existing navigation, inspector, values and menu checks remain part of regression validation.

Native differences are explicit:

- Option/Alt selects Connect over a name and Rows over other row space; the standalone page chooses by which separate lab is under the pointer. These are provisional adapters for the same commands.
- Row movement remains inside the defining let scope and carries full definition subtrees. Parameters and case patterns are not let rows. Boundaries in empty function bodies and match arms insert into that body, never a sibling arm or an alignment spacer.
- There is no arbitrary multi-row selection. Hover highlights the exact binding subtree that will move. `border` includes `twice`; `twice` alone cannot yet be lifted out of `border`. Checked moves now admit total nested lets, so `area` can cross the whole `border` definition without needing Free edit. Scope-changing movement remains a distinct next step.
- Hazel’s checks replace the arithmetic gate. Refactor requires simple irrefutable bindings, a conservative total fragment, unchanged resolution of all variable occurrences and no newly introduced static errors. Calls and more complex expressions may therefore be refused even when a more powerful refactor engine could justify a move. Refine checks actual expression-hole types and the lexical binder. Free edit still cannot connect to a shadowed/out-of-scope binder.
- Draft insertion and two-hole cleanup are administrative exceptions, not semantic no-ops. Ordinary native typing remains unrestricted in all three policies. No general refactoring proof or refactorings-branch import is claimed.
- Native wire destinations are expression holes or existing variable occurrences. Creation requires a visible binder; echoed bindings choose the clicked/nearest visible instance. General token/form deletion and copying have not been quietly included.

Keep the `FurlDocument` source commands independent of the palette. The next mode experiment should change target selection and invocation, not duplicate the native transformation or history logic.
