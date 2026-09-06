# Furl design sheets

`offside.html` / `offside.js`: a standalone syntax-tree rail sketch. Move/Copy,
ordered parking, nested hole/term drops, scroll/collapse and Undo. Cards are inert;
no Hazel evaluator, typechecking or arbitrary text editor. Earlier shelf/patch
arrangements remain in Git history.

`appearance.html` / `appearance.js`: deferred emoji aliases with circle swatches,
usage comparisons (simple scheme chosen), theme preview and top-level notes.

Run `python3 furl/studies/build.py` after reference and interaction builders, then
`--check`. It embeds the pixel font/license and generates root/local copies.
`node furl/studies/test.cjs` verifies the standalone interaction contracts.
