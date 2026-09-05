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
  let focus = target => inject(Focus(key(target)));
  let editor = target => {
    let cell = cell(target, model);
    let travel = direction => {
      Haz3lcore.ProbePerform.FocusEffect.schedule_cell();
      inject(Navigate(target, direction));
    };
    CodeEditable.View.view(
      ~globals,
      ~signal=_ => focus(target),
      ~edit_mode=
        Editable({
          inject: action => inject(Edit(target, action)),
          escape: d => travel(Across(d)),
          escape_vertical: Some((d, _) => travel(BetweenRows(d))),
          take_focus: _ => focus(target),
          focus: model.document.active == key(target) ? Some() : None,
        }),
      ~dynamics=model.samples,
      cell.editor,
    );
  };
  let rec projection = node =>
    switch (node) {
    | Row({pattern, expression, depth, terminal}) =>
      let (defs, _) = let_prefix(read(expression, model.document.segment));
      Node.div(
        ~key="row-" ++ key(expression),
        ~attrs=[
          Attr.class_(terminal ? "furl-row terminal" : "furl-row"),
          Attr.create("data-expression", key(expression)),
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
                | Some(p) => [editor(p)]
                | None => [
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
                [editor(expression)],
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
                [Node.text(value_text(expression, model))],
              ),
            ]
            : []
        )
        @ (
          model.comb && defs != []
            ? [
              button(
                ~attrs=[
                  Attr.class_("furl-open"),
                  Attr.create(
                    "style",
                    "left:" ++ string_of_int(depth) ++ "ch",
                  ),
                ],
                ~label="Furl this let block",
                inject(ToggleScope(key(expression))),
                "+",
              ),
            ]
            : []
        ),
      );
    | Scope({target, depth, rows}) =>
      Node.div(
        ~key="scope-" ++ key(target),
        ~attrs=[
          Attr.class_("furl-scope"),
          Attr.create("data-scope", key(target)),
        ],
        (
          model.comb
            ? [
              button(
                ~attrs=[
                  Attr.class_("furl-comb"),
                  Attr.create(
                    "style",
                    "left:" ++ string_of_int(depth) ++ "ch",
                  ),
                ],
                ~label="Unfurl this let block to Hazel code",
                inject(ToggleScope(key(target))),
                "",
              ),
            ]
            : []
        )
        @ List.map(projection, rows),
      )
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
  let visible = nav_cells(model);
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
    @ (
      model.expressions
        ? ["minmax(" ++ string_of_int(exp_width) ++ "ch, 1fr)"] : []
    )
    @ (model.values ? ["minmax(9ch, 18ch)"] : []);
  let min_width =
    pat_width
    + exp_width
    + (model.values ? 9 : 0)
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
                    ~label="Furl all let blocks",
                    inject(FurlAll),
                    "Furl lets",
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
            ~attrs=[
              Attr.class_("furl-program"),
              Attr.create(
                "style",
                "--columns:" ++ String.concat(" ", columns),
              ),
            ],
            [
              Node.div(
                ~attrs=[
                  Attr.class_("furl-program-content"),
                  Attr.create(
                    "style",
                    "min-width:" ++ string_of_int(min_width) ++ "ch",
                  ),
                ],
                [projection(project(model))],
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
                "Click a pattern or expression to edit. ↑ ↓ keep your column between cells; ← → cross cell edges. Click a comb to reveal its code; + brings back the rows. Edits are saved in this browser.",
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
                "Furling currently expands let blocks. Functions and cases are editable Hazel code; their comb views are not implemented yet.",
              ),
            ],
          ),
        ],
      ),
      FontSpecimen.view,
    ],
  );
};
