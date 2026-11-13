---
name: foc-ui-iteration
description: Implement the interactive part of an approved FoC feature using the owning frontend conventions.
---

# FoC UI Iteration

Use for approved interactive changes. Follow applicable frontend instructions from the
[root reading path](../../../AGENTS.md), including Supplier's nested guidance when applicable.
Read and apply the shared [product design contract](../../../design.md) before editing. If an
approved change materially alters a shared UI decision, update the contract, every affected
implementation and its regression coverage together.

Inspect affected screens/components and approved designs/contracts. If a new frontend has no
conventions, first establish design source, route ownership, client strategy and test commands in
the feature brief; do not assume another service's conventions apply.

Implement the flow and prepare manual checks for mobile/desktop, keyboard/focus,
validation/error feedback and affected routes. Return the result to review/verification;
the user decides manual acceptance.

For shared-shell work, compare all service routes and run
`python3 .github/scripts/test_ui_design_contract.py` in addition to owning frontend checks. Do not
infer permission to cross service boundaries from visual consistency alone; the shared editor and
affected owners must already be identified.
