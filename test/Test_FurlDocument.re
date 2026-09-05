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

let tests = (
  "FurlDocument",
  [
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
