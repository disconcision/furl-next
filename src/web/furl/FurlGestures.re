/* Native/source half of the provisional gesture adapter. JavaScript owns only
   hit geometry, input state and animation; every edit goes through Structure. */
open Haz3lcore;
open Js_of_ocaml;
open Virtual_dom.Vdom;
open FurlDocument;

let scopes = model => {
  let rec collect =
    fun
    | Row({expression, _}) => [expression]
    | Scope({target, rows, _}) => [
        target,
        ...List.concat_map(collect, rows),
      ]
    | Function({target, body_target, body, _}) => [
        target,
        body_target,
        ...collect(body),
      ]
    | Match({target, branches, _}) => [
        target,
        ...List.concat_map(b => collect(b.body), branches),
      ];
  collect(
    project({
      ...model,
      closed: [],
    }),
  );
};
let decode = (request, model) => {
  open Yojson.Safe.Util;
  let text = name => request |> member(name) |> to_string;
  let id = name => text(name) |> Uuidm.of_string |> Option.get;
  let optional_id = name =>
    switch (request |> member(name)) {
    | `Null
    | `String("") => None
    | `String(s) => Some(Option.get(Uuidm.of_string(s)))
    | _ => raise(Not_found)
    };
  let scope = () => List.find(t => key(t) == text("scope"), scopes(model));
  let command =
    switch (text("kind")) {
    | "insert" => InsertBinding(scope(), optional_id("before"))
    | "move" => MoveBinding(scope(), id("id"), optional_id("before"))
    | "copy-row" => CopyBinding(scope(), id("id"), optional_id("before"))
    | "term" =>
      TransferTerm(
        id("source"),
        optional_id("destination"),
        request |> member("copy") == `Bool(true),
      )
    | "extract" => ExtractTerm(scope(), optional_id("before"), id("source"))
    | "delete" =>
      DeleteBinding(
        scope(),
        id("id"),
        request |> member("emptyOnly") == `Bool(true),
      )
    | "connect" =>
      ConnectReference(
        id("binder"),
        optional_id("source"),
        optional_id("destination"),
      )
    | _ => raise(Not_found)
    };
  (text("policy"), command);
};

let marker_cache = ref((Language.Statics.Map.empty, []));
let markers_uncached = (target, model) => {
  let c = cell(target, model);
  let syntax =
    make_editor(~root=c.editor.editor.root, c.source).editor.syntax;
  let measured = syntax.measured;
  let callees =
    Id.Map.fold(
      (_, info, ids) =>
        switch (info) {
        | Language.Info.InfoExp({user_term: {term: Ap(_, fn, _), _}, _}) =>
          Id.Set.add(Language.Exp.rep_id(fn), ids)
        | _ => ids
        },
      model.statics.info_map,
      Id.Set.empty,
    );
  Id.Map.fold(
    (id, info, acc) => {
      let item =
        switch (info) {
        | Language.Info.InfoPat({user_term: {term: Var(name), _}, _}) =>
          Some(("binder", name, Some(id)))
        | InfoExp({user_term: {term: Var(name), _}, _}) =>
          Some(("reference", name, Language.Info.get_binding_site(info)))
        | InfoExp({user_term: {term: EmptyHole, _}, _}) =>
          Some(("hole", "", None))
        | InfoExp(_) => Some(("term", "", None))
        | _ => None
        };
      switch (
        item,
        TermData.segment(id, syntax.term_data),
        TermData.extreme_measures(id, syntax.term_data, measured),
      ) {
      | (Some((kind, name, binder)), Some(segment), Some((origin, last))) =>
        let code = Printer.of_segment(~indent=" ", segment);
        let regions =
          List.init(
            last.row - origin.row + 1,
            i => {
              let row = origin.row + i;
              let shape = Measured.row_shape(row, measured);
              let col =
                i == 0
                  ? origin.col
                  : Option.fold(
                      ~none=0,
                      ~some=s => s.Measured.Rows.indent,
                      shape,
                    );
              let end_col =
                row == last.row
                  ? last.col
                  : Option.fold(
                      ~none=col + 1,
                      ~some=s => s.Measured.Rows.max_col,
                      shape,
                    );
              `Assoc([
                ("row", `Int(row)),
                ("col", `Int(col)),
                ("width", `Int(max(1, end_col - col))),
              ]);
            },
          );
        let handles =
          switch (Measured.find_shards_by_id(id, measured)) {
          | Some(shards) => shards
          | None =>
            Option.fold(
              ~none=[],
              ~some=m => [(0, m)],
              Measured.find_by_id(id, measured),
            )
          };
        let count =
          kind == "binder"
            ? Id.Map.fold(
                (_, info, n) =>
                  Language.Info.get_binding_site(info) == Some(id)
                    ? n + 1 : n,
                model.statics.info_map,
                0,
              )
            : 0;
        List.filter_map(
          ((shard, m: Measured.measurement)) =>
            m.origin.row != m.last.row
              ? None
              : Some(
                  `Assoc([
                    (
                      "key",
                      `String(
                        Uuidm.to_string(id) ++ ":" ++ string_of_int(shard),
                      ),
                    ),
                    ("id", `String(Uuidm.to_string(id))),
                    ("kind", `String(kind)),
                    ("name", `String(name)),
                    ("code", `String(code)),
                    (
                      "glyph",
                      `String(
                        Option.fold(
                          ~none=name,
                          ~some=
                            fun
                            | Piece.Tile(t) =>
                              Option.value(
                                List.nth_opt(t.label, shard),
                                ~default=name,
                              )
                            | _ => name,
                          piece_by_id(id, c.source),
                        ),
                      ),
                    ),
                    ("uses", `Int(count)),
                    (
                      "role",
                      `String(
                        Id.Set.mem(id, callees)
                          ? "callee"
                          : (
                            switch (info) {
                            | Language.Info.InfoExp({
                                user_term:
                                  {
                                    term:
                                      BinOp(_) | UnOp(_) | Cons(_) |
                                      ListConcat(_),
                                    _,
                                  },
                                _,
                              }) => "operator"
                            | InfoExp({user_term: {term: Ap(_), _}, _}) => "application"
                            | _ => ""
                            }
                          ),
                      ),
                    ),
                    ("regions", `List(regions)),
                    (
                      "binder",
                      `String(
                        Option.fold(~none="", ~some=Uuidm.to_string, binder),
                      ),
                    ),
                    ("col", `Int(m.origin.col)),
                    ("row", `Int(m.origin.row)),
                    ("width", `Int(max(1, m.last.col - m.origin.col))),
                  ]),
                ),
          handles,
        )
        @ acc;
      | _ => acc
      };
    },
    model.statics.info_map,
    [],
  );
};
let markers = (target, model) => {
  let (statics, cache) = marker_cache^;
  let cache = statics === model.statics.info_map ? cache : [];
  switch (List.assoc_opt(key(target), cache)) {
  | Some(markers) => markers
  | None =>
    let result = markers_uncached(target, model);
    marker_cache :=
      (model.statics.info_map, [(key(target), result), ...cache]);
    result;
  };
};
let metadata = (model, metrics, revision) =>
  `Assoc([
    ("revision", `Int(revision)),
    ("example", `Int(model.example)),
    (
      "view",
      `List([
        `Bool(model.match_columns),
        `Bool(model.bindings),
        `Bool(model.expressions),
        `Bool(model.values),
        `Bool(model.comb),
        `Bool(model.indentation),
        `List(List.map(s => `String(s), model.closed)),
        `List(
          List.map(
            ((id, i)) => `List([`String(id), `Int(i)]),
            model.branch_choices,
          ),
        ),
      ]),
    ),
    ("pitch", `Float(metrics.FontMetrics.col_width)),
    ("lineHeight", `Float(metrics.row_height)),
    (
      "cells",
      `List(
        List.map(
          ((t, _)) =>
            `Assoc([
              ("target", `String(key(t))),
              ("markers", `List(markers(t, model))),
            ]),
          targets(project(model)),
        ),
      ),
    ),
  ]);
module Input = {
  type t = {
    model: FurlDocument.t,
    metrics: FontMetrics.t,
    inject: FurlDocument.action => Effect.t(unit),
  };
  let sexp_of_t = _ => Sexplib.Sexp.Atom("furl-gestures");
  let combine = (_, next) => next;
};
module Hook =
  Attr.Hooks.Make({
    module Input = Input;
    module State = {
      type t = {
        mutable controller: Js.Unsafe.any,
        mutable mounted: bool,
        mutable revision: int,
        mutable segment: Segment.t,
      };
    };
    let sync = (input: Input.t, state: State.t) => {
      if (input.model.document.segment !== state.segment) {
        state.revision = state.revision + 1;
        state.segment = input.model.document.segment;
      };
      let answer = (commit, raw) => {
        let result =
          try({
            let (policy, command) =
              decode(
                Yojson.Safe.from_string(Js.to_string(raw)),
                input.model,
              );
            switch (prepare_structure(~policy, command, input.model)) {
            | Error(message) =>
              `Assoc([
                ("ok", `Bool(false)),
                ("message", `String(message)),
              ])
            | Ok(prepared) =>
              if (commit) {
                ProbePerform.FocusEffect.schedule_cell();
                input.inject(
                  Structure(input.model.document.segment, policy, command),
                )
                |> Bonsai.Effect.Expert.handle;
              };
              `Assoc([
                ("ok", `Bool(true)),
                (
                  "changed",
                  `Bool(
                    !
                      Segment.ptr_eq(
                        prepared.segment,
                        input.model.document.segment,
                      ),
                  ),
                ),
              ]);
            };
          }) {
          | _ =>
            `Assoc([
              ("ok", `Bool(false)),
              (
                "message",
                `String("That source target is no longer available."),
              ),
            ])
          };
        result |> Yojson.Safe.to_string |> Js.string;
      };
      ignore(
        Js.Unsafe.meth_call(
          state.controller,
          "update",
          [|
            Js.Unsafe.inject(
              Js.string(
                Yojson.Safe.to_string(
                  metadata(input.model, input.metrics, state.revision),
                ),
              ),
            ),
            Js.Unsafe.inject(Js.wrap_callback(answer(false))),
            Js.Unsafe.inject(Js.wrap_callback(answer(true))),
          |],
        ),
      );
    };
    let init = (input: Input.t, _) =>
      State.{
        controller: Js.Unsafe.inject(Js.null),
        mounted: false,
        revision: 0,
        segment: input.model.document.segment,
      };
    let on_mount = (input, state: State.t, element) => {
      state.controller =
        Js.Unsafe.fun_call(
          Js.Unsafe.get(Js.Unsafe.global, "createFurlGestures"),
          [|Js.Unsafe.inject(element)|],
        );
      state.mounted = true;
      sync(input, state);
    };
    let update = (~old_input as _, ~new_input, state, _) =>
      if (state.State.mounted) {
        sync(new_input, state);
      };
    let destroy = (_, state: State.t, _) =>
      if (state.mounted) {
        ignore(Js.Unsafe.meth_call(state.controller, "destroy", [||]));
      };
  });
let hook = (~model, ~metrics, ~inject) =>
  Attr.create_hook(
    "furl-gestures",
    Hook.create({
      model,
      metrics,
      inject,
    }),
  );
