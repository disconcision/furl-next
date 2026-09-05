open Util;
open Haz3lcore;

/* A target is a slice of the ONE program's existing pieces. Editing a cell
   splices pieces home; it never round-trips the program through strings. */
[@deriving (show, sexp, yojson)]
type location =
  | Program
  | Child(Id.t, int);
[@deriving (show, sexp, yojson)]
type target = {
  location,
  offset: int,
};
let whole = {
  location: Program,
  offset: 0,
};
let key = ({location, offset}: target) =>
  (
    switch (location) {
    | Program => "program"
    | Child(id, n) => Uuidm.to_string(id) ++ ":" ++ string_of_int(n)
    }
  )
  ++ "/"
  ++ string_of_int(offset);

let rec find_child = (id, n, seg: Segment.t): Segment.t =>
  List.find_map(
    (p: Piece.t) =>
      switch (p) {
      | Tile(t) when t.id == id => List.nth_opt(t.children, n)
      | Tile(t) =>
        List.find_map(
          child =>
            try(Some(find_child(id, n, child))) {
            | Not_found => None
            },
          t.children,
        )
      | _ => None
      },
    seg,
  )
  |> OptUtil.get(_ => raise(Not_found));
let at = (location, seg) =>
  switch (location) {
  | Program => seg
  | Child(id, n) => find_child(id, n, seg)
  };
let read = (target, seg) =>
  ScratchFocus.drop(target.offset, at(target.location, seg));
let rec replace_child = (id, n, content, seg: Segment.t): Segment.t =>
  ScratchFocus.map_sharing(
    (p: Piece.t) =>
      switch (p) {
      | Tile(t) =>
        ScratchFocus.tile_sharing(
          p,
          t,
          t.id == id
            ? List.mapi((i, child) => i == n ? content : child, t.children)
            : ScratchFocus.map_sharing(
                replace_child(id, n, content),
                t.children,
              ),
        )
      | _ => p
      },
    seg,
  );
let replace = (target, content, seg) => {
  let old = at(target.location, seg);
  let (pre, _, post) =
    ScratchFocus.trim_ws(ScratchFocus.drop(target.offset, old));
  let content = ScratchFocus.take(target.offset, old) @ pre @ content @ post;
  switch (target.location) {
  | Program => content
  | Child(id, n) => replace_child(id, n, content, seg)
  };
};

let settings: Settings.t = {
  ...Settings.Model.init,
  line_numbers: false,
  core: {
    ...Settings.Model.init.core,
    probe_all: true,
    flip_animations: false,
  },
};
let make_editor = (~root=Sort.Exp, seg) =>
  seg
  |> ScratchFocus.core_ws
  |> Zipper.unzip(~direction=Left)
  |> Editor.Model.mk(~root)
  |> CodeWithStatics.Model.mk;
let pieces = (editor: CodeEditable.Model.t) =>
  Zipper.unselect_and_zip(editor.editor.state.zipper);
let parse = text =>
  ScratchRestructure.parse(text)
  |> OptUtil.get(_ => failwith("Could not parse example"));

let examples = [|
  (
    "Bindings",
    {js|let width = 6 in
let height = 4 in
let area = width * height in
let border = let twice = width + height in twice * 2 in
(area, border)|js},
  ),
  (
    "Functions",
    {js|let offset = 1 in
let scale = fun factor -> fun x -> factor * x + offset in
let answer = scale(3)(4) in
answer|js},
  ),
  (
    "Matches",
    {js|let xs = [2, 4, 6] in
let first = case xs | [] => 0 | head :: rest => head end in
first + 1|js},
  ),
|];

[@deriving (show, sexp, yojson)]
type cell = {
  target,
  source: Segment.t,
  editor: CodeEditable.Model.t,
};
[@deriving (show, sexp, yojson)]
type snapshot = {
  segment: Segment.t,
  cells: list(cell),
  active: string,
};
[@deriving (show, sexp, yojson)]
type t = {
  document: snapshot,
  statics: CachedStatics.t,
  samples: Language.Sample.Map.t,
  result: option(Language.Exp.t),
  message: string,
  storage_message: string,
  undo: list(snapshot),
  redo: list(snapshot),
  closed: list(string),
  comb: bool,
  bindings: bool,
  expressions: bool,
  values: bool,
  indentation: bool,
  example: int,
};

type projection =
  | Row({
      pattern: option(target),
      expression: target,
      depth: int,
      terminal: bool,
    })
  | Scope({
      target,
      depth: int,
      rows: list(projection),
    });

/* Only unambiguous let-in tiles split into rows. Everything else stays in
   a real Hazel expression editor, including incomplete or malformed syntax. */
let let_prefix = (seg: Segment.t) => {
  let rec walk = (i, acc) =>
    switch (List.nth_opt(seg, i)) {
    | Some(p) when ScratchFocus.is_edge_ws(p) => walk(i + 1, acc)
    | Some(Tile(t))
        when t.label == ["let", "=", "in"] && List.length(t.children) == 2 =>
      walk(i + 1, [t, ...acc])
    | _ => (List.rev(acc), i)
    };
  walk(0, []);
};

let project = model => {
  let rec scope = (target, pattern, depth) => {
    let seg = read(target, model.document.segment);
    let (defs, tail_start) = let_prefix(seg);
    if (defs == [] || List.mem(key(target), model.closed)) {
      Row({
        pattern,
        expression: target,
        depth,
        terminal: pattern == None,
      });
    } else {
      let rows =
        List.map(
          (tile: Base.tile) =>
            scope(
              {
                location: Child(tile.id, 1),
                offset: 0,
              },
              Some({
                location: Child(tile.id, 0),
                offset: 0,
              }),
              depth + 1,
            ),
          defs,
        );
      let tail = {
        ...target,
        offset: target.offset + tail_start,
      };
      Scope({
        target,
        depth,
        rows:
          rows
          @ [
            Row({
              pattern,
              expression: tail,
              depth,
              terminal: true,
            }),
          ],
      });
    };
  };
  scope(whole, None, 0);
};

let targets = projection => {
  let rec collect = projection =>
    switch (projection) {
    | Row({pattern, expression, _}) =>
      List.map(t => (t, Sort.Pat), Option.to_list(pattern))
      @ [(expression, Sort.Exp)]
    | Scope({rows, _}) => List.concat_map(collect, rows)
    };
  collect(projection);
};

let project_statics = (statics: CachedStatics.t, editor: CodeEditable.Model.t) => {
  let inside = id => Id.Map.mem(id, editor.editor.syntax.term_data);
  CachedStatics.{
    ...statics,
    info_map: Id.Map.filter((id, _) => inside(id), statics.info_map),
    error_ids: List.filter(inside, statics.error_ids),
    warning_ids: List.filter(inside, statics.warning_ids),
    probe_ids: CachedStatics.probe_ids_of_zipper(editor.editor.state.zipper),
  };
};

let refresh_cells = model => {
  let visible = targets(project(model));
  let cells =
    List.map(
      ((target, root)) => {
        let seg =
          read(target, model.document.segment) |> ScratchFocus.core_ws;
        let editor =
          switch (
            List.find_opt(
              c => key(c.target) == key(target),
              model.document.cells,
            )
          ) {
          /* Unselecting/reassembling an editor can allocate fresh pieces. Compare
             its last authoritative source slice, never its temporary zipper. */
          | Some(c) when Segment.ptr_eq(c.source, seg) => c.editor
          | _ => make_editor(~root, seg)
          };
        let editor =
          CodeWithStatics.Update.calculate(
            ~settings=settings.core,
            ~is_edited=true,
            ~projected=project_statics(model.statics, editor),
            ~stitch=x => x,
            ~dynamics=model.samples,
            ~is_dynamic_term=false,
            editor,
          );
        {
          target,
          source: seg,
          editor,
        };
      },
      visible,
    );
  /* Retain hidden cell cursors across projection changes. Drop obsolete
     addresses after edits instead of retaining detached programs forever. */
  let hidden =
    List.filter(
      c =>
        !
          List.exists(
            ((target, _)) => key(target) == key(c.target),
            visible,
          )
        && (
          try(
            Segment.ptr_eq(
              c.source,
              read(c.target, model.document.segment) |> ScratchFocus.core_ws,
            )
          ) {
          | _ => false
          }
        ),
      model.document.cells,
    );
  {
    ...model,
    document: {
      ...model.document,
      cells: cells @ hidden,
    },
  };
};

let calculate = model => {
  let statics =
    CachedStatics.init(
      ~settings=settings.core,
      ~is_dynamic_term=false,
      ~stitch=x => x,
      ~root=Sort.Exp,
      Zipper.unzip(model.document.segment),
    );
  let (result, samples, message) =
    try(
      switch (
        Language.Evaluator.evaluate_and_limit(
          ~step_limit=20000,
          ~eval_info=Language.EvalInfo.of_targets(statics.targets),
          ~env=Language.Builtins.env_init,
          statics.elaborated,
        )
      ) {
      | LimitedCompleted((value, state)) => (
          Some(value),
          Language.EvaluatorState.get_probes(state),
          "",
        )
      | StepLimitExceeded => (
          None,
          Language.Sample.Map.empty,
          "Evaluation paused at the step limit.",
        )
      }
    ) {
    | exn => (
        None,
        Language.Sample.Map.empty,
        "Evaluation could not finish: " ++ Printexc.to_string(exn),
      )
    };
  refresh_cells({
    ...model,
    statics,
    result,
    samples,
    message,
  });
};

let init = (~example=0, segment) =>
  calculate({
    document: {
      segment,
      cells: [],
      active: "",
    },
    statics: CachedStatics.empty,
    samples: Language.Sample.Map.empty,
    result: None,
    message: "",
    storage_message: "",
    undo: [],
    redo: [],
    closed: [],
    comb: true,
    bindings: true,
    expressions: true,
    values: true,
    indentation: true,
    example,
  });
let cell = (target, model) =>
  List.find(c => key(c.target) == key(target), model.document.cells);
let text_of_exp = exp => {
  let settings =
    ExpToSegment.Settings.of_core(
      ~inline=true,
      ~fold_fn_bodies=`Text,
      settings.core,
    );
  exp
  |> ExpToSegment.exp_to_segment(~settings)
  |> Printer.of_segment(~indent=" ");
};
let sample_id = (editor: CodeEditable.Model.t) =>
  MakeTerm.from_zip_for_sem(editor.editor.state.zipper, ~root=Sort.Exp).term
  |> Language.Exp.rep_id;
let samples_for = (target, model) =>
  Language.Sample.Map.lookup(
    sample_id(cell(target, model).editor),
    model.samples,
  )
  |> Option.value(~default=[]);
let value_text = (target, model) =>
  switch (samples_for(target, model)) {
  | [sample, ..._] =>
    text_of_exp(
      Language.Substitution.in_exp(Language.Builtins.env_init, sample.value),
    )
  | [] => ""
  };

[@deriving (show, sexp, yojson)]
type action =
  | Edit(target, CodeEditable.Update.t)
  | Focus(string)
  | ToggleScope(string)
  | FurlAll
  | Toggle(string)
  | Undo
  | Redo
  | Reset;

let update = (action, model) =>
  switch (action) {
  | Focus(active) => {
      ...model,
      document: {
        ...model.document,
        active,
      },
    }
  | ToggleScope(id) =>
    refresh_cells({
      ...model,
      closed:
        List.mem(id, model.closed)
          ? List.filter(k => k != id, model.closed) : [id, ...model.closed],
    })
  | FurlAll =>
    refresh_cells({
      ...model,
      closed: [],
    })
  | Toggle("comb") => {
      ...model,
      comb: !model.comb,
    }
  | Toggle("bindings") => {
      ...model,
      bindings: !model.bindings,
    }
  | Toggle("expressions") => {
      ...model,
      expressions: !model.expressions,
    }
  | Toggle("values") => {
      ...model,
      values: !model.values,
    }
  | Toggle("indentation") => {
      ...model,
      indentation: !model.indentation,
    }
  | Toggle(_) => model
  | Reset =>
    calculate({
      ...model,
      document: {
        segment: parse(snd(examples[model.example])),
        cells: [],
        active: "",
      },
      undo: [model.document, ...ScratchFocus.take(99, model.undo)],
      redo: [],
      closed: [],
    })
  | Undo =>
    switch (model.undo) {
    | [] => model
    | [document, ...undo] =>
      calculate({
        ...model,
        document,
        undo,
        redo: [model.document, ...model.redo],
      })
    }
  | Redo =>
    switch (model.redo) {
    | [] => model
    | [document, ...redo] =>
      calculate({
        ...model,
        document,
        redo,
        undo: [model.document, ...model.undo],
      })
    }
  | Edit(target, action) =>
    let c = cell(target, model);
    let updated = CodeEditable.Update.update(~settings, action, c.editor);
    let editor = updated.model;
    let changed = updated.is_edit;
    let segment =
      changed
        ? replace(target, pieces(editor), model.document.segment)
        : model.document.segment;
    let source = read(target, segment) |> ScratchFocus.core_ws;
    /* Creating a let while typing must not replace the focused editor with
       rows halfway through the input. Keep that occurrence as code until the
       user explicitly furls it. */
    let closed =
      changed
      && fst(let_prefix(source)) != []
      && !List.mem(key(target), model.closed)
        ? [key(target), ...model.closed] : model.closed;
    let cells =
      List.map(
        c =>
          key(c.target) == key(target)
            ? {
              ...c,
              source,
              editor,
            }
            : c,
        model.document.cells,
      );
    let document = {
      cells,
      active: key(target),
      segment,
    };
    let next = {
      ...model,
      document,
      closed,
      undo:
        changed && updated.historic
          ? [model.document, ...ScratchFocus.take(99, model.undo)]
          : model.undo,
      redo: changed ? [] : model.redo,
    };
    changed ? calculate(next) : refresh_cells(next);
  };
