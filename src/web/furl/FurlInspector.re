open Virtual_dom.Vdom;
open Haz3lcore;
open Language;

type summary = {
  errors: int,
  holes: int,
  warnings: int,
};

/* Count the authoritative program, not its overlapping editor slices. Keep
   the sidebar's derivation off the caret/call/projection update paths. */
let problem_memo: ref(option((Segment.t, CachedStatics.t, summary))) =
  ref(None);
let summary = (model: FurlDocument.t) =>
  switch (problem_memo^) {
  | Some((segment, statics, result))
      when segment === model.document.segment && statics === model.statics => result
  | _ =>
    let syntax =
      FurlDocument.make_editor(model.document.segment).editor.syntax;
    let collection =
      ProblemCollection.make(
        ~display_warnings=FurlDocument.settings.core.display_warnings,
        [
          {
            label: None,
            sources: [
              {
                statics: model.statics,
                syntax,
              },
            ],
          },
        ],
      );
    let count = category =>
      Option.value(List.assoc_opt(category, collection.counts), ~default=0);
    let result = {
      errors: count(Syntax) + count(Static),
      holes: count(Hole),
      warnings: count(Warning),
    };
    problem_memo := Some((model.document.segment, model.statics, result));
    result;
  };

/* A retained editing zipper can contain split pieces whose IDs differ from
   the reassembled authoritative slice. On a lookup miss, project the native
   caret onto that slice without changing the editing zipper or selection. */
let source_memo: ref(option((Segment.t, Sort.t, CodeEditable.Model.t))) =
  ref(None);
let source_editor = (source, root) =>
  switch (source_memo^) {
  | Some((old, old_root, editor)) when source === old && root == old_root => editor
  | _ =>
    let editor = FurlDocument.make_editor(~root, source);
    source_memo := Some((source, root, editor));
    editor;
  };
let cursor = (model: FurlDocument.t) =>
  model.selected_value != None
    ? None
    : FurlDocument.active_cell(model)
      |> Option.map((c: FurlDocument.nav_cell) => {
           let cell = FurlDocument.cell(c.target, model);
           let native = CodeWithStatics.Model.get_cursor_info(cell.editor);
           switch (native.info, native.indicated_piece) {
           | (None, Some(_)) =>
             let local = cell.editor.editor;
             let source = source_editor(cell.source, local.root).editor;
             let goal =
               Zipper.Caret.point(local.syntax.measured, local.state.zipper);
             let info =
               Move.to_point(
                 ~measured=source.syntax.measured,
                 ~goal,
                 source.state.zipper,
               )
               |> Option.bind(_, z =>
                    Indicated.ci_of(z, model.statics.info_map)
                  );
             {
               ...native,
               info,
             };
           | _ => native
           };
         });

let status_view = (~globals, ci: Info.t) =>
  switch (ci) {
  | InfoExp({cls, message, _} as info) =>
    CursorInspector.exp_view(~globals, cls, message, info)
  | InfoPat({cls, message, _} as info) =>
    CursorInspector.pat_view(~globals, cls, message, info)
  | _ => ProblemSidebar.problem_status_view(~globals, ci)
  };

let view = (~globals, model: FurlDocument.t) => {
  let totals = summary(model);
  let cursor = cursor(model);
  let content =
    switch (cursor) {
    | _ when model.message != "" => [
        Node.span(
          ~attrs=[
            Attr.class_("furl-inspector-message"),
            Attr.create("role", "status"),
          ],
          [Node.text(model.message)],
        ),
      ]
    | None => [
        Node.text(
          model.selected_value != None
            ? "Recorded value · read-only" : "Select a term to inspect",
        ),
      ]
    | Some({info: None, selection, _}) => [
        Node.text(
          Option.fold(~none=false, ~some=s => s != [], selection)
            ? "Selection" : "Whitespace or comment",
        ),
      ]
    | Some({info: Some(ci), indicated_piece, editor, _}) =>
      let projector_error =
        switch (indicated_piece, editor) {
        | (Some(Projector({id, _})), Some(editor)) =>
          Id.Map.find_opt(id, editor.syntax.projector_errors)
        | _ => None
        };
      let detail =
        switch (projector_error) {
        | Some(error) when !Info.is_error(ci) =>
          Node.span(
            ~attrs=[Attr.class_("furl-inspector-message")],
            [Node.text(error.message)],
          )
        | _ => status_view(~globals, ci)
        };
      [
        Node.div(
          ~attrs=[
            Attr.class_("furl-cursor-form"),
            Attr.title("Syntactic form at the caret"),
          ],
          [
            Node.span(
              ~attrs=[Attr.class_("furl-cursor-sort")],
              [Node.text(Sort.to_string(Info.sort_of(ci)))],
            ),
            Node.text(" / "),
            CursorInspector.cls_view(ci),
          ],
        ),
        detail,
      ];
    };
  let quantity = (n, word) =>
    string_of_int(n) ++ " " ++ word ++ (n == 1 ? "" : "s");
  Node.div(
    ~attrs=[
      Attr.class_("furl-inspector"),
      Attr.create("role", "region"),
      Attr.create("aria-label", "Cursor inspector"),
    ],
    [
      Node.div(~attrs=[Attr.class_("furl-cursor-details")], content),
      Node.div(
        ~attrs=[
          Attr.class_("furl-problem-totals"),
          Attr.create("aria-label", "Program problem counts"),
          Attr.create("aria-live", "polite"),
        ],
        [
          Node.span(
            ~attrs=[
              Attr.class_(totals.errors > 0 ? "has-errors" : ""),
              Attr.title("Syntax and type errors in the whole program"),
            ],
            [Node.text(quantity(totals.errors, "error"))],
          ),
        ]
        @ (
          totals.holes > 0
            ? [
              Node.span(
                ~attrs=[Attr.title("Empty holes in the whole program")],
                [Node.text(quantity(totals.holes, "hole"))],
              ),
            ]
            : []
        )
        @ (
          totals.warnings > 0
            ? [
              Node.span(
                ~attrs=[Attr.title("Warnings in the whole program")],
                [Node.text(quantity(totals.warnings, "warning"))],
              ),
            ]
            : []
        ),
      ),
    ],
  );
};
