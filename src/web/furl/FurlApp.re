open Util;
open Js_of_ocaml;
open Bonsai.Let_syntax;

let storage_key = i => "furl.live.v1." ++ string_of_int(i);
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
  FurlDocument.init(~example=i, segment);
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
          | Example(i) => load(i)
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
              >= 0
          },
          (),
        );
      },
    );
  let%arr model = model
  and inject = inject
  and size = size;
  FurlView.view(
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
