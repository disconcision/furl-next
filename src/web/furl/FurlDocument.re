open Util;
open Haz3lcore;

/* A target is a slice of the ONE program's existing pieces. Editing a cell
   splices pieces home; it never round-trips the program through strings. */
[@deriving (show, sexp, yojson)]
type location =
  | Program
  | Child(Id.t, int)
  | Span(location, option(Id.t), option(Id.t));
[@deriving (show, sexp, yojson)]
type target = {
  location,
  offset: int,
};
let whole = {
  location: Program,
  offset: 0,
};
let rec location_key =
  fun
  | Program => "program"
  | Child(id, n) => Uuidm.to_string(id) ++ ":" ++ string_of_int(n)
  | Span(parent, after, before) =>
    location_key(parent)
    ++ "["
    ++ Option.fold(~none="", ~some=Uuidm.to_string, after)
    ++ ":"
    ++ Option.fold(~none="", ~some=Uuidm.to_string, before)
    ++ "]";
let key = ({location, offset}: target) =>
  location_key(location) ++ "/" ++ string_of_int(offset);
/* Bound slices by syntax identity, not character counts or mutable indices.
   Editing an earlier case arm cannot move a later arm's address. */
let split_span = (after, before, seg: Segment.t) => {
  let is_id = (id, p) =>
    switch (p) {
    | Piece.Tile(t) => t.id == id
    | _ => false
    };
  let rec start = (pre, rest) =>
    switch (after, rest) {
    | (None, _) => (List.rev(pre), rest)
    | (Some(id), [p, ...tail]) =>
      is_id(id, p)
        ? (List.rev([p, ...pre]), tail) : start([p, ...pre], tail)
    | (_, []) => raise(Not_found)
    };
  let (pre, rest) = start([], seg);
  let rec stop = (body, rest) =>
    switch (before, rest) {
    | (None, _) => (List.rev(body) @ rest, [])
    | (Some(id), [p, ...tail]) =>
      is_id(id, p) ? (List.rev(body), rest) : stop([p, ...body], tail)
    | (_, []) => raise(Not_found)
    };
  let (body, post) = stop([], rest);
  (pre, body, post);
};

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
let rec at = (location, seg) =>
  switch (location) {
  | Program => seg
  | Child(id, n) => find_child(id, n, seg)
  | Span(parent, after, before) =>
    let (_, body, _) = split_span(after, before, at(parent, seg));
    body;
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
let rec replace_at = (location, content, seg) =>
  switch (location) {
  | Program => content
  | Child(id, n) => replace_child(id, n, content, seg)
  | Span(parent, after, before) =>
    let (pre, _, post) = split_span(after, before, at(parent, seg));
    replace_at(parent, pre @ content @ post, seg);
  };
let replace = (target, content, seg) => {
  let old = at(target.location, seg);
  let (pre, _, post) =
    ScratchFocus.trim_ws(ScratchFocus.drop(target.offset, old));
  let content = ScratchFocus.take(target.offset, old) @ pre @ content @ post;
  replace_at(target.location, content, seg);
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
let scale = fun (factor, x) -> factor * x + offset in
scale(3, 4)|js},
  ),
  (
    "Matches",
    {js|let xs = [2, 4, 6] in
let first = case xs | [] => 0 | head :: rest => head end in
first + 1|js},
  ),
  (
    "Recursive calls",
    {js|let sum = fun xs ->
  case xs
  | [] => 0
  | head :: rest => let tail = sum(rest) in head + tail
  end in
sum([2, 4, 6])|js},
  ),
  (
    "Row gestures",
    {js|let n = 3 in
let twice = n * 2 in
let bonus = 4 in
let total = twice + bonus in
total|js},
  ),
  (
    "Connections",
    {js|let width = 6 in
let height = 4 in
let area = ¿ * ¿ in
area|js},
  ),
|];

[@deriving (show, sexp, yojson)]
type cell = {
  target,
  source: Segment.t,
  editor: CodeEditable.Model.t,
  value: option(Language.Exp.t),
};
[@deriving (show, sexp, yojson)]
type snapshot = {
  segment: Segment.t,
  cells: list(cell),
  active: string,
  active_view: string,
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
  caret_tone: string,
  match_columns: bool,
  branch_choices: list((string, int)),
  call_choices: list((string, int)),
  call_counts: list((string, int)),
  selected_value: option(string),
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
    })
  | Function({
      target,
      parameter: target,
      body_target: target,
      depth: int,
      body: projection,
    })
  | Match({
      target,
      input: target,
      depth: int,
      branches: list(branch),
    })
and branch = {
  pattern: target,
  body: projection,
};

/* Only complete structural shells split into rows. Their children may still
   contain holes; malformed shells remain editable native Hazel syntax. */
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

let child = (id, n) => {
  location: Child(id, n),
  offset: 0,
};
let span = (location, after, before) => {
  location: Span(location, after, before),
  offset: 0,
};
let function_prefix = seg =>
  switch (ScratchFocus.core_ws(seg)) {
  | [Tile(t), ...body]
      when
        t.label == ["fun", "->"]
        && List.length(t.children) == 1
        && ScratchFocus.core_ws(body) != [] =>
    Some(t)
  | _ => None
  };
let match_parts = seg =>
  switch (ScratchFocus.core_ws(seg)) {
  | [Tile(t)]
      when t.label == ["case", "end"] && List.length(t.children) == 1 =>
    let rules =
      List.filter_map(
        fun
        | Piece.Tile(r)
            when r.label == ["|", "=>"] && List.length(r.children) == 1 =>
          Some(r)
        | _ => None,
        List.hd(t.children),
      );
    rules == [] ? None : Some((t, rules));
  | _ => None
  };
let foldable = seg =>
  fst(let_prefix(seg)) != []
  || function_prefix(seg) != None
  || match_parts(seg) != None;
let project = model => {
  let rec scope = (target, pattern, depth) => {
    let seg = read(target, model.document.segment);
    let (defs, tail_start) = let_prefix(seg);
    let row = () =>
      Row({
        pattern,
        expression: target,
        depth,
        terminal: pattern == None,
      });
    if (List.mem(key(target), model.closed)) {
      row();
    } else if (defs != []) {
      Scope({
        target,
        depth,
        rows:
          List.map(
            (tile: Base.tile) =>
              scope(child(tile.id, 1), Some(child(tile.id, 0)), depth + 1),
            defs,
          )
          @ [
            scope(
              {
                ...target,
                offset: target.offset + tail_start,
              },
              pattern,
              depth,
            ),
          ],
      });
    } else {
      switch (function_prefix(seg), match_parts(seg)) {
      | (Some(tile), _) =>
        let body_target = span(target.location, Some(tile.id), None);
        Function({
          target,
          parameter: child(tile.id, 0),
          body_target,
          depth,
          body: scope(body_target, pattern, depth),
        });
      | (_, Some((tile, rules))) =>
        Match({
          target,
          depth,
          input: span(Child(tile.id, 0), None, Some(List.hd(rules).id)),
          branches:
            List.mapi(
              (i, rule: Base.tile) =>
                {
                  pattern: child(rule.id, 0),
                  body:
                    scope(
                      span(
                        Child(tile.id, 0),
                        Some(rule.id),
                        Option.map(
                          (r: Base.tile) => r.id,
                          List.nth_opt(rules, i + 1),
                        ),
                      ),
                      pattern,
                      depth,
                    ),
                },
              rules,
            ),
        })
      | _ => row()
      };
    };
  };
  scope(whole, None, 0);
};
let targets = projection => {
  let rec collect =
    fun
    | Row({pattern, expression, _}) =>
      List.map(t => (t, Sort.Pat), Option.to_list(pattern))
      @ [(expression, Sort.Exp)]
    | Scope({rows, _}) => List.concat_map(collect, rows)
    | Function({parameter, body_target, body, _}) =>
      [(parameter, Sort.Pat), (body_target, Sort.Exp)] @ collect(body)
    | Match({input, branches, _}) =>
      [(input, Sort.Exp)]
      @ List.concat_map(
          b => [(b.pattern, Sort.Pat)] @ collect(b.body),
          branches,
        );
  List.fold_left(
    (acc, (target, _) as entry) =>
      List.exists(((t, _)) => t == target, acc) ? acc : acc @ [entry],
    [],
    collect(projection),
  );
};
let choice = (id, count, choices) =>
  max(
    0,
    min(count - 1, Option.value(List.assoc_opt(id, choices), ~default=0)),
  );
let selected_branch = (target, branches, model) =>
  choice(key(target), List.length(branches), model.branch_choices);
let shown_branches = (target, branches, model) =>
  List.mapi((i, b) => (i, b), branches)
  |> List.filter(((i, _)) =>
       model.match_columns || i == selected_branch(target, branches, model)
     );
let rec lanes = (model, node) =>
  switch (node) {
  | Row(_) => 1
  | Scope({rows, _}) =>
    List.fold_left((n, r) => max(n, lanes(model, r)), 1, rows)
  | Function({body, _}) => lanes(model, body)
  | Match({branches, _}) =>
    model.match_columns
      ? List.fold_left((n, b) => n + lanes(model, b.body), 0, branches)
      : List.fold_left((n, b) => max(n, lanes(model, b.body)), 1, branches)
  };
let row_id = expression => "row-" ++ key(expression);
let parameter_row_id = parameter => "parameter-" ++ key(parameter);
let branch_row_id = pattern => "branch-" ++ key(pattern);

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
  editor.editor.root == Sort.Pat
    ? MakeTerm.from_zip_for_pat(editor.editor.state.zipper)
      |> Language.Pat.rep_id
    : MakeTerm.from_zip_for_sem(editor.editor.state.zipper, ~root=Sort.Exp).
        term
      |> Language.Exp.rep_id;
let cell = (target, model) =>
  List.find(c => key(c.target) == key(target), model.document.cells);
let samples_for = (target, model) =>
  Language.Sample.Map.lookup(
    sample_id(cell(target, model).editor),
    model.samples,
  )
  |> Option.value(~default=[]);
let sample_value = (s: Language.Sample.t) =>
  Language.Substitution.in_exp(Language.Builtins.env_init, s.value);
let in_context = (context, sample: Language.Sample.t) =>
  switch (context) {
  | None => sample.call_stack == []
  | Some(c: Language.Sample.t) =>
    Language.CallStack.equal(c.call_stack, sample.call_stack)
    && sample.step_start >= c.step_start
    && sample.step_end <= c.step_end
  };
let function_calls = (body_target, context, model) =>
  samples_for(body_target, model)
  |> List.filter((s: Language.Sample.t) =>
       switch (context) {
       | None => true
       | Some(c: Language.Sample.t) =>
         s.step_start >= c.step_start && s.step_end <= c.step_end
       }
     )
  |> List.sort((a: Language.Sample.t, b: Language.Sample.t) =>
       compare(a.step_start, b.step_start)
     );
/* A body's sample bounds one invocation. Its step interval distinguishes even
   repeated executions from the same call site; exact stacks separate recursion. */
let refresh_values = model => {
  let values = ref([]);
  let call_counts = ref([]);
  let put = (target, sample) =>
    values := [(key(target), Option.map(sample_value, sample)), ...values^];
  let value = (target, context) =>
    put(
      target,
      List.find_opt(in_context(context), samples_for(target, model)),
    );
  let rec walk = (context, enabled, node) =>
    switch (node) {
    | Row({expression, _}) =>
      enabled ? value(expression, context) : put(expression, None)
    | Scope({rows, _}) => List.iter(walk(context, enabled), rows)
    | Function({target, parameter, body_target, body, _}) =>
      let calls = enabled ? function_calls(body_target, context, model) : [];
      call_counts := [(key(target), List.length(calls)), ...call_counts^];
      let sample =
        List.nth_opt(
          calls,
          choice(key(target), List.length(calls), model.call_choices),
        );
      let argument =
        Option.bind(sample, (body: Language.Sample.t) =>
          samples_for(parameter, model)
          |> List.filter((s: Language.Sample.t) =>
               Language.CallStack.equal(s.call_stack, body.call_stack)
               && s.step_start <= body.step_end
             )
          |> List.rev
          |> List.find_opt((s: Language.Sample.t) => s.seq <= body.seq)
        );
      put(parameter, argument);
      walk(sample, sample != None, body);
    | Match({input, branches, _}) =>
      enabled ? value(input, context) : put(input, None);
      List.iter(
        b => {
          enabled ? value(b.pattern, context) : put(b.pattern, None);
          walk(context, enabled, b.body);
        },
        branches,
      );
    };
  walk(None, true, project(model));
  {
    ...model,
    call_counts: call_counts^,
    document: {
      ...model.document,
      cells:
        List.map(
          c =>
            {
              ...c,
              value:
                Option.value(
                  List.assoc_opt(key(c.target), values^),
                  ~default=None,
                ),
            },
          model.document.cells,
        ),
    },
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
          value: None,
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
  refresh_values({
    ...model,
    document: {
      ...model.document,
      cells: cells @ hidden,
    },
  });
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
      active_view: "",
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
    caret_tone: "violet",
    match_columns: true,
    branch_choices: [],
    call_choices: [],
    call_counts: [],
    selected_value: None,
  });
let value_text = (target, model) =>
  Option.fold(~none="", ~some=text_of_exp, cell(target, model).value);

/* Navigation uses the visible projection, not the underlying syntax order.
   Values and the static result label are deliberately not focus targets. */
type nav_cell = {
  target,
  root: Sort.t,
  inset: int,
  view: string,
  path: list((string, int)),
};
let nav_cells = model => {
  let fields = (id, pattern, expression, depth, path) =>
    (
      model.bindings
        ? List.map(
            target =>
              {
                target,
                root: Sort.Pat,
                inset: model.indentation ? max(0, depth - 1) : 0,
                view: id ++ ":pat",
                path,
              },
            Option.to_list(pattern),
          )
        : []
    )
    @ (
      model.expressions
        ? List.map(
            target =>
              {
                target,
                root: Sort.Exp,
                inset: 0,
                view: id ++ ":exp",
                path,
              },
            Option.to_list(expression),
          )
        : []
    );
  let rec collect = (path, projection) =>
    switch (projection) {
    | Row({pattern, expression, depth, _}) =>
      fields(row_id(expression), pattern, Some(expression), depth, path)
    | Scope({rows, _}) => List.concat_map(collect(path), rows)
    | Function({parameter, body, depth, _}) =>
      fields(
        parameter_row_id(parameter),
        Some(parameter),
        None,
        depth + 1,
        path,
      )
      @ collect(path, body)
    | Match({target, input, branches, depth}) =>
      List.concat_map(
        ((i, b)) => {
          let path = [(key(target), i), ...path];
          fields(
            branch_row_id(b.pattern),
            Some(b.pattern),
            Some(input),
            depth + 1,
            path,
          )
          @ collect(path, b.body);
        },
        shown_branches(target, branches, model),
      )
    };
  collect([], project(model));
};
let active_cell = model => {
  let cells = nav_cells(model);
  switch (List.find_opt(c => c.view == model.document.active_view, cells)) {
  | Some(c) => Some(c)
  | None => List.find_opt(c => key(c.target) == model.document.active, cells)
  };
};
let compatible_paths = (a, b) =>
  List.for_all(
    ((id, i)) =>
      switch (List.assoc_opt(id, b)) {
      | None => true
      | Some(j) => i == j
      },
    a,
  );
/* Source commands shared by pointer and keyboard. Previews never evaluate,
   replace the document, or enter history. All addresses belong to this program. */
[@deriving (show, sexp, yojson)]
type structural_command =
  | InsertBinding(target, option(Id.t))
  | MoveBinding(target, Id.t, option(Id.t))
  | DeleteBinding(target, Id.t, bool)
  | ConnectReference(Id.t, option(Id.t), option(Id.t));
type prepared = {
  segment: Segment.t,
  focus: option(target),
};

let analyse = segment =>
  CachedStatics.init(
    ~settings=settings.core,
    ~is_dynamic_term=false,
    ~stitch=x => x,
    ~root=Sort.Exp,
    Zipper.unzip(segment),
  );
let empty_piece = () =>
  Piece.Grout({
    id: Id.mk(),
    shape: Convex,
  });
let blank = seg =>
  switch (ScratchFocus.core_ws(seg)) {
  | []
  | [Grout(_)] => true
  | _ => false
  };
let blank_binding = (tile: Base.tile) => List.for_all(blank, tile.children);

/* Retain each let tile and its following trivia as one movable chunk. */
let binding_chunks = (scope, segment) => {
  let source = read(scope, segment);
  let (defs, end_at) = let_prefix(source);
  let ids = List.map((t: Base.tile) => t.id, defs);
  let rec split = (pending, pieces, chunks) =>
    switch (pieces) {
    | [Piece.Tile(t), ...rest] when List.mem(t.id, ids) =>
      let rec following = (acc, rest) =>
        switch (rest) {
        | [p, ...tail] when ScratchFocus.is_edge_ws(p) =>
          following([p, ...acc], tail)
        | _ => (List.rev(acc), rest)
        };
      let (ws, tail) = following([], rest);
      split([], tail, chunks @ [(t, pending @ [Piece.Tile(t)] @ ws)]);
    | [p, ...rest] when ScratchFocus.is_edge_ws(p) =>
      split(pending @ [p], rest, chunks)
    | _ => chunks
    };
  (
    split([], ScratchFocus.take(end_at, source), []),
    ScratchFocus.drop(end_at, source),
  );
};
let binding_scope = (id, model) => {
  let rec find =
    fun
    | Scope({target, rows, _}) => {
        let (defs, _) = let_prefix(read(target, model.document.segment));
        List.exists((t: Base.tile) => t.id == id, defs)
          ? Some(target) : List.find_map(find, rows);
      }
    | Function({body, _}) => find(body)
    | Match({branches, _}) => List.find_map(b => find(b.body), branches)
    | Row(_) => None;
  find(
    project({
      ...model,
      closed: [],
    }),
  );
};
let rec replace_piece = (id, replacement, seg: Segment.t) =>
  ScratchFocus.map_sharing(
    (p: Piece.t) =>
      Piece.id(p) == id
        ? replacement
        : (
          switch (p) {
          | Tile(t) =>
            ScratchFocus.tile_sharing(
              p,
              t,
              ScratchFocus.map_sharing(
                replace_piece(id, replacement),
                t.children,
              ),
            )
          | _ => p
          }
        ),
    seg,
  );
let rec piece_by_id = (id, seg: Segment.t) =>
  List.find_map(
    (p: Piece.t) =>
      Piece.id(p) == id
        ? Some(p)
        : (
          switch (p) {
          | Tile(t) => List.find_map(piece_by_id(id), t.children)
          | _ => None
          }
        ),
    seg,
  );
let target_for_piece = (id, model) =>
  List.find_map(
    ((target, sort)) =>
      sort == Sort.Exp
      && ScratchFocus.seg_contains_id(
           id,
           read(target, model.document.segment),
         )
        ? Some(target) : None,
    targets(project(model)),
  );

/* A deliberately narrow total fragment, in addition to lexical/type checks.
   Moving calls or incomplete computations is available in Free edit. */
let rec total_for_move = (exp: Language.Exp.t) =>
  switch (exp.term) {
  | Atom(_)
  | Var(_)
  | Fun(_) => true
  | Parens(e)
  | UnOp(_, e) => total_for_move(e)
  | BinOp(
      Int(Plus | Minus | Times) | Nat(Plus | Minus | Times) |
      SInt(Plus | Minus | Times) |
      Float(Plus | Minus | Times),
      a,
      b,
    ) =>
    total_for_move(a) && total_for_move(b)
  | Tuple(es)
  | ListLit(es) => List.for_all(total_for_move, es)
  | Let(p, definition, body) =>
    /* A nested let is just as movable as its total definition and body.
       Keep refutable patterns, calls and incomplete computations excluded. */
    let irrefutable =
      switch (p.term) {
      | Var(_)
      | Wild => true
      | _ => false
      };
    irrefutable && total_for_move(definition) && total_for_move(body);
  | _ => false
  };
let same_resolutions = (old, next) =>
  Id.Map.for_all(
    (id, info) =>
      switch (info) {
      | Language.Info.InfoExp({user_term: {term: Var(_), _}, _}) =>
        switch (Language.Statics.Map.lookup(id, next)) {
        | Some(other) =>
          Language.Info.get_binding_site(info)
          == Language.Info.get_binding_site(other)
        | None => false
        }
      | _ => true
      },
    old,
  );
let prepare_structure = (~policy, command, model): result(prepared, string) => {
  let refuse = message => failwith(message);
  let known_policy = List.mem(policy, ["refactor", "refine", "free"]);
  try(
    {
      if (!known_policy) {
        refuse("Unknown editing policy.");
      };
      switch (command) {
      | InsertBinding(scope, _)
      | MoveBinding(scope, _, _)
      | DeleteBinding(scope, _, _) =>
        let (chunks, tail) = binding_chunks(scope, model.document.segment);
        let contains = id =>
          List.exists(((t: Base.tile, _)) => t.id == id, chunks);
        let insert_at = (before, chunk, chunks) => {
          let rec loop = (
            fun
            | [] => [chunk]
            | [(t: Base.tile, _) as c, ...rest] as all =>
              Some(t.id) == before ? [chunk, ...all] : [c, ...loop(rest)]
          );
          loop(chunks);
        };
        let (changed, focus, verify_move) =
          switch (command) {
          | InsertBinding(_, before) =>
            if (Option.fold(~none=false, ~some=id => !contains(id), before)) {
              refuse("That binding boundary no longer exists.");
            };
            let tile = List.hd(fst(let_prefix(parse("let ¿ = ¿ in 0"))));
            let chunk = (
              tile,
              [
                Piece.Tile(tile),
                Piece.Secondary(Secondary.mk_newline(Id.mk())),
              ],
            );
            (
              insert_at(before, chunk, chunks),
              Some(child(tile.id, 1)),
              false,
            );
          | MoveBinding(_, id, before) =>
            if (binding_scope(id, model) != Some(scope)) {
              refuse("Move within the same let scope for now.");
            };
            if (Option.fold(~none=false, ~some=id => !contains(id), before)) {
              refuse("That destination no longer exists.");
            };
            let chunk =
              List.find(((t: Base.tile, _)) => t.id == id, chunks);
            let changed =
              before == Some(id)
                ? chunks
                : insert_at(
                    before,
                    chunk,
                    List.filter(((t: Base.tile, _)) => t.id != id, chunks),
                  );
            if (policy != "free" && changed != chunks) {
              let old_i =
                Option.get(
                  List.find_index(
                    ((t: Base.tile, _)) => t.id == id,
                    chunks,
                  ),
                );
              let new_i =
                Option.get(
                  List.find_index(
                    ((t: Base.tile, _)) => t.id == id,
                    changed,
                  ),
                );
              List.iteri(
                (i, (t: Base.tile, _)) =>
                  if (i >= min(old_i, new_i)
                      && i <= max(old_i, new_i)
                      && !blank_binding(t)) {
                    let pat =
                      MakeTerm.from_zip_for_pat(
                        Zipper.unzip(
                          ScratchFocus.core_ws(List.hd(t.children)),
                        ),
                      );
                    switch (pat.term) {
                    | Var(_)
                    | Wild => ()
                    | _ =>
                      refuse(
                        "Refactor currently moves simple, irrefutable bindings only.",
                      )
                    };
                    if (List.exists(
                          id =>
                            ScratchFocus.seg_contains_id(
                              id,
                              List.nth(t.children, 1),
                            ),
                          model.statics.error_ids,
                        )) {
                      refuse(
                        "Refactor cannot move a definition with a static error.",
                      );
                    };
                    let info =
                      MakeTerm.from_zip_for_sem(
                        Zipper.unzip(
                          ScratchFocus.core_ws(
                            read(child(t.id, 1), model.document.segment),
                          ),
                        ),
                        ~root=Sort.Exp,
                      ).
                        term;
                    if (!total_for_move(info)) {
                      refuse(
                        "Refactor cannot yet justify moving this computation. Use Free edit.",
                      );
                    };
                  },
                chunks,
              );
            };
            (changed, Some(child(id, 1)), policy != "free");
          | DeleteBinding(_, id, empty_only) =>
            if (binding_scope(id, model) != Some(scope)) {
              refuse("Only a binding row can be deleted.");
            };
            let (tile, _) =
              List.find(((t: Base.tile, _)) => t.id == id, chunks);
            if (!blank_binding(tile) && (empty_only || policy != "free")) {
              refuse(
                "Populated row deletion needs Free edit; Backspace cleans up a two-hole row.",
              );
            };
            let changed =
              List.filter(((t: Base.tile, _)) => t.id != id, chunks);
            let i =
              Option.get(
                List.find_index(((t: Base.tile, _)) => t.id == id, chunks),
              );
            let focus =
              switch (List.nth_opt(changed, max(0, i - 1))) {
              | Some((t, _)) => child(t.id, 1)
              | None => {
                  ...scope,
                  offset:
                    scope.offset + List.length(List.concat_map(snd, changed)),
                }
              };
            (changed, Some(focus), false);
          | _ => assert(false)
          };
        let content = List.concat_map(snd, changed) @ tail;
        let segment =
          replace_at(
            scope.location,
            ScratchFocus.take(
              scope.offset,
              at(scope.location, model.document.segment),
            )
            @ content,
            model.document.segment,
          );
        if (verify_move) {
          let next = analyse(segment);
          /* Existing blank scaffolds can be crossed, but never silently rebind a use. */
          if (!same_resolutions(model.statics.info_map, next.info_map)) {
            refuse(
              "This move would change a reference's binding or leave it out of scope.",
            );
          };
          if (List.exists(
                id => !List.mem(id, model.statics.error_ids),
                next.error_ids,
              )) {
            refuse("This move introduces a static error.");
          };
        };
        Ok({
          segment,
          focus,
        });
      | ConnectReference(binder, source, destination) =>
        let name =
          switch (Language.Statics.Map.lookup(binder, model.statics.info_map)) {
          | Some(InfoPat({user_term: {term: Var(name), _}, _})) => name
          | _ => refuse("The original binding is no longer available.")
          };
        Option.iter(
          id =>
            switch (Language.Statics.Map.lookup(id, model.statics.info_map)) {
            | Some(InfoExp({user_term: {term: Var(_), _}, _}) as info)
                when Language.Info.get_binding_site(info) == Some(binder) =>
              ()
            | _ =>
              refuse("The picked reference no longer names this binding.")
            },
          source,
        );
        if (source == destination && source != None) {
          Ok({
            segment: model.document.segment,
            focus: Option.bind(source, id => target_for_piece(id, model)),
          });
        } else {
          if (policy == "refactor") {
            refuse("Connecting a reference needs Refine or Free edit.");
          };
          if (source != None && policy != "free") {
            refuse("Moving or unplugging an existing use needs Free edit.");
          };
          let fresh =
            switch (destination) {
            | None => None
            | Some(id) =>
              let info =
                switch (
                  Language.Statics.Map.lookup(id, model.statics.info_map)
                ) {
                | Some(InfoExp(info)) => info
                | _ =>
                  refuse("Choose an expression hole or variable reference.")
                };
              let is_hole =
                switch (info.user_term.term) {
                | EmptyHole => true
                | _ => false
                };
              if (!is_hole && policy != "free") {
                refuse("Refine fills an empty expression hole.");
              };
              if (!is_hole) {
                switch (info.user_term.term) {
                | Var(_) => ()
                | _ => refuse("Choose a hole or variable reference.")
                };
              };
              let entry =
                switch (Language.Ctx.lookup_var(info.ctx, name)) {
                | Some(entry) when entry.id == binder => entry
                | _ =>
                  refuse(
                    "That binding is outside this target's lexical scope or shadowed here.",
                  )
                };
              if (policy == "refine"
                  && !
                       Language.Typ.is_consistent(
                         info.ctx,
                         entry.typ,
                         info.ana,
                       )) {
                refuse(
                  "That binding does not fit this hole's expected type.",
                );
              };
              let copied =
                switch (source) {
                | Some(id) =>
                  Option.get(piece_by_id(id, model.document.segment))
                | None =>
                  let original =
                    Option.get(piece_by_id(binder, model.document.segment));
                  let text = Printer.of_segment(~indent=" ", [original]);
                  switch (ScratchFocus.core_ws(parse(text))) {
                  | [Piece.Tile(t)] => Piece.Tile(t)
                  | _ => refuse("This binder cannot yet be connected.")
                  };
                };
              Some((id, copied));
            };
          let segment =
            Option.fold(
              ~none=model.document.segment,
              ~some=
                id =>
                  replace_piece(id, empty_piece(), model.document.segment),
              source,
            );
          let segment =
            Option.fold(
              ~none=segment,
              ~some=((id, copied)) => replace_piece(id, copied, segment),
              fresh,
            );
          Ok({
            segment,
            focus:
              Option.bind(destination == None ? source : destination, id =>
                target_for_piece(id, model)
              ),
          });
        };
      };
    }
  ) {
  | Failure(message) => Error(message)
  | Not_found => Error("That source target no longer exists.")
  };
};

[@deriving (show, sexp, yojson)]
type travel =
  | Across(Direction.t)
  | BetweenRows(Action.vertical);

let neighbor = (view, forward, cells: list(nav_cell)) => {
  let cells = forward ? cells : List.rev(cells);
  let rec next = cells =>
    switch (cells) {
    | [a, b, ..._] when a.view == view => Some(b)
    | [_, ...rest] => next(rest)
    | [] => None
    };
  next(cells);
};

[@deriving (show, sexp, yojson)]
type action =
  | Edit(target, CodeEditable.Update.t)
  | EditView(target, string, CodeEditable.Update.t)
  | FocusView(target, string)
  | MatchMode(bool)
  | BranchStep(string, int)
  | CallStep(string, int)
  | SelectValue(option(string))
  | Focus(string)
  | Navigate(target, travel)
  | CaretTone(string)
  | ToggleScope(string)
  | FurlAll
  | Toggle(string)
  | Undo
  | Redo
  | Reset
  | Structure(Segment.t, string, structural_command);

let rec update = (action, model) => {
  /* Inspecting a value is view focus, never part of the source or history.
     Any editor/projection action returns focus to code. */
  let model =
    switch (action) {
    | SelectValue(_)
    | CallStep(_) => model
    | _ when model.selected_value != None => {
        ...model,
        selected_value: None,
      }
    | _ => model
    };
  switch (action) {
  | Structure(expected, policy, command) =>
    if (expected !== model.document.segment) {
      model;
    } else {
      switch (prepare_structure(~policy, command, model)) {
      | Error(message) => {
          ...model,
          message,
        }
      | Ok({segment, focus: _})
          when Segment.ptr_eq(segment, model.document.segment) => model
      | Ok({segment, focus}) =>
        let next =
          calculate({
            ...model,
            document: {
              ...model.document,
              segment,
              active: "",
              active_view: "",
            },
            undo: [model.document, ...ScratchFocus.take(99, model.undo)],
            redo: [],
            expressions: true,
            closed:
              List.filter(
                id =>
                  !Option.fold(~none=false, ~some=t => id == key(t), focus),
                model.closed,
              ),
          });
        switch (focus) {
        | Some(target) =>
          let cells = nav_cells(next);
          let dest =
            switch (List.find_opt(c => c.target == target, cells)) {
            | Some(_) as cell => cell
            | None =>
              let nested =
                switch (command) {
                | DeleteBinding(_) =>
                  /* The preceding binding may end in a projected function or
                     match, with no editor for its whole RHS. Use its last
                     visible child editor so deletion always leaves a caret. */
                  let content = read(target, next.document.segment);
                  List.find_opt(
                    c =>
                      List.exists(
                        p =>
                          ScratchFocus.seg_contains_id(Piece.id(p), content),
                        read(c.target, next.document.segment),
                      ),
                    List.rev(cells),
                  );
                | _ => None
                };
              switch (nested) {
              | Some(_) => nested
              | None =>
                /* A moved definition may be projected into a function or match;
                   its RHS then has no single editor. Retain focus on its name. */
                switch (target.location) {
                | Child(id, 1) =>
                  List.find_opt(
                    c => c.target.location == Child(id, 0),
                    cells,
                  )
                | _ => None
                }
              };
            };
          Option.fold(
            ~none=next,
            ~some=c => update(FocusView(c.target, c.view), next),
            dest,
          );
        | None => next
        };
      };
    }
  | SelectValue(selected_value) => {
      ...model,
      selected_value,
    }
  | EditView(target, view, action) =>
    update(Edit(target, action), update(FocusView(target, view), model))
  | FocusView(target, view) => {
      ...model,
      document: {
        ...model.document,
        active: key(target),
        active_view: view,
      },
    }
  | MatchMode(match_columns) =>
    let before = active_cell(model);
    let branch_choices =
      switch (before) {
      | None => model.branch_choices
      | Some(c) =>
        c.path
        @ List.filter(
            ((id, _)) => !List.mem_assoc(id, c.path),
            model.branch_choices,
          )
      };
    {
      ...model,
      match_columns,
      branch_choices,
    };
  | BranchStep(id, delta) =>
    let rec find = (
      fun
      | Match({target, branches, _}) when key(target) == id =>
        Some((target, branches))
      | Match({branches, _}) => List.find_map(b => find(b.body), branches)
      | Function({body, _}) => find(body)
      | Scope({rows, _}) => List.find_map(find, rows)
      | Row(_) => None
    );
    switch (find(project(model))) {
    | None => model
    | Some((target, branches)) =>
      let old_index =
        switch (active_cell(model)) {
        | Some(c) =>
          Option.value(
            List.assoc_opt(id, c.path),
            ~default=selected_branch(target, branches, model),
          )
        | None => selected_branch(target, branches, model)
        };
      let index =
        (old_index + delta + List.length(branches)) mod List.length(branches);
      let old = active_cell(model);
      let same_attribute = c =>
        Option.fold(~none=true, ~some=from => c.root == from.root, old);
      let old_cells =
        List.filter(
          c =>
            List.assoc_opt(id, c.path) == Some(old_index)
            && same_attribute(c),
          nav_cells(model),
        );
      let ordinal =
        Option.value(
          List.find_index(c => Some(c) == old, old_cells),
          ~default=0,
        );
      let next = {
        ...model,
        branch_choices: [
          (id, index),
          ...List.remove_assoc(id, model.branch_choices),
        ],
      };
      let new_cells =
        List.filter(
          c =>
            List.assoc_opt(id, c.path) == Some(index) && same_attribute(c),
          nav_cells(next),
        );
      switch (
        List.nth_opt(
          new_cells,
          max(0, min(ordinal, List.length(new_cells) - 1)),
        )
      ) {
      | None => next
      | Some(dest) =>
        let column =
          Option.fold(
            ~none=0,
            ~some=
              c => {
                let editor = cell(c.target, model).editor.editor;
                Option.value(
                  editor.state.col_target,
                  ~default=
                    Zipper.Caret.point(
                      editor.syntax.measured,
                      editor.state.zipper,
                    ).
                      col,
                );
              },
            old,
          );
        update(
          EditView(
            dest.target,
            dest.view,
            Perform(
              Move(
                Point(
                  {
                    row: 0,
                    col: column,
                  },
                  None,
                ),
              ),
            ),
          ),
          next,
        );
      };
    };
  | CallStep(id, delta) =>
    refresh_values({
      ...model,
      call_choices: [
        (
          id,
          max(
            0,
            choice(
              id,
              Option.value(
                List.assoc_opt(id, model.call_counts),
                ~default=0,
              ),
              model.call_choices,
            )
            + delta,
          ),
        ),
        ...List.remove_assoc(id, model.call_choices),
      ],
    })
  | CaretTone(caret_tone)
      when List.mem(caret_tone, ["violet", "coral", "teal"]) => {
      ...model,
      caret_tone,
    }
  | CaretTone(_) => model
  | Navigate(target, Across(direction))
      when
        !
          Selection.is_empty(
            cell(target, model).editor.editor.state.zipper.selection,
          ) =>
    update(Edit(target, Perform(Move(Local(direction, ByChar)))), model)
  | Navigate(target, travel) =>
    let cells = nav_cells(model);
    switch (
      List.find_opt(
        c =>
          c.target == target
          && (
            model.document.active_view == ""
            || c.view == model.document.active_view
          ),
        cells,
      )
    ) {
    | None => model
    | Some(from) =>
      let old = cell(target, model).editor.editor;
      let (to_cell, vertical) =
        switch (travel) {
        | Across(direction) => (
            neighbor(from.view, direction == Right, cells),
            None,
          )
        | BetweenRows(v) => (
            neighbor(
              from.view,
              v == Down,
              List.filter(
                c =>
                  c.root == from.root && compatible_paths(from.path, c.path),
                cells,
              ),
            ),
            Some(v),
          )
        };
      switch (to_cell) {
      | None => model
      | Some(dest) =>
        let target_col =
          Option.value(
            old.state.col_target,
            ~default=
              Zipper.Caret.point(old.syntax.measured, old.state.zipper).col,
          )
          + from.inset
          - dest.inset;
        let destination = cell(dest.target, model).editor.editor;
        let move =
          switch (travel) {
          | Across(Left) => Action.End
          | Across(Right) => Start
          | BetweenRows(v) =>
            Point(
              {
                row:
                  v == Down
                    ? 0 : max(0, destination.syntax.measured.total_rows - 1),
                col: max(0, target_col),
              },
              None,
            )
          };
        let next =
          update(
            EditView(dest.target, dest.view, Perform(Move(move))),
            model,
          );
        let cells =
          List.map(
            (c: cell) =>
              c.target == dest.target
                ? {
                  ...c,
                  editor: {
                    ...c.editor,
                    editor: {
                      ...c.editor.editor,
                      state: {
                        ...c.editor.editor.state,
                        col_target: Option.map(_ => target_col, vertical),
                      },
                    },
                  },
                }
                : c,
            next.document.cells,
          );
        {
          ...next,
          document: {
            ...next.document,
            cells,
          },
        };
      };
    };
  | Focus(active) => {
      ...model,
      document: {
        ...model.document,
        active,
        active_view: "",
      },
    }
  | ToggleScope(id) =>
    let next =
      refresh_cells({
        ...model,
        closed:
          List.mem(id, model.closed)
            ? List.filter(k => k != id, model.closed) : [id, ...model.closed],
      });
    let focus =
      switch (active_cell(next)) {
      | Some(c) => Some(c)
      | None =>
        switch (List.find_opt(c => key(c.target) == id, nav_cells(next))) {
        | Some(c) => Some(c)
        | None => List.nth_opt(nav_cells(next), 0)
        }
      };
    switch (focus) {
    | Some(c) => update(FocusView(c.target, c.view), next)
    | None => next
    };
  | FurlAll =>
    let next =
      refresh_cells({
        ...model,
        closed: [],
      });
    let focus =
      switch (active_cell(next)) {
      | Some(c) => Some(c)
      | None => List.nth_opt(nav_cells(next), 0)
      };
    switch (focus) {
    | Some(c) => update(FocusView(c.target, c.view), next)
    | None => next
    };
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
        active_view: "",
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
    let changed = updated.is_edit;
    /* Cursor-only actions use Hazel's selection-only cache path for ONE cell.
       Keep all other cells, projected statics and evaluated values intact. */
    let editor =
      changed
        ? updated.model
        : CodeWithStatics.Update.calculate(
            ~settings=settings.core,
            ~is_edited=false,
            ~projected=updated.model.statics,
            ~stitch=x => x,
            ~dynamics=model.samples,
            ~is_dynamic_term=false,
            updated.model,
          );
    let segment =
      changed
        ? replace(target, pieces(editor), model.document.segment)
        : model.document.segment;
    let source = read(target, segment) |> ScratchFocus.core_ws;
    /* Creating a let while typing must not replace the focused editor with
       rows halfway through the input. Keep that occurrence as code until the
       user explicitly furls it. */
    let closed =
      changed && foldable(source) && !List.mem(key(target), model.closed)
        ? [key(target), ...model.closed] : model.closed;
    let cells =
      List.map(
        (c: cell) =>
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
      active_view:
        model.document.active == key(target)
          ? model.document.active_view : "",
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
    changed ? calculate(next) : next;
  };
};
