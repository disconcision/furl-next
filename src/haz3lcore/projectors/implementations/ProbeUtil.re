open Util;
open ProjectorBase;
open Language;

/* Shared rendering helpers for probe-like projectors (ProbeProj samples and
 * TableProj/TableRenderer cells). Width is measured in Unicode display
 * columns rather than byte length so wide-glyph values size correctly. */

let len_seg = (utility: utility, seg: Segment.t): int =>
  seg |> utility.seg_to_string |> Unicode.Width.columns_of_string;

let seg_of_exp = (utility: utility, exp: Exp.t): (Segment.t, int) => {
  let seg = utility.term_to_seg(~inline=true, Exp(exp));
  (seg, len_seg(utility, seg));
};

let abbreviated_seg_of =
    (utility: utility, available: int, exp: Exp.t): (Segment.t, int) => {
  let exp = exp |> DHExp.strip_ascriptions |> Exp.strip_projectors;
  let limit = max(1, available);
  /* Runtime tuples need parentheses supplied by the segment renderer; their
     terms need not retain source Parens nodes. Account for that extra ink
     (and any token escaping) before a probe commits to its display width. */
  let rec fit = budget => {
    let (abbr_exp, _) = Abbreviate.abbreviate_exp(~available=budget, exp);
    let (seg, width) = seg_of_exp(utility, abbr_exp);
    width <= limit || budget <= 0
      ? (seg, width) : fit(max(0, budget - (width - limit)));
  };
  fit(available);
};
