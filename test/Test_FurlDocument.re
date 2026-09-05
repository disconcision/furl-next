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
