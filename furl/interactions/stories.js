// Fixed program states for design review. Values are preset, not Hazel evaluation.
const FURL_INTERACTION_STORIES = [
  {
    id: "extract",
    title: "Extract an intermediate",
    source: "Old Furl literal extraction; Big Book 47–48, 55; Hazel ExtractLet",
    mouse:
      "Structure: pull an indicated subexpression to the boundary above its row.",
    keyboard:
      "Select the subexpression → Extract binding → choose the boundary → Enter.",
    rule: "Keep a fresh name, replace only the chosen occurrence, and preserve evaluation order. Here the selected arithmetic is total; the result stays 14.",
    message:
      "The subexpression has a row and a name; its use remains in the original expression.",
    before: { rows: [["result", "result", "(3 + 4) * 2", "14"]], scopes: [] },
    after: {
      rows: [
        ["part", "part", "3 + 4", "7"],
        ["result", "result", "part * 2", "14"],
      ],
      scopes: [[0, 2, 0]],
    },
    codeBefore: "(3 + 4) * 2",
    codeAfter: "let part = 3 + 4 in\npart * 2",
  },
  {
    id: "group",
    title: "Group rows into a block",
    source: "Big Book 85, 87–88",
    mouse:
      "Select a row range, then Group. Compare the deck’s left-then-up gesture after the explicit version works.",
    keyboard:
      "Select rows through their handles → Group into block → name the result.",
    rule: "Only subtotal escapes this new scope. Grouping rows whose binders are still used outside needs explicit exports or a refusal.",
    message:
      "A new comb marks the nested definition; the parent uses its named result.",
    before: {
      rows: [
        ["base", "base", "3", "3"],
        ["twice", "twice", "base * 2", "6"],
        ["offset", "offset", "4", "4"],
        ["sum", "result", "twice + offset", "10"],
      ],
      scopes: [[0, 4, 0]],
    },
    after: {
      rows: [
        ["base", "base", "3", "3"],
        ["twice", "twice", "base * 2", "6"],
        ["offset", "offset", "4", "4"],
        ["sum", "subtotal", "twice + offset", "10"],
        ["result", "result", "subtotal", "10"],
      ],
      scopes: [
        [0, 5, 0],
        [0, 4, 1],
      ],
    },
    codeBefore:
      "let base = 3 in\nlet twice = base * 2 in\nlet offset = 4 in\ntwice + offset",
    codeAfter:
      "let subtotal =\n  let base = 3 in\n  let twice = base * 2 in\n  let offset = 4 in\n  twice + offset\nin subtotal",
  },
  {
    id: "resize",
    title: "Resize a block — escaping use",
    source: "Big Book 89; proposed rejection feedback",
    mouse: "Structure: pull the upper comb endpoint upward over offset.",
    keyboard:
      "Focus the upper endpoint → ↑ previews one boundary → Enter only when valid.",
    rule: "This candidate is rejected in Refactor: offset would leave the scope of its use on the last row. The study shows the rejected state, not a committed edit.",
    message:
      "Rejected candidate: offset is now hidden inside subtotal, but the parent still uses it.",
    before: {
      rows: [
        ["offset", "offset", "4", "4"],
        ["base", "base", "3", "3"],
        ["sum", "subtotal", "base * 2", "6"],
        ["result", "result", "subtotal + offset", "10"],
      ],
      scopes: [
        [0, 4, 0],
        [1, 3, 1],
      ],
    },
    after: {
      rows: [
        ["offset", "offset", "4", "4"],
        ["base", "base", "3", "3"],
        ["sum", "subtotal", "base * 2", "6"],
        ["result", "result", "subtotal + offset", "?"],
      ],
      scopes: [
        [0, 4, 0],
        [0, 3, 1],
      ],
    },
    codeBefore:
      "let offset = 4 in\nlet subtotal =\n  let base = 3 in base * 2\nin subtotal + offset",
    codeAfter:
      "let subtotal =\n  let offset = 4 in\n  let base = 3 in base * 2\nin subtotal + offset\n\n# Rejected: offset escapes its scope",
  },
  {
    id: "abstract",
    title: "Turn leading rows into parameters",
    source: "Big Book 10–12, 48, 90",
    mouse:
      "Pull the top comb boundary down past factor and x; preview a function and the application supplying their old definitions.",
    keyboard:
      "Select the leading rows → Abstract leading rows → review parameter order and call → Enter.",
    rule: "Use a single tuple parameter initially. In general, preserve evaluation order and rewrite affected uses; existing effectful or escaping definitions can block the transformation.",
    message:
      "Two definitions become tuple parameters; the new call carries their original values.",
    before: {
      rows: [
        ["factor", "factor", "3", "3"],
        ["x", "x", "7", "7"],
        ["body", "scaled", "factor * x", "21"],
        ["result", "result", "scaled + 1", "22"],
      ],
      scopes: [[0, 4, 0]],
    },
    after: {
      rows: [
        ["params", "(factor, x)", "·", "(3, 7)"],
        ["body", "scale", "factor * x", "〈fun〉"],
        ["call", "scaled", "scale(3, 7)", "21"],
        ["result", "result", "scaled + 1", "22"],
      ],
      scopes: [
        [0, 4, 0],
        [0, 2, 1, 1],
      ],
    },
    codeBefore:
      "let factor = 3 in\nlet x = 7 in\nlet scaled = factor * x in\nscaled + 1",
    codeAfter:
      "let scale = fun (factor, x) ->\n  factor * x\nin\nlet scaled = scale(3, 7) in\nscaled + 1",
  },
  {
    id: "branch",
    title: "Add the empty-list branch",
    source: "Big Book 91, 94; Hazel AddCaseArm",
    mouse:
      "Structure: click or pull the fork to the right. Normal comb clicks remain view operations.",
    keyboard:
      "Focus the branch handle → Add branch → Tab through its pattern and expression.",
    rule: "A branch is a pattern and a body, not an inserted let. This is an edit completing missing behavior. Shared scrutinee displays still address one source occurrence.",
    message:
      "The new column handles []; xs remains one scrutinee, echoed in both columns.",
    before: {
      rows: [
        ["xs", "xs", "[2, 4]", "[2, 4]"],
        ["pat", "h :: t", "xs", "[2, 4]"],
        ["result", "result", "h", "2"],
      ],
      scopes: [
        [0, 3, 0],
        [1, 3, 1],
      ],
    },
    after: {
      lanes: 2,
      rows: [
        ["xs", "xs", "[2, 4]", "[2, 4]"],
        ["pat", "h :: t", "xs", "[2, 4]"],
        ["result", "result", "h", "2"],
        ["pat2", "[]", "xs", "[2, 4]", 1, 1],
        ["result2", "result", "0", "", 1, 2],
      ],
      scopes: [
        [0, 3, 0],
        [1, 3, 1],
      ],
      fork: true,
    },
    codeBefore: "let xs = [2, 4] in\ncase xs\n| h :: t => h\nend",
    codeAfter: "let xs = [2, 4] in\ncase xs\n| h :: t => h\n| [] => 0\nend",
  },
  {
    id: "carry",
    title: "Move with a dependency",
    source: "Big Book 93; Hazel HoistCarry",
    mouse:
      "Move total upward; at the dependency boundary, explicitly choose the larger preview carrying twice.",
    keyboard:
      "At a blocked upward move → Move with dependencies → review the selected group → Enter.",
    rule: "A larger move should not appear as a surprise. Here twice and total cross an independent bonus row; n stays in scope.",
    message:
      "The carried pair moves together. Their internal order and lexical dependencies stay intact.",
    before: {
      rows: [
        ["n", "n", "3", "3"],
        ["bonus", "bonus", "4", "4"],
        ["twice", "twice", "n * 2", "6"],
        ["total", "total", "twice + 1", "7"],
        ["result", "result", "total + bonus", "11"],
      ],
      scopes: [[0, 5, 0]],
    },
    after: {
      rows: [
        ["n", "n", "3", "3"],
        ["twice", "twice", "n * 2", "6"],
        ["total", "total", "twice + 1", "7"],
        ["bonus", "bonus", "4", "4"],
        ["result", "result", "total + bonus", "11"],
      ],
      scopes: [[0, 5, 0]],
    },
    codeBefore:
      "let n = 3 in\nlet bonus = 4 in\nlet twice = n * 2 in\nlet total = twice + 1 in\ntotal + bonus",
    codeAfter:
      "let n = 3 in\nlet twice = n * 2 in\nlet total = twice + 1 in\nlet bonus = 4 in\ntotal + bonus",
  },
  {
    id: "helper",
    title: "Cross the ceiling as a helper",
    source: "Big Book 93, 95–96; Hazel LiftFunction",
    mouse:
      "Pull y and its dependency scale above the function ceiling; accept the helper preview rather than breaking x’s scope.",
    keyboard:
      "Select y → Extract helper → review x as a parameter and the rewritten use → Enter.",
    rule: "Carry scale into the helper, abstract over x, and replace y’s definition with a call. This concrete case is total; arbitrary helper extraction has more capture and evaluation constraints.",
    message:
      "x becomes the helper parameter; the local dependency travels inside the helper.",
    before: {
      rows: [
        ["param", "x", "·", "5"],
        ["scale", "scale", "2", "2"],
        ["y", "y", "x * scale", "10"],
        ["calc", "calc", "y + 1", "〈fun〉"],
        ["result", "result", "calc(5)", "11"],
      ],
      scopes: [
        [0, 5, 0],
        [0, 4, 1, 1],
      ],
    },
    after: {
      rows: [
        ["hparam", "x", "·", "5"],
        ["scale", "scale", "2", "2"],
        ["helper", "helper", "x * scale", "〈fun〉"],
        ["param", "x", "·", "5"],
        ["y", "y", "helper(x)", "10"],
        ["calc", "calc", "y + 1", "〈fun〉"],
        ["result", "result", "calc(5)", "11"],
      ],
      scopes: [
        [0, 7, 0],
        [0, 3, 1, 1],
        [3, 6, 1, 4],
      ],
    },
    codeBefore:
      "let calc = fun x ->\n  let scale = 2 in\n  let y = x * scale in\n  y + 1\nin calc(5)",
    codeAfter:
      "let helper = fun x ->\n  let scale = 2 in x * scale\nin\nlet calc = fun x ->\n  let y = helper(x) in y + 1\nin calc(5)",
  },
  {
    id: "unabstract",
    title: "Un-abstract a single-use function",
    source: "Big Book 48, 92; Hazel staged substitution",
    mouse:
      "Pull the argument into the parameter opening, preview the consumed call, then apply explicitly.",
    keyboard:
      "At the call → Bind argument / un-abstract → inspect the whole source change → Enter.",
    rule: "Here f has exactly one use and the argument is a total literal. Do not globally specialize a reusable function from one live sample; offer a separate inspection-only view for that.",
    message:
      "The parameter becomes a local definition. The sole call disappears; the result stays 7.",
    before: {
      rows: [
        ["x", "x", "·", "3"],
        ["delta", "delta", "4", "4"],
        ["f", "f", "x + delta", "〈fun〉"],
        ["result", "result", "f(3)", "7"],
      ],
      scopes: [
        [0, 4, 0],
        [0, 3, 1, 1],
      ],
    },
    after: {
      rows: [
        ["x", "x", "3", "3"],
        ["delta", "delta", "4", "4"],
        ["f", "f", "x + delta", "7"],
        ["result", "result", "f", "7"],
      ],
      scopes: [
        [0, 4, 0],
        [0, 3, 1],
      ],
    },
    codeBefore: "let f = fun x ->\n  let delta = 4 in x + delta\nin f(3)",
    codeAfter: "let f =\n  let x = 3 in\n  let delta = 4 in x + delta\nin f",
  },
];
