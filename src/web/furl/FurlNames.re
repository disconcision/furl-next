/* Old Furl's names, followed by Hazel refactorings' PlaceholderNames pool
   (7dbd77039d). Freshness includes unresolved uses so a generated binding
   cannot accidentally give an existing free name a new meaning. */
let pool = [
  "bro",
  "greeze",
  "cloun",
  "foob",
  "pruby",
  "bez",
  "klork",
  "crunk",
  "dree",
  "bap",
  "gurb",
  "weeb",
  "shrork",
  "foo",
  "bar",
  "baz",
  "qux",
  "garg",
  "yorp",
  "blorg",
  "blog",
  "zug",
  "wug",
  "gorp",
  "blip",
  "bloop",
  "fnord",
  "moop",
  "zonk",
  "zoob",
  "gleep",
  "blort",
  "thud",
  "gronk",
  "skree",
  "norf",
  "plugh",
  "mimsy",
  "tove",
  "wabe",
  "narf",
  "poit",
  "zort",
  "meep",
  "glorp",
  "floof",
  "borp",
  "dorf",
  "treeb",
];
let fresh = (~base="", used) => {
  let rec numbered = n => {
    let name = (base == "" ? "bro" : base) ++ string_of_int(n);
    List.mem(name, used) ? numbered(n + 1) : name;
  };
  base != ""
    ? numbered(2)
    : (
      switch (List.find_opt(n => !List.mem(n, used), pool)) {
      | Some(name) => name
      | None => numbered(2)
      }
    );
};
