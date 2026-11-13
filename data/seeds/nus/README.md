# Additional NUS supplier dataset

Run the collector from `supplier-service`, using `--dataset ../data/seeds/nus`.
See [collector instructions](../../../supplier-service/tools/nus_collector/README.md).

No suppliers are approved or imported automatically. This directory starts empty
of generated seed data; create a reviewed bundle before running `supplier-seed-nus`.
The original CSV and its manifest remain independent.

`collection.json`, `review.csv`, `associations.json` (when needed), and
`identities.json` hold the collection/review history. Keep identities permanently.
`exports/<version>/` contains immutable CSV/JSON bundles; `bundle` is a relative
symlink to the selected version. Keep the symlink and its target together when
sharing or mounting this directory. Raw snapshots and the generated HTML report
are local artifacts ignored by Git; retain snapshots separately for auditing.

Commit reviewed files and export versions deliberately after inspecting their
contents. There are no API tokens or other credentials in this workflow.

`review.csv` now includes optional `ImageKey` filenames. The six inherited image
references retain their legacy URLs as provenance; suppliers without known
images remain blank. Older review files and archived seed bundles without
`ImageKey` remain supported. Newly exported bundles include it. See
[supplier image setup](../../images/README.md) for validation and local/CloudFront
configuration. Export still requires resolving existing review validation issues;
image support does not change decisions or supplier identities.
