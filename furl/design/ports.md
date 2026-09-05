# Hazel / Furl port ledger

Snapshot recorded 2026-09-05. This is a manual record, not an automated sync plan. Imported means present in the Furl ancestry; inspected means read for planning only. No new upstream PR was created for this study.

| Work | Source | Furl status | Return / next step |
| --- | --- | --- | --- |
| Modular editor foundation | `hazelgrove/hazel` `modular-editors` at `97cbeb3489b66415dc8b7a67b46a556fa1f7abad` | Imported as Furl's starting base | Forward-port relevant modular editor improvements after reviewing local `390ffb9…` separately from the remote base. |
| Refactoring foundation | `hazelgrove/hazel` `refactorings` at `7dbd77039d7caccc2d077ce922a8beece97167d6` | Inspected, not imported | Trial integration in an isolated branch; review its newer dev/completion work and overlaps with Furl's shared editor changes. |
| Render-width check in structural value abbreviation | Furl `c25fb9213` | Implemented, including shared `ProbeUtil` changes | Candidate backport: extract the reusable helper/tests into a focused Hazel commit; omit Furl grid/view policy. |
| Mounted-menu listener lifecycle and disabled-item keyboard indexing | Furl `074470148` | Implemented in shared menu paths plus Furl-specific popover | Candidate backport: native menu lifecycle/indexing fixes and regression checks; keep Furl theme/anchor policy separate. |

For future imports, record the source branch and exact SHA, integration commit, validation, and follow-up fixes. For returns, record the source Furl commit, target Hazel branch, resulting PR and merge SHA. Use `cherry-pick -x` for focused ports when applicable. Reconcile already-equivalent changes on forward merges instead of duplicating them. Do not rebase public integration history.
