open Util;
open Haz3lcore;
open Js_of_ocaml;
open Virtual_dom.Vdom;

/* Values receive the unused width of the shared grid. Only source code can
   require a wider grid; retain a small minimum for a value and call arrows. */
let columns = (~available_width, ~col_width, ~lanes, ~lane_gap, ~code_width) =>
  max(
    5,
    int_of_float(
      floor(
        (
          available_width
          /. max(1., col_width)
          -. float_of_int(max(0, lanes - 1) * lane_gap)
        )
        /. float_of_int(max(1, lanes)),
      ),
    )
    - code_width,
  );

/* Keep the actual sampled term until the display budget is known. Use the
   same structural abbreviation, ascription/projector stripping, and Unicode
   width accounting as Hazel's probes and table cells. Never truncate text. */
let cache: ref(list((Language.Exp.t, int, string))) = ref([]);
let render = (~columns, value) =>
  switch (value) {
  | None => ""
  | Some(exp) =>
    switch (List.find_opt(((e, w, _)) => e === exp && w == columns, cache^)) {
    | Some((_, _, text)) => text
    | None =>
      let utility = ProjectorInfo.utility;
      let (seg, _) = ProbeUtil.abbreviated_seg_of(utility, columns, exp);
      let text = utility.seg_to_string(seg);
      cache :=
        [(exp, columns, text), ...List.length(cache^) < 256 ? cache^ : []];
      text;
    }
  };

module Width = {
  [@deriving sexp]
  type t = float;
  let equal = (a, b) => a == b;
};

/* Observe the container's content box, not the potentially wider code grid.
   Resizing is view state and never edits, saves, or evaluates the program. */
module WidthHook =
  Attr.Hooks.Make({
    module Input = {
      type t = float => Effect.t(unit);
      let sexp_of_t = _ => Sexplib.Sexp.Atom("value-width");
      let combine = (_, next) => next;
    };
    module State = {
      type t = {
        mutable report: Input.t,
        mutable observer: option(Js.t(ResizeObserver.resizeObserver)),
        mutable width: float,
      };
    };
    let init = (report, _) =>
      State.{
        report,
        observer: None,
        width: (-1.),
      };
    let on_mount = (_, state: State.t, element) => {
      state.observer =
        Some(
          ResizeObserver.observe(
            ~node=element,
            ~f=
              (entries, _) => {
                Array.iter(
                  entry => {
                    let rect = entry##.contentRect;
                    let width = rect##.right -. rect##.left;
                    if (width != state.width) {
                      state.width = width;
                      state.report(width) |> Bonsai.Effect.Expert.handle;
                    };
                  },
                  Js.to_array(entries),
                )
              },
            (),
          ),
        );
    };
    let update = (~old_input as _, ~new_input, state: State.t, _) =>
      state.report = new_input;
    let destroy = (_, state: State.t, _) =>
      Option.iter(o => o##disconnect, state.observer);
  });
let observe_width = report =>
  Attr.create_hook("furl-value-width", WidthHook.create(report));
