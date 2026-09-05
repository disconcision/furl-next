# Writing and manipulating programs in Furl

Design study, 2026-09-05. The [self-contained interaction page](https://andrewblinn.com/furl-next/interactions.html) accompanies this note. Its small demonstrations are **proposals**, not new features in the live Hazel-backed editor. The [26-action inventory](../interactions/inventory.json) records mouse, keyboard, constraints, source evidence, and suggested sequencing for each action.

## Recommendation

Start with row insertion, explicit row selection, row movement, and reference creation. Put mouse editing affordances behind **Structure**, with a held **Option/Alt** revealing the same affordances temporarily while pointing. Keep ordinary text editing and view controls available without entering a mode. Keep a separate **Refactor / Free edit** policy: activation of structural gestures and admissibility of edits are independent decisions.

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

**Row and cell targeting.** Structure mode uses the entire binding row as the drag target, including its pattern, expression, and value columns. There is no side handle or reserved action gutter. A single click focuses the row; crossing the pointer slop threshold begins a move. Double-click activates one cell for editing or value interaction, and that cell supports ordinary text selection until focus leaves or Escape returns to the row. Values remain read-only; activation allows selection/copying in the study. Normal mode keeps single-click cell editing. A new row immediately activates its expression. Insertion targets remain narrow overlays at true binding boundaries, not extra-height rows; their marks share the comb margin. A hovered row receives a subtle background across its width.

The comb continues to express scope. In normal mode its existing clicks furl/unfurl or navigate branches. Structure mode can reveal endpoint/fork handles that act on source. Endpoint hits must win over stem hits and row drags. When combs are hidden, structural commands remain available through the row surface and keyboard.

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

Build a small **Furl command adapter** over the transform layer: logical selection → authoritative Hazel target → candidate source → Furl projection and layout → preview → commit. Expose a geometry-independent planner if the existing refactor API forces native caret targeting. Reuse the current Furl document's source slices, stable targets, whole-program statics, and history. Do not transform each subeditor independently.

Native branch chords are Cmd+Ctrl+arrows on macOS / Ctrl+Alt+arrows on PC, with Shift for explode/implode and Enter for stepping. The PC chord conflicts with today's Furl branch inspection. Resolve by focus context first: focused rows/branches use plain arrows, text retains its current commands. Do not add a second global handler that fires both operations.

## Dragology and gestures fit together

Read the local `draggable-diagrams/d2-paper.pdf` (Fig. 1 and architecture/operators discussion), and `declarative-dragging/main.tex`; the latter is a separate draft source, so do not assume byte-for-byte correspondence. Also inspected the local library's documented `closest`, `between`, floating, and drop-time composition model.

Use **candidate programs** to specify what a drag can do, and **gesture direction** to select a family of candidates. Reorder chooses nearby binding slots; a leftward pull can choose Group or Copy; dragging a comb endpoint chooses a scope boundary; crossing a function ceiling can offer helper extraction. Those candidates still pass through the same planner. Gestures need not bypass semantic checks, and declarative dragging need not mean generic list reordering.

Furl needs view-aware anchors: source occurrence + rendering instance + attribute + role. A single source may have several match echoes, or no visible name. A generated helper or copied term needs explicit source-to-clone correspondence. Many source destinations can project to the same point; scope/branch selection and direction must disambiguate instead of choosing a random nearest pixel.

Use bounded local successor states, not every permutation. Cache source analysis; project only candidate geometry; avoid evaluating whole programs at pointer frequency. Start with a floating row and neighboring-row position transitions. Interpolate positions/opacity, not source text or runtime values. Add fork/comb path morphing only once the state identities are reliable. Keyboard previews use the same candidates. Reduced motion removes the tween, not information about the proposed edit.

The standalone row study now moves the actual complete row with the pointer and leaves its layout slot vacant while neighbors reflow. It follows the old Furl precedent of stable row identities and excluding the dragged row from neighbor animation. Measure all painted positions before a change, finish all layout mutations before measuring destinations, and retarget from the current painted positions when a tween is interrupted. Insertion only displaces following rows. Drop and refusal settle from the pointer position. Browser regression checks sample these intermediate frames and rapid reversals, rather than merely checking the eventual order.

This study uses ordinary HTML inputs and a local arithmetic parser, not any part of Hazel's editor/evaluator. Its small refactor gate ignores fully empty draft bindings, which introduce no names or uses, so independent rows can cross them. The drafts remain visibly incomplete; their insertion is not reclassified as a semantic no-op. Other invalid arithmetic remains outside this prototype's refactor guarantee.

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

1. **Source commands and draft rows.** Cmd/Ctrl+Enter, scope-aware insertion, focus, one undo, persistence, hidden-column recovery. Test parameter/arm/result positions, nested lets, multiline source, and shared echoes.
2. **Structure layer and row movement.** Whole-row pointer targets, double-click cell activation, keyboard pickup, refactor/free policy, cancellation, and dependency feedback. Test normal single-click editing, row dragging across every column in Structure mode, text selection within an active cell, value activation, held-modifier release, blur, stale-source cancellation, and independent/dependent reorder cases.
3. **References and extraction.** Binder identity, typed destinations, capture avoidance, literal/general extraction, and native completion. Test same-name shadowing, parameter scope, copied IDs, repeated echoes, and dropped selection replacement.
4. **Integrate the refactor foundation.** Dedicated branch and merge review before enabling helper carry, inlining, parameter changes, branch edits. Test source/print roundtrip, lexical/type behavior, comments, probes, focus, history, and existing Furl navigation/menu invariants.
5. **Scope gestures and motion.** Compare explicit Group/Copy commands with the deck's left-first variants; resize, abstract, and fork through the same candidate engine. Add stable-identity previews before elaborate tweening.
6. **Voice and richer inspection.** Measure transcription/correction on real identifiers; consider nonpersistent specialization and extra semantic columns independently.

The immediate next live implementation should be the first two items. They establish the target/transaction model that every later gesture needs, without forcing us to solve function lifting and every drag variant at once.
