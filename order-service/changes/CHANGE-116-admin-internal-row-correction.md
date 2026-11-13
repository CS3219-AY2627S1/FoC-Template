# CHANGE-116: Correct the internal Admin Order field arrangement

- Date/developer: 2026-10-12, Yao Xiang, order-service/admin-dashboard.
- Authority: user corrects CHANGE-115: revert Order detail layout changes and only
  swap Version with Item Description inside Order Information; requester stays
  above courier inside People. Same prototype/workflow scope and unchanged PDFs.
- Restore CHANGE-114 card widths and ordinary two-column fields. Order Information
  order is ID, attempt ID, version, offered credits, item description; Version
  takes description's prior cell and description takes the prior last Version cell.
- Remove unused three-column/wide-span options from shared AdminDetails. Preserve
  the explicit People field ordering, returned facts, links/copy buttons and all
  supplier changes (no overview map; status beside Location details).
- Only frontend layout, its existing regression expectations and Order records
  change. No backend/API/model/dependency/provider/configuration change.
- Verification: existing regression failed before correction; all175 frontend
  tests/36 files pass afterward. TypeScript and production frontend Docker build
  pass; lint0errors/3 pre-existing login warnings. Only frontend recreated/healthy;
  Order detail route200, Order container unchanged/healthy. Patch check passes.
- Authenticated visual review remains pending; no connected browser. Backend
  tests not rerun for unchanged backend/contracts. No volume removal or Git history
  change. UI/design records, source/regression/docs/AI disclosure updated;
  APIs/models/diagrams/workflows/infrastructure unchanged.
