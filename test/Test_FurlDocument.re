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
  | Program => failwith("No RHS")
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

let tests = (
  "FurlDocument",
  [
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
