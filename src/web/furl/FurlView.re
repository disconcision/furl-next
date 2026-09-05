open Util;
open Virtual_dom.Vdom;
open FurlDocument;

let button = (~attrs=[], ~disabled=false, ~label, effect, text) =>
  Node.button(
    ~attrs=[
      Attr.type_("button"),
      disabled ? Attr.disabled : Attr.empty,
      Attr.create("aria-label", label),
      Attr.on_click(_ => effect),
      ...attrs,
    ],
    [Node.text(text)],
  );

let view = (~font_metrics, ~inject, ~choose_example, model: FurlDocument.t) => {
  let globals = {
    ...Globals.Model.init(~settings=FurlDocument.settings, ~font_metrics, ()),
    inject_global:
      fun
      | Undo => inject(Undo)
      | Redo => inject(Redo)
      | _ => Effect.Ignore,
  };
  /* Keep attribute widths stable when cycling a single visible branch. */
  let measured_cells =
    nav_cells({
      ...model,
      match_columns: true,
    });
  let tree = project(model);
  let rail_depths = FurlCombs.plan(model, tree);
  let lane_gap = FurlCombs.gap(rail_depths);
  let rail_x = (lane, level) => FurlCombs.x(rail_depths, lane, level);
  let rail_style = (lane, level) =>
    "left:" ++ Printf.sprintf("%g", rail_x(lane, level) -. 0.5) ++ "ch";
  let active = model.selected_value == None ? active_cell(model) : None;
  let editor = (view, target) => {
    let c = cell(target, model);
    let focus = () => inject(FocusView(target, view));
    let travel = direction => {
      Haz3lcore.ProbePerform.FocusEffect.schedule_cell();
      Effect.Many([focus(), inject(Navigate(target, direction))]);
    };
    CodeEditable.View.view(
      ~globals,
      ~signal=_ => focus(),
      ~edit_mode=
        Editable({
          inject: action => inject(EditView(target, view, action)),
          escape: d => travel(Across(d)),
          escape_vertical: Some((d, _) => travel(BetweenRows(d))),
          take_focus: _ => focus(),
          focus:
            Option.fold(~none=false, ~some=c => c.view == view, active)
              ? Some() : None,
        }),
      ~dynamics=model.samples,
      c.editor,
    );
  };
  let live_value = (id, owner, target) => {
    let value =
      Option.fold(~none="", ~some=t => value_text(t, model), target);
    let selected = model.selected_value == Some(id);
    let count =
      Option.fold(
        ~none=0,
        ~some=
          id =>
            Option.value(List.assoc_opt(id, model.call_counts), ~default=0),
        owner,
      );
    count > 1 && (value != "" || selected)
      ? {
        let owner = Option.get(owner);
        let index = choice(owner, count, model.call_choices);
        let description =
          "Call "
          ++ string_of_int(index + 1)
          ++ " of "
          ++ string_of_int(count);
        Node.span(
          ~attrs=[
            Attr.class_("furl-value-inspector"),
            Attr.create("data-selected", string_of_bool(selected)),
            Attr.create("data-call", string_of_int(index)),
            Key.listener(~f=key =>
              switch (key) {
              | {
                  key: D(("ArrowLeft" | "ArrowRight") as direction),
                  ctrl: Up,
                  alt: Up,
                  meta: Up,
                  shift: Up,
                  _,
                } =>
                Effect.Many([
                  Effect.Prevent_default,
                  Effect.Stop_propagation,
                  inject(
                    CallStep(owner, direction == "ArrowRight" ? 1 : (-1)),
                  ),
                ])
              | {key: D("Escape"), _} =>
                Haz3lcore.ProbePerform.FocusEffect.schedule_cell();
                Effect.Many([
                  Effect.Prevent_default,
                  Effect.Stop_propagation,
                  inject(SelectValue(None)),
                ]);
              | _ => Effect.Ignore
              }
            ),
          ],
          [
            button(
              ~attrs=[
                Attr.class_("furl-value-text"),
                Attr.create("aria-pressed", string_of_bool(selected)),
                Attr.title(
                  description
                  ++ ". Select this value, then use ← → to inspect calls.",
                ),
                Attr.on_focus(_ => inject(SelectValue(Some(id)))),
              ],
              ~label=
                (
                  value == ""
                    ? "No value in this call" : "Inspect value " ++ value
                )
                ++ ". "
                ++ description,
              inject(SelectValue(Some(id))),
              value,
            ),
          ]
          @ (
            selected
              ? [
                button(
                  ~attrs=[Attr.class_("furl-call-arrow previous")],
                  ~disabled=index == 0,
                  ~label="Previous function call",
                  inject(CallStep(owner, -1)),
                  "‹",
                ),
                button(
                  ~attrs=[Attr.class_("furl-call-arrow next")],
                  ~disabled=index + 1 == count,
                  ~label="Next function call",
                  inject(CallStep(owner, 1)),
                  "›",
                ),
                Node.span(
                  ~attrs=[
                    Attr.class_("furl-sr-only"),
                    Attr.create("role", "status"),
                  ],
                  [Node.text(description)],
                ),
              ]
              : []
          ),
        );
      }
      : Node.text(value);
  };
  let row =
      (
        ~id,
        ~pattern,
        ~expression,
        ~value,
        ~owner=None,
        ~depth,
        ~terminal=false,
        ~mark="",
        ~rail=0,
        ~lane=0,
        ~allow_fold=true,
        (),
      ) => {
    let fold =
      allow_fold
      && Option.fold(
           ~none=false,
           ~some=t => foldable(read(t, model.document.segment)),
           expression,
         );
    Node.div(
      ~key=id,
      ~attrs=[
        Attr.class_(
          "furl-row"
          ++ (terminal ? " terminal" : "")
          ++ (mark == "·" ? " furl-parameter" : ""),
        ),
        Attr.create("data-row", id),
        Attr.create(
          "data-expression",
          Option.fold(~none="", ~some=key, expression),
        ),
        Attr.create(
          "style",
          "--depth:"
          ++ string_of_int(model.indentation ? max(0, depth - 1) : 0),
        ),
      ],
      (
        model.bindings
          ? [
            Node.div(
              ~attrs=[Attr.class_("furl-pattern")],
              switch (pattern) {
              | Some(p) => [editor(id ++ ":pat", p)]
              | None =>
                terminal && depth == 0
                  ? [
                    Node.span(
                      ~attrs=[
                        Attr.class_("result-name"),
                        Attr.title(
                          "Result of the program; this label is not editable",
                        ),
                      ],
                      [Node.text("result")],
                    ),
                  ]
                  : []
              },
            ),
          ]
          : []
      )
      @ (
        model.expressions
          ? [
            Node.div(
              ~attrs=[Attr.class_("furl-expression")],
              switch (expression) {
              | Some(e) => [editor(id ++ ":exp", e)]
              | None => [
                  Node.span(
                    ~attrs=[
                      Attr.class_("furl-parameter-dot"),
                      Attr.create("aria-label", "Function parameter"),
                    ],
                    [Node.text(mark)],
                  ),
                ]
              },
            ),
          ]
          : []
      )
      @ (
        model.values
          ? [
            Node.div(
              ~attrs=[
                Attr.class_("furl-value"),
                Attr.create("aria-label", "Evaluation value"),
              ],
              [live_value(id, owner, value)],
            ),
          ]
          : []
      )
      @ (
        model.comb && fold
          ? [
            button(
              ~attrs=[
                Attr.class_("furl-open"),
                Attr.create("style", rail_style(lane, rail)),
              ],
              ~label="Furl this expression",
              inject(ToggleScope(key(Option.get(expression)))),
              "+",
            ),
          ]
          : []
      ),
    );
  };
  let comb = (~joined=false, target, lane, rail, kind, first) =>
    model.comb
      ? [
        Node.button(
          ~attrs=[
            Attr.type_("button"),
            Attr.class_(
              "furl-comb " ++ (kind == "match" ? "furl-case-comb" : ""),
            ),
            Attr.create("style", rail_style(lane, rail)),
            Attr.create("data-rail-level", string_of_int(rail)),
            Attr.create("data-rail-lane", string_of_int(lane)),
            Attr.create("data-comb-kind", kind),
            Attr.create(
              "aria-label",
              kind == "match" && !model.match_columns
                ? "Next match branch (Shift-click for previous)"
                : "Unfurl this " ++ kind ++ " to Hazel code",
            ),
            Attr.title(
              kind == "match" && !model.match_columns
                ? "Click stem: next branch. Shift-click: previous. Click horizontal fork: Hazel code."
                : Haz3lcore.Printer.of_segment(
                    ~indent=" ",
                    read(target, model.document.segment),
                  ),
            ),
            Attr.on_click(evt =>
              inject(
                kind == "match" && !model.match_columns
                  ? BranchStep(key(target), Key.shift_held(evt) ? (-1) : 1)
                  : ToggleScope(key(target)),
              )
            ),
          ],
          [
            FurlCombs.stem(
              ~pitch=font_metrics.col_width,
              ~kind,
              ~first,
              ~joined,
              (),
            ),
          ],
        ),
      ]
      : [];
  let rec projection = (owner, joined, lane, rail, node) =>
    switch (node) {
    | Row({pattern, expression, depth, terminal}) =>
      row(
        ~id=row_id(expression),
        ~pattern,
        ~expression=Some(expression),
        ~value=Some(expression),
        ~owner,
        ~depth,
        ~terminal,
        ~rail,
        ~lane,
        (),
      )
    | Scope({target, depth: _, rows}) =>
      Node.div(
        ~key="scope-" ++ key(target),
        ~attrs=[
          Attr.class_("furl-scope"),
          Attr.create("data-scope", key(target)),
        ],
        comb(target, lane, rail, "let block", false)
        @ List.map(projection(owner, false, lane, rail + 1), rows),
      )
    | Function({target, parameter, body_target: _, depth, body}) =>
      Node.div(
        ~key="function-" ++ key(target),
        ~attrs=[
          Attr.class_("furl-function"),
          Attr.create("data-function", key(target)),
        ],
        [
          Node.div(
            ~attrs=[Attr.class_("furl-function-content")],
            comb(target, lane, rail, "function", false)
            @ [
              Node.div(
                ~attrs=[Attr.class_("furl-parameters")],
                [
                  row(
                    ~id=parameter_row_id(parameter),
                    ~pattern=Some(parameter),
                    ~expression=None,
                    ~value=Some(parameter),
                    ~owner=Some(key(target)),
                    ~depth=depth + 1,
                    ~mark="·",
                    (),
                  ),
                  model.comb
                    ? Node.div(
                        ~attrs=[
                          Attr.class_("furl-parameter-divider"),
                          Attr.create(
                            "style",
                            "left:"
                            ++ Printf.sprintf("%g", rail_x(lane, rail))
                            ++ "ch",
                          ),
                        ],
                        [FurlCombs.parameter(font_metrics.col_width)],
                      )
                    : Node.none,
                ],
              ),
              projection(Some(key(target)), true, lane, rail + 1, body),
            ],
          ),
        ],
      )
    | Match({target, input, depth, branches}) =>
      let shown = shown_branches(target, branches, model);
      let next_lane = ref(lane);
      let placements =
        List.mapi(
          (i, (_, b)) => {
            let placed = (next_lane^, i == 0 ? rail : 0);
            next_lane := next_lane^ + lanes(model, b.body);
            placed;
          },
          shown,
        );
      let (last_lane, last_rail) = List.hd(List.rev(placements));
      let start_x = rail_x(lane, rail);
      let end_x = rail_x(last_lane, last_rail);
      let sizes =
        List.map(((_, b)) => string_of_int(lanes(model, b.body)), shown);
      Node.div(
        ~key="match-" ++ key(target),
        ~attrs=[
          Attr.class_("furl-match"),
          Attr.create(
            "style",
            "width:calc("
            ++ string_of_int(lanes(model, node))
            ++ " * var(--lane-width) + "
            ++ string_of_int(max(0, lanes(model, node) - 1))
            ++ " * var(--lane-gap));--last-width:calc("
            ++ List.hd(List.rev(sizes))
            ++ " * var(--lane-width) + ("
            ++ List.hd(List.rev(sizes))
            ++ " - 1) * var(--lane-gap))",
          ),
          Attr.create("data-match", key(target)),
          Attr.create(
            "data-mode",
            model.match_columns ? "columns" : "single",
          ),
        ],
        [
          Node.div(
            ~attrs=[
              Attr.class_("furl-branches"),
              Attr.create("data-comb", string_of_bool(model.comb)),
              Attr.create(
                "style",
                "grid-template-columns:"
                ++ String.concat(
                     " ",
                     List.map(
                       size =>
                         "calc("
                         ++ size
                         ++ " * var(--lane-width) + ("
                         ++ size
                         ++ " - 1) * var(--lane-gap))",
                       sizes,
                     ),
                   ),
              ),
            ],
            (
              model.comb
                ? [
                  Node.button(
                    ~attrs=[
                      Attr.type_("button"),
                      Attr.class_("furl-match-bridge"),
                      Attr.create(
                        "style",
                        "left:"
                        ++ Printf.sprintf("%g", start_x)
                        ++ "ch;width:"
                        ++ (
                          List.length(shown) == 1
                            ? "1.3ch"
                            : "calc(100% - var(--last-width) + "
                              ++ Printf.sprintf("%g", end_x -. start_x)
                              ++ "ch)"
                        ),
                      ),
                      Attr.create(
                        "aria-label",
                        "Unfurl match comb to Hazel code",
                      ),
                      Attr.on_click(_ => inject(ToggleScope(key(target)))),
                    ],
                    [
                      FurlCombs.bridge(
                        ~pitch=font_metrics.col_width,
                        ~many=List.length(shown) > 1,
                        ~joined,
                      ),
                    ],
                  ),
                ]
                : []
            )
            @ List.mapi(
                (slot, (i, b)) => {
                  let (branch_lane, branch_rail) =
                    List.nth(placements, slot);
                  Node.div(
                    ~key=key(b.pattern),
                    ~attrs=[
                      Attr.class_("furl-branch"),
                      Attr.create("data-branch", string_of_int(i)),
                    ],
                    comb(
                      ~joined,
                      target,
                      branch_lane,
                      branch_rail,
                      "match",
                      slot == 0,
                    )
                    @ [
                      row(
                        ~id=branch_row_id(b.pattern),
                        ~pattern=Some(b.pattern),
                        ~expression=Some(input),
                        ~value=Some(b.pattern),
                        ~owner,
                        ~allow_fold=false,
                        ~depth=depth + 1,
                        (),
                      ),
                      projection(
                        owner,
                        false,
                        branch_lane,
                        branch_rail + 1,
                        b.body,
                      ),
                    ],
                  );
                },
                shown,
              ),
          ),
        ],
      );
    };
  let toggle = (name, label, pressed) =>
    button(
      ~attrs=[
        Attr.class_("furl-toggle " ++ name),
        Attr.create("aria-pressed", string_of_bool(pressed)),
      ],
      ~label,
      inject(Toggle(name)),
      label,
    );
  /* One measured column plan for all rows. The whole program scrolls if
     necessary; individual editors never clip their caret or SVG decoration. */
  let width = c => {
    let measured = cell(c.target, model).editor.editor.syntax.measured;
    List.init(measured.total_rows, i =>
      Option.fold(
        ~none=0,
        ~some=shape => shape.Haz3lcore.Measured.Rows.max_col,
        Haz3lcore.Measured.row_shape(i, measured),
      )
    )
    |> List.fold_left(max, 0);
  };
  let visible = measured_cells;
  let widest = (root, minimum) =>
    List.fold_left(
      (w, c) => c.root == root ? max(w, width(c) + c.inset + 1) : w,
      minimum,
      visible,
    );
  let pat_width = model.bindings ? widest(Haz3lcore.Sort.Pat, 15) : 0;
  let exp_width = model.expressions ? widest(Haz3lcore.Sort.Exp, 18) : 0;
  let columns =
    (model.bindings ? [string_of_int(pat_width) ++ "ch"] : [])
    @ (model.expressions ? [string_of_int(exp_width) ++ "ch"] : [])
    @ (model.values ? ["12ch"] : []);
  let min_width =
    pat_width
    + exp_width
    + (model.values ? 12 : 0)
    + max(0, List.length(columns) - 1)
    * 2;
  let status =
    model.message != ""
      ? model.message
      : model.statics.error_ids != []
          ? string_of_int(List.length(model.statics.error_ids))
            ++ " incomplete or inconsistent term(s)"
          : "Live values";
  Node.div(
    ~attrs=[
      Attr.id("furl-app"),
      Attr.create("data-caret", model.caret_tone),
      Key.listener(~f=key =>
        switch (key) {
        | {key: D("z" | "Z"), meta: Down, shift, _}
        | {key: D("z" | "Z"), ctrl: Down, shift, _} =>
          Effect.Many([
            Effect.Prevent_default,
            inject(shift == Down ? Redo : Undo),
          ])
        | {
            key: D(("ArrowLeft" | "ArrowRight") as direction),
            ctrl: Down,
            alt: Down,
            meta: Up,
            shift: Up,
            _,
          } =>
          switch (active) {
          | Some({path: [(id, _), ..._], _}) =>
            Haz3lcore.ProbePerform.FocusEffect.schedule_cell();
            Effect.Many([
              Effect.Prevent_default,
              Effect.Stop_propagation,
              inject(BranchStep(id, direction == "ArrowRight" ? 1 : (-1))),
            ]);
          | _ => Effect.Ignore
          }
        | _ => Effect.Ignore
        }
      ),
    ],
    [
      Node.header(
        ~attrs=[Attr.class_("furl-header")],
        [
          Node.a(
            ~attrs=[Attr.class_("furl-wordmark"), Attr.href("../")],
            [Node.text("furl")],
          ),
          Node.a(
            ~attrs=[
              Attr.href("https://hazel.org"),
              Attr.class_("furl-powered"),
            ],
            [
              Node.text("powered by "),
              Node.img(
                ~attrs=[Attr.src("img/hazelnut.svg"), Attr.alt("")],
                (),
              ),
              Node.text("Hazel"),
            ],
          ),
          Node.create(
            "nav",
            [
              Node.a(~attrs=[Attr.href("../")], [Node.text("Reference")]),
              Node.a(
                ~attrs=[Attr.href("navigation.html")],
                [Node.text("Navigation study")],
              ),
              Node.a(
                ~attrs=[
                  Attr.href("https://github.com/disconcision/furl-next"),
                ],
                [Node.text("GitHub")],
              ),
            ],
          ),
        ],
      ),
      Node.main(
        ~attrs=[Attr.id("main"), Attr.class_("furl-main")],
        [
          Node.div(
            ~attrs=[Attr.class_("furl-toolbar")],
            [
              Node.label([
                Node.text("Example "),
                Node.select(
                  ~attrs=[
                    Attr.create("aria-label", "Example"),
                    Attr.on_change((_, value) =>
                      choose_example(int_of_string(value))
                    ),
                  ],
                  Array.to_list(
                    Array.mapi(
                      (i, (name, _)) =>
                        Node.option(
                          ~attrs=[
                            Attr.value(string_of_int(i)),
                            i == model.example ? Attr.selected : Attr.empty,
                          ],
                          [Node.text(name)],
                        ),
                      examples,
                    ),
                  ),
                ),
              ]),
              Node.div(
                ~attrs=[Attr.class_("furl-actions")],
                [
                  button(
                    ~disabled=model.undo == [],
                    ~label="Undo",
                    inject(Undo),
                    "Undo",
                  ),
                  button(
                    ~disabled=model.redo == [],
                    ~label="Redo",
                    inject(Redo),
                    "Redo",
                  ),
                  button(
                    ~label="Restore this example (can be undone)",
                    inject(Reset),
                    "Reset",
                  ),
                  button(
                    ~label="Furl all lets, functions, and matches",
                    inject(FurlAll),
                    "Furl all",
                  ),
                  button(
                    ~label="Toggle whole-program Hazel source",
                    inject(ToggleScope(key(whole))),
                    "Code ↔ rows",
                  ),
                ],
              ),
            ],
          ),
          Node.div(
            ~attrs=[Attr.class_("furl-legend")],
            [
              button(
                ~attrs=[
                  Attr.class_("furl-toggle comb"),
                  Attr.create("aria-pressed", string_of_bool(model.comb)),
                ],
                ~label="Show comb decoration",
                inject(Toggle("comb")),
                "∫",
              ),
              toggle("bindings", "Bindings", model.bindings),
              toggle("expressions", "Expressions", model.expressions),
              toggle("values", "Values", model.values),
              toggle("indentation", "Pattern indent", model.indentation),
              Node.div(
                ~attrs=[
                  Attr.class_("furl-caret-options"),
                  Attr.create("role", "group"),
                  Attr.create("aria-label", "Try a caret color"),
                ],
                [Node.text("Caret ")]
                @ List.map(
                    ((tone, label)) =>
                      button(
                        ~attrs=[
                          Attr.class_("caret-option " ++ tone),
                          Attr.create(
                            "aria-pressed",
                            string_of_bool(model.caret_tone == tone),
                          ),
                        ],
                        ~label="Use " ++ label ++ " caret",
                        inject(CaretTone(tone)),
                        label,
                      ),
                    [
                      ("violet", "Violet"),
                      ("coral", "Coral"),
                      ("teal", "Teal"),
                    ],
                  ),
              ),
            ],
          ),
          Node.div(
            ~attrs=[Attr.class_("furl-view-options")],
            [
              Node.text("Matches "),
              button(
                ~attrs=[
                  Attr.create(
                    "aria-pressed",
                    string_of_bool(model.match_columns),
                  ),
                ],
                ~label="Show all match branches as columns",
                inject(MatchMode(true)),
                "All columns",
              ),
              button(
                ~attrs=[
                  Attr.create(
                    "aria-pressed",
                    string_of_bool(!model.match_columns),
                  ),
                ],
                ~label="Show one match branch at a time",
                inject(MatchMode(false)),
                "One branch",
              ),
            ],
          ),
          Node.div(
            ~attrs=[
              Attr.class_("furl-program"),
              Attr.create(
                "style",
                "--columns:"
                ++ String.concat(" ", columns)
                ++ ";--lane-width:"
                ++ string_of_int(max(1, min_width))
                ++ "ch;--lane-gap:"
                ++ string_of_int(lane_gap)
                ++ "ch;--comb-gutter:"
                ++ string_of_int(max(5, rail_depths[0] + 2))
                ++ "ch",
              ),
            ],
            [
              Node.div(
                ~attrs=[
                  Attr.class_("furl-program-content"),
                  Attr.create(
                    "style",
                    "min-width:"
                    ++ string_of_int(
                         lanes(model, tree)
                         * max(1, min_width)
                         + max(0, lanes(model, tree) - 1)
                         * lane_gap,
                       )
                    ++ "ch",
                  ),
                ],
                [projection(None, false, 0, 0, tree)],
              ),
            ],
          ),
          Node.div(
            ~attrs=[
              Attr.class_("furl-status"),
              Attr.create("aria-live", "polite"),
            ],
            [Node.text(status)],
          ),
          Node.p(
            ~attrs=[Attr.class_("furl-help")],
            [
              Node.text(
                "Click a pattern or expression to edit. ↑ ↓ keep your column between cells; ← → cross cell edges. Click a comb to reveal code; + brings back the rows. Edits are saved in this browser.",
              ),
            ],
          ),
          model.storage_message == ""
            ? Node.none
            : Node.p(
                ~attrs=[
                  Attr.class_("furl-help"),
                  Attr.create("role", "status"),
                ],
                [Node.text(model.storage_message)],
              ),
          Node.p(
            ~attrs=[Attr.class_("furl-help")],
            [
              Node.text(
                "In one-branch mode, click the match stem to cycle branches (Shift-click goes back); its horizontal fork reveals code. Ctrl+Alt+← → switches the focused match. Select a live value to reveal call arrows; ← → steps through recorded calls, Escape returns to code. Blank values mark paths not evaluated in that call.",
              ),
            ],
          ),
        ],
      ),
      FontSpecimen.view,
    ],
  );
};
