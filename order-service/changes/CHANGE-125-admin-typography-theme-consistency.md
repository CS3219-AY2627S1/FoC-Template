# CHANGE-125: Shared Admin typography and theme consistency

- Date/developer: 2026-10-13, Yao Xiang, order-service/admin-dashboard.
- User asks for consistent overall font family/size/colour. Workflow/identity/
  branch/context reloaded; source fingerprints unchanged; preserve119..124 work.
- Scope Admin UI against shared visual baseline: Geist Sans, regular14px primary
  values/table data,24px page headings,20px section headings and12px muted metadata.
  Use shared foreground/card/muted/destructive tokens and existing Supplier/Credit
  semantic state colours; do not introduce fonts, palettes or flatten hierarchy.
- Central Admin layout establishes body font/size/colour plus table value/linked
  control regular weight, shared badge typography and scoped sans14px technical
  values. Existing normal-profile shared history component remains untouched;
  its Admin presentation adapts smaller monospace IDs to the Admin value baseline.
- Copy IDs and Order record links use explicit regular weight. Unavailable balance
  values use muted14px helper text; actual balances retain existing metric styling.
- Embedded Leaflet container uses the same sans/body size; popup surfaces/text
  reuse card/foreground tokens, including dark theme. Map imagery, attribution,
  zoom icons, provider requests, pins and interactions remain unchanged.
- Preserve provider/authorization/query/data/copy/map interactions. No backend,
  API/model/deployment/workflow/diagram changes. Presentation-only refinement,
  no new implementation-mirroring CSS tests; verify full existing frontend suite,
  typecheck/lint/build. Authenticated visual/theme checks remain pending.

## Verification result

- Existing full frontend suite:203 tests/39 files pass, no skips. TypeScript and
  final production build pass. Full lint passes with0 errors/3 pre-existing login
  warnings; final layout scoped lint also passes. git diff --check passes.
- Existing tests cover normal/Admin navigation, provider modes, role denial,
  copy/details, shared history state colours and map interactions; no new tests
  added for reversible CSS details. Source inspection confirms shared Geist/theme
  tokens, scoped overrides and unchanged normal-profile presenter source.
- Backend/Maven not rerun for unchanged backend. No new fonts/dependencies,
  API/models/configuration changes, container recreation or deployment. UI style
  baseline/docs/context/AI records updated; workflow/skills/diagrams unchanged.
- Actual authenticated mobile/desktop/light/dark visual confirmation remains
  pending; unit/source/build checks do not prove rendered colour contrast/layout.
