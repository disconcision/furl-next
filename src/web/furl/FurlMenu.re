open Util;
open Js_of_ocaml;
open Virtual_dom.Vdom;

/* A top-layer popover retains its editor's DOM ancestry and theme while
   escaping scrolling panels and even transformed match branches. */
module Input = {
  type t = {
    left: float,
    top: float,
    row_height: float,
    close: Effect.t(unit),
  };
  let sexp_of_t = _ => Sexplib.Sexp.Atom("furl-menu");
  let combine = (_, next) => next;
};

let position = (input: Input.t, element: Js.t(Dom_html.element)) =>
  switch (JsUtil.find_ancestor_with_class(element, "code-container")) {
  | None => ()
  | Some(anchor) =>
    let rect = anchor##getBoundingClientRect;
    let viewport = Dom_html.document##.documentElement;
    let right = float_of_int(viewport##.clientWidth) -. 8.;
    let bottom = float_of_int(viewport##.clientHeight) -. 8.;
    let width = float_of_int(element##.offsetWidth);
    let height = float_of_int(element##.offsetHeight);
    let x = rect##.left +. input.left;
    let above = rect##.top +. input.top -. 3.;
    let below = above +. input.row_height +. 6.;
    let y = below +. height <= bottom ? below : above -. height;
    let px = n => Js.string(Printf.sprintf("%gpx", n));
    element##.style##.left := px(max(8., min(x, right -. width)));
    element##.style##.top := px(max(8., min(y, bottom -. height)));
  };

module PopoverHook =
  Attr.Hooks.Make({
    module Input = Input;
    module State = {
      type t = {
        mutable input: Input.t,
        mutable listeners: list(Dom_html.event_listener_id),
      };
    };
    let init = (input, _) =>
      State.{
        input,
        listeners: [],
      };
    let on_mount = (input, state: State.t, element) => {
      /* Modern browsers put this in the top layer. Fixed positioning remains
         useful as a fallback for browsers without the Popover API. */
      let show = Js.Unsafe.get(element, "showPopover");
      if (Js.to_string(Js.typeof(show)) == "function") {
        ignore(Js.Unsafe.meth_call(element, "showPopover", [||]));
      } else {
        element##removeAttribute(Js.string("popover"));
      };
      position(input, element);
      state.listeners = [
        Dom_html.addEventListener(
          Dom_html.window,
          Dom_html.Event.resize,
          Dom_html.handler(_ => {
            position(state.input, element);
            Js._true;
          }),
          Js._false,
        ),
        Dom_html.addEventListener(
          Dom_html.document,
          Dom_html.Event.scroll,
          Dom_html.handler(event => {
            let inside =
              Js.Opt.case(
                event##.target,
                () => false,
                target =>
                  Js.to_bool(
                    Js.Unsafe.coerce(element)##contains(
                      Js.Unsafe.coerce(target),
                    ),
                  ),
              );
            if (!inside) {
              state.input.close |> Bonsai.Effect.Expert.handle;
            };
            Js._true;
          }),
          Js._true,
        ),
      ];
    };
    let update = (~old_input as _, ~new_input, state: State.t, element) => {
      state.input = new_input;
      position(new_input, element);
    };
    let destroy = (_, state: State.t, _) =>
      List.iter(Dom_html.removeEventListener, state.listeners);
  });

let attrs = (~close, point: Point.t, metrics: FontMetrics.t) => [
  Attr.class_("furl-context-menu"),
  Attr.create("popover", "manual"),
  Attr.create_hook(
    "furl-context-popover",
    PopoverHook.create({
      left: float_of_int(point.col) *. metrics.col_width,
      top: float_of_int(point.row) *. metrics.row_height,
      row_height: metrics.row_height,
      close,
    }),
  ),
];
