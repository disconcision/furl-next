open FurlDocument;
open Virtual_dom.Vdom;

/* Rail depth is local to a column, independent of pattern indentation.
   The first case arm continues its enclosing column. A later arm starts
   with its match stem at level zero, followed by its own nested scopes. */
let plan = (model, tree) => {
  let depths = Array.make(lanes(model, tree), 0);
  let register = (lane, level) =>
    depths[lane] = max(depths[lane], level + 1);
  let rec walk = (lane, level, node) =>
    switch (node) {
    | Row({expression, _}) =>
      if (foldable(read(expression, model.document.segment))) {
        register(lane, level);
      }
    | Scope({rows, _}) =>
      register(lane, level);
      List.iter(walk(lane, level + 1), rows);
    | Function({body, _}) =>
      register(lane, level);
      walk(lane, level + 1, body);
    | Match({branches, _}) =>
      let next_lane = ref(lane);
      List.iteri(
        (i, b) => {
          let branch_level = model.match_columns && i > 0 ? 0 : level;
          register(next_lane^, branch_level);
          walk(next_lane^, branch_level + 1, b.body);
          if (model.match_columns) {
            next_lane := next_lane^ + lanes(model, b.body);
          };
        },
        branches,
      );
    };
  walk(0, 0, tree);
  depths;
};

let x = (depths, lane, level) => float_of_int(level - depths[lane]);
let gap = depths =>
  Array.to_list(depths)
  |> List.mapi((i, depth) => i == 0 ? 0 : depth + 1)
  |> List.fold_left(max, 2);

/* SVGs retain CSS pixel coordinates: no stretched viewBox, so curves and
   strokes do not distort when a native editor grows taller. */
let svg = (~attrs=[], children) =>
  Node.create_svg(
    "svg",
    ~attrs=[
      Attr.class_("furl-comb-svg"),
      Attr.create("aria-hidden", "true"),
      Attr.create("focusable", "false"),
      ...attrs,
    ],
    children,
  );
let path = (part, d) =>
  Node.create_svg(
    "path",
    ~attrs=[Attr.create("data-part", part), Attr.create("d", d)],
    [],
  );
let vertical = (x, y) =>
  Node.create_svg(
    "line",
    ~attrs=[
      Attr.create("data-part", "stem"),
      Attr.create("x1", Printf.sprintf("%g", x)),
      Attr.create("x2", Printf.sprintf("%g", x)),
      Attr.create("y1", Printf.sprintf("%g", y)),
      Attr.create("y2", "100%"),
    ],
    [],
  );
let stem = (~pitch, ~kind, ~first=false, ()) => {
  let x = pitch /. 2.;
  let curl = pitch *. 0.65;
  let (cap, y) =
    switch (kind) {
    | "match" when first => ([], -. curl)
    | "match" => (
        [
          path(
            "branch-curve",
            Printf.sprintf("M %g 0 Q %g 0 %g %g", x -. curl, x, x, curl),
          ),
        ],
        curl,
      )
    | _ => (
        [
          path(
            "cap",
            Printf.sprintf(
              "M %g 0 Q %g 0 %g %g",
              x +. pitch *. 0.5,
              x,
              x,
              pitch *. 0.5,
            ),
          ),
        ],
        pitch *. 0.5,
      )
    };
  svg(cap @ [vertical(x, y)]);
};
let parameter = pitch =>
  svg([path("parameter", Printf.sprintf("M 0 0 H %g", pitch *. 0.65))]);
let bridge = (~pitch, ~many) => {
  let curl = pitch *. 0.65;
  let lead =
    path(
      "fork",
      Printf.sprintf("M 0 %g C 0 0 %g 0 %g 0", -. curl, curl, 2. *. curl),
    );
  svg(
    ~attrs=[Attr.class_("furl-bridge-svg")],
    [lead]
    @ (
      many
        ? [
          Node.create_svg(
            "line",
            ~attrs=[
              Attr.create("data-part", "bridge"),
              Attr.create("x1", Printf.sprintf("%g", 2. *. curl)),
              Attr.create("y1", "0"),
              Attr.create("x2", "100%"),
              Attr.create("y2", "0"),
            ],
            [],
          ),
        ]
        : []
    ),
  );
};
