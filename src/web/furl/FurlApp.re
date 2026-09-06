open Util;
open Js_of_ocaml;
open Bonsai.Let_syntax;

let storage_key = i => "furl.live.v1." ++ string_of_int(i);
/* View preferences are independent of saved programs and Undo. The same tiny
   bootstrap restores appearance before the native runtime has loaded. */
let load_preferences = (model: FurlDocument.t) =>
  try({
    let json: Js.t(Js.js_string) =
      Js.Unsafe.meth_call(
        Js.Unsafe.get(Dom_html.window, "FurlPreferences"),
        "readJSON",
        [||],
      );
    let prefs = Yojson.Safe.from_string(Js.to_string(json));
    let bool = (key, fallback) =>
      switch (Yojson.Safe.Util.member(key, prefs)) {
      | `Bool(value) => value
      | _ => fallback
      };
    let caret_tone =
      switch (Yojson.Safe.Util.member("caret_tone", prefs)) {
      | `String(value) when List.mem(value, ["violet", "coral", "teal"]) => value
      | _ => model.caret_tone
      };
    {
      ...model,
      caret_tone,
      comb: bool("comb", model.comb),
      bindings: bool("bindings", model.bindings),
      expressions: bool("expressions", model.expressions),
      values: bool("values", model.values),
      indentation: bool("indentation", model.indentation),
      match_columns: bool("match_columns", model.match_columns),
    };
  }) {
  | _ => model
  };
let preferences = (model: FurlDocument.t) =>
  `Assoc([
    ("caret_tone", `String(model.caret_tone)),
    ("comb", `Bool(model.comb)),
    ("bindings", `Bool(model.bindings)),
    ("expressions", `Bool(model.expressions)),
    ("values", `Bool(model.values)),
    ("indentation", `Bool(model.indentation)),
    ("match_columns", `Bool(model.match_columns)),
  ]);
let save_preferences = (before, after) => {
  let next = preferences(after);
  if (preferences(before) != next) {
    try(
      ignore(
        Js.Unsafe.meth_call(
          Js.Unsafe.get(Dom_html.window, "FurlPreferences"),
          "updateJSON",
          [|Js.Unsafe.inject(Js.string(Yojson.Safe.to_string(next)))|],
        ),
      )
    ) {
    | _ => ()
    };
  };
};
/* Upgrade the old untouched fixture without replacing anyone's edited code. */
let legacy_function_source = {js|let offset = 1 in
let scale = fun factor -> fun x -> factor * x + offset in
let answer = scale(3)(4) in
answer|js};
let load = i => {
  let initial = () => FurlDocument.parse(snd(FurlDocument.examples[i]));
  let segment =
    try({
      let storage =
        Js.Optdef.get(Dom_html.window##.localStorage, () => raise(Not_found));
      switch (
        Js.Opt.to_option(storage##getItem(Js.string(storage_key(i))))
      ) {
      | None => initial()
      | Some(data) =>
        data
        |> Js.to_string
        |> Yojson.Safe.from_string
        |> Haz3lcore.Editor.Model.persistent_of_yojson
        |> Haz3lcore.Editor.Model.unpersist
        |> (ed => Haz3lcore.Zipper.unselect_and_zip(ed.state.zipper))
      };
    }) {
    | _ => initial()
    };
  let segment =
    i == 1
    && String.trim(Haz3lcore.Printer.of_segment(~indent=" ", segment))
    == legacy_function_source
      ? initial() : segment;
  FurlDocument.init(~example=i, segment) |> load_preferences;
};
let save = (model: FurlDocument.t) => {
  let storage =
    Js.Optdef.get(Dom_html.window##.localStorage, () => raise(Not_found));
  let data =
    model.document.segment
    |> Haz3lcore.Zipper.unzip
    |> Haz3lcore.Editor.Model.mk(~root=Exp)
    |> Haz3lcore.Editor.Model.persist
    |> Haz3lcore.Editor.Model.yojson_of_persistent
    |> Yojson.Safe.to_string;
  storage##setItem(Js.string(storage_key(model.example)), Js.string(data));
};

module Model = {
  include FurlDocument;
  let equal = (a: t, b: t) => a === b;
};
module Action = {
  [@deriving (show, sexp, yojson)]
  type t =
    | Document(FurlDocument.action)
    | Example(int);
};

let component = () => {
  let reveal_caret = ref(false);
  let%sub (model, inject) =
    Bonsai.state_machine0(
      (module Model),
      (module Action),
      ~default_model=load(0),
      ~apply_action=(~inject as _, ~schedule_event as _, model, action) =>
      try({
        let next =
          switch (action) {
          | Action.Document(action) => FurlDocument.update(action, model)
          | Example(i) => {
              ...load(i),
              caret_tone: model.caret_tone,
              comb: model.comb,
              bindings: model.bindings,
              expressions: model.expressions,
              values: model.values,
              indentation: model.indentation,
              match_columns: model.match_columns,
            }
          };
        save_preferences(model, next);
        switch (action) {
        | Document(
            Edit(_, ContextMenu(Open | Toggle)) |
            EditView(_, _, ContextMenu(Open | Toggle)),
          ) =>
          Haz3lcore.ProbePerform.FocusEffect.schedule_cell()
        | Document(
            CaretTone(_) | BranchStep(_) | MatchMode(_) | ToggleScope(_) |
            FurlAll,
          ) =>
          Haz3lcore.ProbePerform.FocusEffect.schedule_cell()
        | _ => ()
        };
        switch (action) {
        | Document(
            Edit(_, Perform(Move(Point(_)))) |
            EditView(_, _, Perform(Move(Point(_)))),
          ) =>
          ()
        | Document(Edit(_) | EditView(_) | Navigate(_) | BranchStep(_)) =>
          reveal_caret := true
        | _ => ()
        };
        let should_save =
          switch (action) {
          | Action.Document(_) =>
            next.document.segment !== model.document.segment
          | Example(_) => false
          };
        if (should_save) {
          try(
            {
              save(next);
              {
                ...next,
                storage_message: "",
              };
            }
          ) {
          | _ => {
              ...next,
              storage_message: "Browser storage is unavailable; these edits have not been saved.",
            }
          };
        } else {
          next;
        };
      }) {
      | exn => {
          ...model,
          message:
            "That edit could not be applied: " ++ Printexc.to_string(exn),
        }
      }
    );
  let%sub (available_width, report_width) =
    Bonsai.state((module FurlValue.Width), ~default_model=0.);
  let%sub size =
    BonsaiUtil.SizeObserver.observer(
      () => JsUtil.get_elem_by_id("font-specimen"),
      ~default=
        BonsaiUtil.SizeObserver.Size.{
          width: 8.4,
          height: 22.,
        },
    );
  let%sub () =
    Bonsai.Edge.after_display(
      {
        let%map _ = model;
        Bonsai.Effect.of_sync_fun(
          () => {
            Os.is_mac :=
              Dom_html.window##.navigator##.platform##toUpperCase##indexOf(
                Js.string("MAC"),
              )
              >= 0;
            ignore(Haz3lcore.ProbePerform.FocusEffect.execute());
            if (reveal_caret^) {
              reveal_caret := false;
              switch (JsUtil.get_elem_by_id_opt("caret")) {
              | Some(caret) =>
                caret##scrollIntoView(
                  Js.Unsafe.obj([|
                    ("block", Js.Unsafe.inject(Js.string("nearest"))),
                    ("inline", Js.Unsafe.inject(Js.string("nearest"))),
                  |]),
                )
              | None => ()
              };
            };
          },
          (),
        );
      },
    );
  let%arr model = model
  and inject = inject
  and size = size
  and available_width = available_width
  and report_width = report_width;
  FurlView.view(
    ~available_width,
    ~report_width,
    ~font_metrics={
      col_width: size.width,
      row_height: size.height,
    },
    ~inject=a => inject(Action.Document(a)),
    ~choose_example=i => inject(Example(i)),
    model,
  );
};

let start = () =>
  Bonsai_web.Start.start(component(), ~bind_to_element_with_id="container");
