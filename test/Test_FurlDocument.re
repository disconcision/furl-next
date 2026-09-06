open Alcotest;
open Web;
open Haz3lcore;
open FurlDocument;

let start = text => init(parse(text));
let result = model =>
  model.result |> Option.map(text_of_exp) |> Option.value(~default="<none>");
let source = model => Printer.of_segment(~indent=" ", model.document.segment);
let named = (name, model) => {
  List.find_map(
    ((target, sort)) =>
      sort == Sort.Pat
      && Printer.of_segment(
           ~indent=" ",
           read(target, model.document.segment) |> ScratchFocus.core_ws,
         )
      == name
        ? Some(target) : None,
    targets(project(model)),
  )
  |> Option.get;
};
let rhs = (name, model) =>
  switch (named(name, model).location) {
  | Child(id, _) => {
      location: Child(id, 1),
      offset: 0,
    }
  | Program
  | Span(_) => failwith("No RHS")
  };
let replace_text = (target, text, model) =>
  model
  |> update(Edit(target, Perform(Select(All))))
  |> update(Edit(target, Perform(Paste(text))));
let caret = (target, model) => {
  let ed = cell(target, model).editor.editor;
  Zipper.Caret.point(ed.syntax.measured, ed.state.zipper);
};
let at_col = (target, col, model) =>
  update(
    Edit(
      target,
      Perform(
        Move(
          Point(
            {
              row: 0,
              col,
            },
            None,
          ),
        ),
      ),
    ),
    model,
  );

let rec first_function =
  fun
  | Function({target, parameter, body_target, _}) =>
    Some((target, parameter, body_target))
  | Scope({rows, _}) => List.find_map(first_function, rows)
  | Match({branches, _}) =>
    List.find_map(b => first_function(b.body), branches)
  | Row(_) => None;
let rec first_match =
  fun
  | Match({target, input, branches, _}) => Some((target, input, branches))
  | Scope({rows, _}) => List.find_map(first_match, rows)
  | Function({body, _}) => first_match(body)
  | Row(_) => None;
let branch_expression = b =>
  switch (b.body) {
  | Row({expression, _}) => expression
  | _ => failwith("Expected simple branch")
  };

let tests = (
  "FurlDocument",
  [
    test_case(
      "structural rows are one native edit with stable identities",
      `Quick,
      () => {
        let m = start("let a = 2 in let b = 3 in let total = a + b in total");
        let binder = name =>
          switch (named(name, m).location) {
          | Child(id, _) => id
          | _ => assert(false)
          };
        let b = binder("b");
        let moved =
          update(
            Structure(
              m.document.segment,
              "refactor",
              MoveBinding(whole, b, Some(binder("a"))),
            ),
            m,
          );
        check(string, "same result", "5", result(moved));
        check(int, "one history entry", 1, List.length(moved.undo));
        check(
          bool,
          "binding address remains",
          true,
          rhs("b", moved) == rhs("b", m),
        );
        check(
          string,
          "undo exact source",
          source(m),
          source(update(Undo, moved)),
        );
        let blocked =
          prepare_structure(
            ~policy="refactor",
            MoveBinding(whole, binder("total"), Some(binder("a"))),
            m,
          );
        check(
          bool,
          "dependency break refused",
          true,
          switch (blocked) {
          | Error(_) => true
          | _ => false
          },
        );
        let free =
          update(
            Structure(
              m.document.segment,
              "free",
              MoveBinding(whole, binder("total"), Some(binder("a"))),
            ),
            m,
          );
        check(
          bool,
          "free edit reports scope errors",
          true,
          free.statics.error_ids != [],
        );
        let inserted =
          update(
            Structure(
              m.document.segment,
              "refine",
              InsertBinding(whole, Some(b)),
            ),
            m,
          );
        check(
          int,
          "draft inserted",
          4,
          List.length(fst(let_prefix(inserted.document.segment))),
        );
        let draft = List.nth(fst(let_prefix(inserted.document.segment)), 1);
        check(bool, "two holes", true, blank_binding(draft));
        check(
          string,
          "focus new expression",
          key(child(draft.id, 1)),
          inserted.document.active,
        );
        let removed =
          update(
            Structure(
              inserted.document.segment,
              "refine",
              DeleteBinding(whole, draft.id, true),
            ),
            inserted,
          );
        check(
          string,
          "empty deletion restores source",
          source(m),
          source(removed),
        );
        check(
          string,
          "stale transaction cancels",
          source(inserted),
          source(
            update(
              Structure(
                m.document.segment,
                "free",
                DeleteBinding(whole, b, false),
              ),
              inserted,
            ),
          ),
        );
      },
    ),
    test_case(
      "checked row movement crosses total nested definitions",
      `Quick,
      () => {
        let m = start(snd(examples[0]));
        let defs = fst(let_prefix(m.document.segment));
        let area = List.nth(defs, 2).id;
        let border = List.nth(defs, 3).id;
        List.iter(
          policy => {
            let moved =
              update(
                Structure(
                  m.document.segment,
                  policy,
                  MoveBinding(whole, area, None),
                ),
                m,
              );
            check(
              int,
              "nested-let crossing commits",
              1,
              List.length(moved.undo),
            );
            check(string, "results preserved", result(m), result(moved));
            check(
              bool,
              "area now follows border",
              true,
              List.nth(fst(let_prefix(moved.document.segment)), 3).id
              == area,
            );
            check(
              bool,
              "nested binding retains identity",
              true,
              rhs("twice", moved) == rhs("twice", m),
            );
            check(
              string,
              "exact undo",
              source(m),
              source(update(Undo, moved)),
            );
            let back =
              update(
                Structure(
                  moved.document.segment,
                  policy,
                  MoveBinding(whole, area, Some(border)),
                ),
                moved,
              );
            check(
              string,
              "reverse crossing restores source",
              source(m),
              source(back),
            );
          },
          ["refactor", "refine"],
        );
        let unsafe =
          start("let a = 2 in let b = let x = a + 1 in x * 2 in a + b");
        let a = List.hd(fst(let_prefix(unsafe.document.segment))).id;
        check(
          bool,
          "nested dependency still protected",
          true,
          switch (
            prepare_structure(
              ~policy="refactor",
              MoveBinding(whole, a, None),
              unsafe,
            )
          ) {
          | Error(_) => true
          | Ok(_) => false
          },
        );
        List.iter(
          body => {
            let m = start("let a = 2 in let b = " ++ body ++ " in a");
            let a = List.hd(fst(let_prefix(m.document.segment))).id;
            check(
              bool,
              "uncertified nested computation still refused",
              true,
              switch (
                prepare_structure(
                  ~policy="refactor",
                  MoveBinding(whole, a, None),
                  m,
                )
              ) {
              | Error(_) => true
              | Ok(_) => false
              },
            );
          },
          ["let x = ¿ in 4", "let f = fun x -> x in f(3)", "let 1 = 2 in 4"],
        );
      },
    ),
    test_case(
      "native connections respect lexical identity, holes, types and undo",
      `Quick,
      () => {
        let m = start("let width = 6 in let height = 4 in ¿ * height");
        let binder =
          read(named("width", m), m.document.segment)
          |> ScratchFocus.core_ws
          |> List.hd
          |> Piece.id;
        let hole =
          Id.Map.bindings(m.statics.info_map)
          |> List.find_map(((id, info)) =>
               switch (info) {
               | Language.Info.InfoExp({user_term: {term: EmptyHole, _}, _}) =>
                 Some(id)
               | _ => None
               }
             )
          |> Option.get;
        let placed =
          update(
            Structure(
              m.document.segment,
              "refine",
              ConnectReference(binder, None, Some(hole)),
            ),
            m,
          );
        check(string, "native evaluation", "24", result(placed));
        check(int, "one undo", 1, List.length(placed.undo));
        let use =
          Id.Map.bindings(placed.statics.info_map)
          |> List.find_map(((id, info)) =>
               switch (info) {
               | Language.Info.InfoExp({
                   user_term: {term: Var("width"), _},
                   _,
                 }) =>
                 Some(id)
               | _ => None
               }
             )
          |> Option.get;
        let deleted =
          update(
            Structure(
              placed.document.segment,
              "free",
              ConnectReference(binder, Some(use), None),
            ),
            placed,
          );
        check(
          string,
          "one undo restores exact program",
          source(placed),
          source(update(Undo, deleted)),
        );
        let shadowed = start("let x = 1 in let f = fun x -> ¿ in f(2)");
        let outer = List.hd(fst(let_prefix(shadowed.document.segment)));
        let binder =
          read(child(outer.id, 0), shadowed.document.segment)
          |> ScratchFocus.core_ws
          |> List.hd
          |> Piece.id;
        let hole =
          Id.Map.bindings(shadowed.statics.info_map)
          |> List.find_map(((id, info)) =>
               switch (info) {
               | Language.Info.InfoExp({user_term: {term: EmptyHole, _}, _}) =>
                 Some(id)
               | _ => None
               }
             )
          |> Option.get;
        check(
          bool,
          "same spelling cannot capture",
          true,
          switch (
            prepare_structure(
              ~policy="free",
              ConnectReference(binder, None, Some(hole)),
              shadowed,
            )
          ) {
          | Error(_) => true
          | _ => false
          },
        );
      },
    ),
    test_case(
      "structural policies guard types and computations while allowing blank crossings",
      `Quick,
      () => {
        let binder = (name, m) =>
          read(named(name, m), m.document.segment)
          |> ScratchFocus.core_ws
          |> List.hd
          |> Piece.id;
        let hole = m =>
          Id.Map.bindings(m.statics.info_map)
          |> List.find_map(((id, info)) =>
               switch (info) {
               | Language.Info.InfoExp({user_term: {term: EmptyHole, _}, _}) =>
                 Some(id)
               | _ => None
               }
             )
          |> Option.get;
        let refused =
          fun
          | Error(_) => true
          | Ok(_) => false;
        let typed = start("let text = \"hello\" in ¿ + 1");
        check(
          bool,
          "incompatible hole type refused",
          true,
          prepare_structure(
            ~policy="refine",
            ConnectReference(
              binder("text", typed),
              None,
              Some(hole(typed)),
            ),
            typed,
          )
          |> refused,
        );
        let m = start("let bonus = 4 in let ¿ = ¿ in let ¿ = ¿ in bonus");
        let first = List.hd(fst(let_prefix(m.document.segment)));
        let moved =
          update(
            Structure(
              m.document.segment,
              "refactor",
              MoveBinding(whole, first.id, None),
            ),
            m,
          );
        check(
          bool,
          "move across two blank scaffolds",
          true,
          moved.document.segment !== m.document.segment,
        );
        check(
          string,
          "blank crossing undo",
          source(m),
          source(update(Undo, moved)),
        );
        let unsafe =
          start("let f = fun x -> x in let a = f(3) in let b = 4 in a + b");
        let defs = fst(let_prefix(unsafe.document.segment));
        check(
          bool,
          "call crossing not certified as a refactor",
          true,
          prepare_structure(
            ~policy="refactor",
            MoveBinding(
              whole,
              List.nth(defs, 2).id,
              Some(List.nth(defs, 1).id),
            ),
            unsafe,
          )
          |> refused,
        );
        let flow = start("let width = 6 in let x = width in ¿");
        let use =
          Id.Map.bindings(flow.statics.info_map)
          |> List.find_map(((id, info)) =>
               switch (info) {
               | Language.Info.InfoExp({
                   user_term: {term: Var("width"), _},
                   _,
                 }) =>
                 Some(id)
               | _ => None
               }
             )
          |> Option.get;
        let moved =
          update(
            Structure(
              flow.document.segment,
              "free",
              ConnectReference(
                binder("width", flow),
                Some(use),
                Some(hole(flow)),
              ),
            ),
            flow,
          );
        check(
          bool,
          "moved reference keeps occurrence ID",
          true,
          piece_by_id(use, moved.document.segment) != None,
        );
        check(string, "move returns real value", "6", result(moved));
        check(
          string,
          "move undo exact",
          source(flow),
          source(update(Undo, moved)),
        );
      },
    ),
    test_case(
      "nested row insertion stays within its defining subtree",
      `Quick,
      () => {
        let m = start("let outer = let inner = 3 in inner + 1 in outer");
        let scope = rhs("outer", m);
        let n =
          update(
            Structure(
              m.document.segment,
              "refine",
              InsertBinding(scope, None),
            ),
            m,
          );
        check(
          int,
          "outer let untouched",
          1,
          List.length(fst(let_prefix(n.document.segment))),
        );
        check(
          int,
          "inner scope gains row",
          2,
          List.length(fst(let_prefix(read(scope, n.document.segment)))),
        );
        check(string, "undo nested", source(m), source(update(Undo, n)));
      },
    ),
    test_case(
      "probe abbreviation uses the available width without changing samples",
      `Quick,
      () => {
        let m = start("let xs = [1, 2, 3, 4, 5, 6, 7, 8] in xs");
        let target = rhs("xs", m);
        let value = cell(target, m).value;
        let full = FurlValue.render(~columns=80, value);
        check(
          string,
          "wide display is complete",
          "[1, 2, 3, 4, 5, 6, 7, 8]",
          full,
        );
        let short = FurlValue.render(~columns=12, value);
        check(
          bool,
          "list retains its delimiters",
          true,
          short.[0] == '[' && short.[String.length(short) - 1] == ']',
        );
        check(
          bool,
          "narrow display is structurally abbreviated",
          true,
          short != full && Util.Unicode.Width.columns_of_string(short) <= 12,
        );
        let moved = at_col(target, 1, m);
        check(
          bool,
          "caret retains sampled term",
          true,
          cell(target, moved).value === value,
        );
        check(
          bool,
          "caret retains execution",
          true,
          moved.samples === m.samples,
        );
        check(
          bool,
          "caret reuses abbreviated display",
          true,
          FurlValue.render(~columns=12, cell(target, moved).value) === short,
        );
        check(
          string,
          "widening restores full detail",
          full,
          FurlValue.render(~columns=80, value),
        );
        check(
          string,
          "missing samples stay blank",
          "",
          FurlValue.render(~columns=12, None),
        );
        check(int, "display does not add history", 0, List.length(m.undo));
        List.iter(
          src => {
            let value = start(src).result;
            List.iter(
              columns => {
                let text = FurlValue.render(~columns, value);
                check(
                  bool,
                  src ++ " fits " ++ string_of_int(columns),
                  true,
                  Util.Unicode.Width.columns_of_string(text) <= columns,
                );
              },
              [1, 3, 5, 8, 12, 24, 48],
            );
          },
          [
            "fun x -> x",
            "(fun x -> x, fun y -> y)",
            "[fun x -> x, fun y -> y]",
            "(name = \"a long name\", values = [1, 2, 3, 4, 5, 6])",
            "[[1, 2, 3], [4, 5, 6], [7, 8, 9]]",
            "\"日本語の長い文字列と🙂🙂🙂\"",
          ],
        );
      },
    ),
    test_case(
      "inspector counts the underlying program once",
      `Quick,
      () => {
        let m =
          start("let first = case missing | 0 => 7 | _ => 8 end in first");
        let counts = FurlInspector.summary(m);
        check(int, "one shared scrutinee error", 1, counts.errors);
        let one = m |> update(MatchMode(false));
        let code = one |> update(ToggleScope(key(whole)));
        check(
          bool,
          "projection reuses problem summary",
          true,
          counts === FurlInspector.summary(code),
        );
        check(
          int,
          "all-source agrees",
          1,
          FurlInspector.summary(code).errors,
        );
        let fixed = replace_text(whole, "1", code);
        check(
          int,
          "editing updates totals",
          0,
          FurlInspector.summary(fixed).errors,
        );
        check(
          int,
          "undo restores totals",
          1,
          FurlInspector.summary(update(Undo, fixed)).errors,
        );
        let hole =
          start("1")
          |> update(Edit(whole, Perform(Select(All))))
          |> update(Edit(whole, Perform(Destruct(Left))));
        check(
          int,
          "empty hole separate from errors",
          0,
          FurlInspector.summary(hole).errors,
        );
        check(
          int,
          "empty hole counted",
          1,
          FurlInspector.summary(hole).holes,
        );
        let syntax =
          Parser.to_zipper(~root=Sort.Exp, "1 2")
          |> Option.get
          |> Zipper.unselect_and_zip
          |> init;
        check(
          bool,
          "missing operator appears in total",
          true,
          FurlInspector.summary(syntax).errors > 0,
        );
      },
    ),
    test_case(
      "inspector follows the native caret and projected typing context",
      `Quick,
      () => {
        let m = start("let x = 1 in x + 2");
        let counts = FurlInspector.summary(m);
        let p = named("x", m);
        let focused =
          m
          |> update(FocusView(p, row_id(rhs("x", m)) ++ ":pat"))
          |> at_col(p, 0);
        let cursor = FurlInspector.cursor(focused) |> Option.get;
        check(
          bool,
          "native pattern information",
          true,
          Option.get(cursor.info) |> Language.Info.sort_of == Sort.Pat,
        );
        let moved = update(Navigate(p, Across(Right)), focused);
        check(
          bool,
          "caret motion reuses problem summary",
          true,
          counts === FurlInspector.summary(moved),
        );
        check(
          bool,
          "no evaluation for inspection",
          true,
          m.samples === moved.samples,
        );
        let selected = update(SelectValue(Some("value")), focused);
        check(
          bool,
          "value focus does not report stale code",
          true,
          FurlInspector.cursor(selected) == None,
        );
        let edited = replace_text(rhs("x", m), "missing", m);
        let before =
          cell(rhs("x", edited), edited).editor.editor.state.zipper;
        let info =
          FurlInspector.cursor(edited)
          |> Option.get
          |> (c => Option.get(c.info));
        check(
          bool,
          "fresh pasted error has native explanation",
          true,
          Language.Info.is_error(info),
        );
        check(
          bool,
          "inspection retains the editing zipper",
          true,
          before
          === cell(rhs("x", edited), edited).editor.editor.state.zipper,
        );
      },
    ),
    test_case(
      "value inspection preserves code focus and evaluation",
      `Quick,
      () => {
        let m = init(~example=3, parse(snd(examples[3])));
        let (fn, parameter, _) = Option.get(first_function(project(m)));
        let focus = parameter_row_id(parameter) ++ ":pat";
        let m = update(FocusView(parameter, focus), m);
        let id = parameter_row_id(parameter);
        let next =
          m
          |> update(SelectValue(Some(id)))
          |> update(CallStep(key(fn), 1));
        check(
          string,
          "selected call arguments",
          "[4, 6]",
          value_text(parameter, next),
        );
        check(
          bool,
          "inspector stays selected",
          true,
          next.selected_value == Some(id),
        );
        check(
          bool,
          "source snapshot unchanged",
          true,
          m.document.segment === next.document.segment,
        );
        check(
          bool,
          "no evaluation or analysis",
          true,
          m.samples === next.samples && m.statics === next.statics,
        );
        check(int, "no undo entry", 0, List.length(next.undo));
        check(
          string,
          "retains return caret",
          focus,
          next.document.active_view,
        );
        let returned = update(FocusView(parameter, focus), next);
        check(
          bool,
          "editing dismisses controls",
          true,
          returned.selected_value == None,
        );
        let hidden =
          next |> update(Toggle("values")) |> update(Toggle("values"));
        check(
          bool,
          "hidden inspector does not reappear",
          true,
          hidden.selected_value == None,
        );
        check(
          string,
          "view changes preserve call choice",
          "[4, 6]",
          value_text(parameter, hidden),
        );
      },
    ),
    test_case(
      "comb rails pack by structural depth within each column", `Quick, () => {
      List.iter(
        ((i, expected)) => {
          let m = init(~example=i, parse(snd(examples[i])));
          let depths = FurlCombs.plan(m, project(m));
          check(
            list(int),
            "reserved rails per column",
            expected,
            Array.to_list(depths),
          );
          Array.iteri(
            (lane, count) => {
              check(
                float(0.001),
                "innermost rail one character offside",
                -1.,
                FurlCombs.x(depths, lane, count - 1),
              );
              if (count > 1) {
                check(
                  float(0.001),
                  "one character between levels",
                  1.,
                  FurlCombs.x(depths, lane, 1)
                  -. FurlCombs.x(depths, lane, 0),
                );
              };
              if (lane > 0) {
                check(
                  bool,
                  "branch gutter contains all local rails",
                  true,
                  FurlCombs.gap(depths) > count,
                );
              };
            },
            depths,
          );
          let hidden =
            m
            |> update(Toggle("comb"))
            |> update(Toggle("indentation"))
            |> update(Toggle("bindings"));
          check(
            list(int),
            "display switches leave rail geometry fixed",
            expected,
            Array.to_list(FurlCombs.plan(hidden, project(hidden))),
          );
        },
        [(0, [2]), (1, [2]), (2, [2, 1]), (3, [3, 2])],
      )
    }),
    test_case(
      "single-branch rails reserve nested scopes in every alternative",
      `Quick,
      () => {
        let m =
          init(~example=3, parse(snd(examples[3])))
          |> update(MatchMode(false));
        let (target, _, _) = Option.get(first_match(project(m)));
        let next = update(BranchStep(key(target), 1), m);
        check(
          list(int),
          "all alternatives measured",
          [4],
          Array.to_list(FurlCombs.plan(m, project(m))),
        );
        check(
          list(int),
          "cycling leaves rails fixed",
          [4],
          Array.to_list(FurlCombs.plan(next, project(next))),
        );
      },
    ),
    test_case(
      "function parameters and body edit the original program",
      `Quick,
      () => {
        let m = init(~example=1, parse(snd(examples[1])));
        let (fn, parameter, body) = Option.get(first_function(project(m)));
        check(
          string,
          "argument comes from the call",
          "(3, 4)",
          value_text(parameter, m),
        );
        check(string, "body sample", "13", value_text(body, m));
        let edited = replace_text(body, "factor * x + offset + 1", m);
        check(string, "body edit", "14", result(edited));
        let renamed = replace_text(parameter, "(factor, y)", edited);
        check(
          bool,
          "parameter changes body context",
          true,
          renamed.statics.error_ids != [],
        );
        check(string, "undo", "14", result(update(Undo, renamed)));
        let round =
          m
          |> update(ToggleScope(key(fn)))
          |> update(ToggleScope(key(fn)));
        check(
          bool,
          "furl preserves source identities",
          true,
          m.document.segment === round.document.segment,
        );
        check(
          bool,
          "furl preserves evaluation",
          true,
          m.samples === round.samples,
        );
      },
    ),
    test_case(
      "match arms are bounded by stable syntax identities",
      `Quick,
      () => {
        let m = init(~example=2, parse(snd(examples[2])));
        let (mt, input, branches) = Option.get(first_match(project(m)));
        let empty = branch_expression(List.nth(branches, 0));
        let nonempty = branch_expression(List.nth(branches, 1));
        check(string, "unexecuted arm is blank", "", value_text(empty, m));
        check(string, "executed arm", "2", value_text(nonempty, m));
        let m2 = replace_text(empty, "100 + 200 + 300", m);
        let (_, input2, branches2) = Option.get(first_match(project(m2)));
        check(
          bool,
          "later arm address stable",
          true,
          nonempty == branch_expression(List.nth(branches2, 1)),
        );
        check(bool, "scrutinee address stable", true, input == input2);
        check(string, "inactive edit leaves actual result", "3", result(m2));
        let m3 = replace_text(input, "[]", m2);
        check(
          string,
          "scrutinee edit routes through shared program",
          "601",
          result(m3),
        );
        check(
          string,
          "old branch value cleared",
          "",
          value_text(nonempty, m3),
        );
        check(string, "new branch value", "600", value_text(empty, m3));
        check(
          string,
          "undo restores previous input",
          "3",
          result(update(Undo, m3)),
        );
        let code = update(ToggleScope(key(mt)), m3);
        check(
          bool,
          "raw match stays editable",
          true,
          List.mem((mt, Sort.Exp), targets(project(code))),
        );
      },
    ),
    test_case(
      "branch views preserve source and navigate shared echoes",
      `Quick,
      () => {
        let m = init(~example=2, parse(snd(examples[2])));
        let (mt, input, branches) = Option.get(first_match(project(m)));
        let cells = nav_cells(m);
        let echoes = List.filter(c => c.target == input, cells);
        check(int, "one occurrence with two views", 2, List.length(echoes));
        check(
          bool,
          "distinct view focus",
          true,
          List.nth(echoes, 0).view != List.nth(echoes, 1).view,
        );
        let m1 =
          update(FocusView(input, List.nth(echoes, 1).view), m)
          |> update(MatchMode(false));
        check(
          int,
          "keeps focused branch",
          1,
          selected_branch(mt, branches, m1),
        );
        check(
          int,
          "single visible input",
          1,
          List.length(List.filter(c => c.target == input, nav_cells(m1))),
        );
        let m2 = update(BranchStep(key(mt), 1), m1);
        check(
          int,
          "cycles to first branch",
          0,
          selected_branch(mt, branches, m2),
        );
        check(
          string,
          "focus remains in expression attribute",
          key(input),
          m2.document.active,
        );
        check(
          bool,
          "source unchanged",
          true,
          m.document.segment === m2.document.segment,
        );
        check(bool, "evaluation unchanged", true, m.samples === m2.samples);
        check(int, "no undo entry", 0, List.length(m2.undo));
      },
    ),
    test_case(
      "branch switching handles hidden attributes and unequal arms",
      `Quick,
      () => {
        let m =
          start(
            "let f = case 1 | 0 => 7 | x => let y = x + 2 in y * 3 end in f",
          );
        let (mt, _, branches) = Option.get(first_match(project(m)));
        let all = nav_cells(m);
        let binding = named("f", m);
        let echo =
          List.find(
            c =>
              c.target == binding
              && List.assoc_opt(key(mt), c.path) == Some(1),
            all,
          );
        let m2 =
          update(FocusView(binding, echo.view), m)
          |> update(MatchMode(false))
          |> update(BranchStep(key(mt), -1));
        check(
          bool,
          "stays in pattern attribute across different arm lengths",
          true,
          Option.get(active_cell(m2)).root == Sort.Pat,
        );
        let hidden =
          m2
          |> update(Toggle("bindings"))
          |> update(Toggle("expressions"))
          |> update(BranchStep(key(mt), 1));
        check(
          int,
          "values-only can still switch",
          1,
          selected_branch(mt, branches, hidden),
        );
        check(bool, "no editors required", true, nav_cells(hidden) == []);
        check(string, "program unaffected", "9", result(hidden));
      },
    ),
    test_case(
      "recursive values belong to the selected invocation",
      `Quick,
      () => {
        let m = init(~example=3, parse(snd(examples[3])));
        check(string, "recursive result", "12", result(m));
        let (fn, parameter, body) = Option.get(first_function(project(m)));
        let calls = function_calls(body, None, m);
        check(int, "four recursive invocations", 4, List.length(calls));
        List.iteri(
          (i, _sample: Language.Sample.t) => {
            let m2 =
              refresh_values({
                ...m,
                call_choices: [(key(fn), i)],
              });
            let argument = value_text(parameter, m2);
            let (_, _, branches) = Option.get(first_match(project(m2)));
            let empty = branch_expression(List.hd(branches));
            check(bool, "argument is a real list", true, argument != "");
            check(
              string,
              "only base invocation has a base result",
              argument == "[]" ? "0" : "",
              value_text(empty, m2),
            );
            let tail = rhs("tail", m2);
            check(
              string,
              "recursive call comes from same frame",
              argument == "[]"
                ? ""
                : argument == "[6]" ? "0" : argument == "[4, 6]" ? "6" : "10",
              value_text(tail, m2),
            );
            check(
              bool,
              "no rerun to inspect a call",
              true,
              m.samples === m2.samples,
            );
            check(
              string,
              "outer call remains its own result",
              "12",
              result(m2),
            );
          },
          calls,
        );
      },
    ),
    test_case(
      "nested match layout adds lanes and preserves code",
      `Quick,
      () => {
        let m =
          start("case 1 | 0 => 7 | x => case x | 1 => 8 | _ => 9 end end");
        check(string, "nested match result", "8", result(m));
        check(int, "parallel nested lanes", 3, lanes(m, project(m)));
        let single = update(MatchMode(false), m);
        check(int, "one lane per match", 1, lanes(single, project(single)));
        check(
          bool,
          "source untouched",
          true,
          m.document.segment === single.document.segment,
        );
      },
    ),
    test_case(
      "vertical navigation retains its goal through short cells",
      `Quick,
      () => {
        let m =
          start("let a = 123456789 in let b = 2 in let c = 987654321 in c");
        let a = rhs("a", m);
        let b = rhs("b", m);
        let c = rhs("c", m);
        let m1 = at_col(a, 7, m);
        check(
          bool,
          "same whole-program analysis",
          true,
          m.statics === m1.statics,
        );
        check(
          bool,
          "unchanged inactive cell",
          true,
          cell(b, m) === cell(b, m1),
        );
        check(
          bool,
          "same active cell context",
          true,
          cell(a, m).editor.statics.info_map
          === cell(a, m1).editor.statics.info_map,
        );
        let m2 = update(Navigate(a, BetweenRows(Down)), m1);
        check(string, "focus moved", key(b), m2.document.active);
        check(int, "short line clips caret", 1, caret(b, m2).col);
        check(
          option(int),
          "goal retained",
          Some(7),
          cell(b, m2).editor.editor.state.col_target,
        );
        let m3 = update(Navigate(b, BetweenRows(Down)), m2);
        check(int, "long line recovers goal", 7, caret(c, m3).col);
        let m4 =
          m3
          |> update(Navigate(c, BetweenRows(Up)))
          |> update(Navigate(b, BetweenRows(Up)));
        check(int, "round trip", 7, caret(a, m4).col);
        check(
          bool,
          "no evaluation on navigation",
          true,
          m.samples === m4.samples,
        );
        check(
          bool,
          "no program changes",
          true,
          m.document.segment === m4.document.segment,
        );
        check(int, "no history on navigation", 0, List.length(m4.undo));
      },
    ),
    test_case(
      "pattern navigation compensates for indentation",
      `Quick,
      () => {
        let m = init(parse(snd(examples[0])));
        let area = named("area", m);
        let twice = named("twice", m);
        let border = named("border", m);
        let m =
          at_col(area, 3, m) |> update(Navigate(area, BetweenRows(Down)));
        check(int, "one character inset", 2, caret(twice, m).col);
        let m = update(Navigate(twice, BetweenRows(Down)), m);
        check(
          int,
          "enclosing binding aligned again",
          3,
          caret(border, m).col,
        );
        let m = update(Navigate(border, BetweenRows(Down)), m);
        check(
          string,
          "static result label skipped",
          key(border),
          m.document.active,
        );
      },
    ),
    test_case(
      "horizontal navigation follows visible editable cells",
      `Quick,
      () => {
        let m = start("let a = 123 in let b = 2 in b");
        let a = named("a", m);
        let ae = rhs("a", m);
        let b = named("b", m);
        let m1 = update(Navigate(a, Across(Right)), m);
        check(string, "pattern to expression", key(ae), m1.document.active);
        check(int, "enter from left", 0, caret(ae, m1).col);
        let m2 = update(Navigate(ae, Across(Right)), m1);
        check(
          string,
          "expression to next pattern",
          key(b),
          m2.document.active,
        );
        let m3 = update(Navigate(b, Across(Left)), m2);
        check(int, "enter from right", 3, caret(ae, m3).col);
        let selected = update(Edit(ae, Perform(Select(All))), m3);
        let collapsed = update(Navigate(ae, Across(Left)), selected);
        check(
          string,
          "collapse selection before crossing",
          key(ae),
          collapsed.document.active,
        );
        let hidden =
          m3
          |> update(Toggle("bindings"))
          |> update(Navigate(ae, Across(Right)));
        check(
          string,
          "hidden patterns skipped",
          key(rhs("b", hidden)),
          hidden.document.active,
        );
      },
    ),
    test_case(
      "vertical entry chooses the adjacent line of a multiline editor",
      `Quick,
      () => {
        let m = start("let a = (111 +\n222) in let b = 12345 in b");
        let a = rhs("a", m);
        let b = rhs("b", m);
        let m = at_col(b, 2, m) |> update(Navigate(b, BetweenRows(Up)));
        check(
          int,
          "entered bottom line",
          cell(a, m).editor.editor.syntax.measured.total_rows - 1,
          caret(a, m).row,
        );
        let m = update(Edit(a, Perform(Move(Vertical(Up, ByChar)))), m);
        check(
          int,
          "native motion continues inside cell",
          0,
          caret(a, m).row,
        );
        check(
          option(int),
          "goal survives native motion",
          Some(2),
          cell(a, m).editor.editor.state.col_target,
        );
      },
    ),
    test_case("examples evaluate using Hazel", `Quick, () => {
      List.iter(
        ((i, expected)) => {
          let model = init(~example=i, parse(snd(examples[i])));
          check(string, "evaluated result", expected, result(model));
          check(int, "well typed", 0, List.length(model.statics.error_ids));
          check(
            bool,
            "real probe samples",
            true,
            !Id.Map.is_empty(model.samples),
          );
        },
        [(0, "(24, 20)"), (1, "13"), (2, "3")],
      )
    }),
    test_case(
      "expression edit recomputes downstream cells",
      `Quick,
      () => {
        let m = start("let x = 6 in let y = x * 4 in y + 1");
        let x = rhs("x", m);
        let y = rhs("y", m);
        let selected = update(Edit(x, Perform(Select(All))), m);
        let round_trip =
          selected
          |> update(ToggleScope(key(whole)))
          |> update(ToggleScope(key(whole)));
        check(
          bool,
          "selection survives projection round trip",
          true,
          cell(x, selected).editor.editor.state.zipper.selection
          == cell(x, round_trip).editor.editor.state.zipper.selection,
        );
        let m2 = replace_text(x, "8", m);
        check(string, "dependent evaluation", "33", result(m2));
        check(string, "dependent sample", "32", value_text(y, m2));
        check(bool, "stable dependent target", true, rhs("y", m2) == y);
        check(string, "undo", "25", result(update(Undo, m2)));
        check(
          string,
          "redo",
          "33",
          result(m2 |> update(Undo) |> update(Redo)),
        );
      },
    ),
    test_case(
      "pattern-root edit changes the shared lexical context",
      `Quick,
      () => {
        let m = start("let x = 6 in x + 1");
        let p = named("x", m);
        check(
          bool,
          "pattern root",
          true,
          cell(p, m).editor.editor.root == Sort.Pat,
        );
        let m2 = replace_text(p, "z", m);
        check(
          string,
          "pattern replacement",
          "z",
          Printer.of_segment(
            ~indent=" ",
            read(p, m2.document.segment) |> ScratchFocus.core_ws,
          ),
        );
        check(
          bool,
          "downstream x is now unbound",
          true,
          m2.statics.error_ids != [],
        );
        check(
          string,
          "undo repairs context",
          "7",
          result(update(Undo, m2)),
        );
      },
    ),
    test_case(
      "furling changes no source, samples, or history",
      `Quick,
      () => {
        let m = start("let x = 6 in let y = let k = x + 1 in k * 2 in y");
        let m2 =
          m
          |> update(ToggleScope(key(whole)))
          |> update(ToggleScope(key(whole)));
        check(string, "source", source(m), source(m2));
        check(string, "value", result(m), result(m2));
        check(int, "no new history", 0, List.length(m2.undo));
        check(bool, "same evaluation", true, m.samples === m2.samples);
      },
    ),
    test_case(
      "nested binding edit splices into its original scope",
      `Quick,
      () => {
        let m = start("let x = 6 in let y = let k = x + 1 in k * 2 in y");
        let m2 = replace_text(rhs("k", m), "x + 4", m);
        check(string, "whole program recomputed", "20", result(m2));
        check(
          int,
          "context remains valid",
          0,
          List.length(m2.statics.error_ids),
        );
      },
    ),
    test_case(
      "evaluation limit clears previous values and undo recovers",
      `Quick,
      () => {
        let m = start("1") |> update(ToggleScope(key(whole)));
        let m2 =
          replace_text(whole, "let loop = fun x -> loop(x) in loop(0)", m);
        check(
          bool,
          "evaluation paused",
          true,
          m2.result == None && m2.message != "",
        );
        check(bool, "no stale samples", true, Id.Map.is_empty(m2.samples));
        check(string, "undo restores value", "1", result(update(Undo, m2)));
      },
    ),
    test_case(
      "reset is undoable",
      `Quick,
      () => {
        let m = start("42");
        let reset = update(Reset, m);
        check(string, "fresh example", "(24, 20)", result(reset));
        check(string, "undo reset", "42", result(update(Undo, reset)));
      },
    ),
    test_case(
      "creating a nested let keeps the edited occurrence as code",
      `Quick,
      () => {
        let m = start("let x = 1 in x * 2");
        let target = rhs("x", m);
        let edited = replace_text(target, "let y = 8 in y + 1", m);
        check(string, "new scope evaluates", "18", result(edited));
        check(
          bool,
          "focused source stays visible",
          true,
          List.exists(((t, _)) => t == target, targets(project(edited))),
        );
        let furled = update(ToggleScope(key(target)), edited);
        check(string, "can furl after editing", "18", result(furled));
        check(
          string,
          "nested y visible",
          "8",
          value_text(rhs("y", furled), furled),
        );
      },
    ),
  ],
);
