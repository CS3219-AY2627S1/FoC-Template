# CHANGE-114: Admin supplier maps and readable detail groups

- Date/developer: 2026-10-12, Yao Xiang, order-service/admin-dashboard.
- Authority: user's detailed map/search/dragging, card-action removal, related
  name navigation, separate User columns and grouped Order detail requirements.
  Existing ADR-039 mock scope, NTH1 support, NFR2.1/NFR3/NFR4 retained.
- Workflow: mandatory context/instructions/spec skill/frontend baseline loaded;
  identity/branch agree; source PDF fingerprints unchanged. Existing work kept.
- Approved feature-level design: Leaflet1.9.4 client-only rendering, attributed
  OSM HTTPS tiles, pins/popups linking existing Google Maps URLs. Overview shows
  only the current filtered supplier page; details show the selected supplier.
  Optional map UI in SupplierForm is enabled only for Admin mock creation.
- Photon public geocoder adapter: debounced >=3-character queries, bounded
  results, Singapore location bias, abort/timeout and no auth/cookies. Public
  mapping reads are the requested map-integration exception to service gateway
  calls; all administrative reads/writes remain useApi -> gateway -> mocks.
  No token/account data is sent to Photon. Tile/geocoder providers are isolated
  behind one map-provider module for replacement; no secret or GCP setup.
- Address result controls a pin and coordinate fields; dragging/click placement
  updates coordinates; manual edits update the pin. Selected address is a visible
  reference, not an exact reverse-geocoded claim after dragging. Existing input
  validation/payload stays; an empty locationDescription may be prefilled with
  the address within its existing200-character limit. No new persisted field.
- Remove supplier-card deactivation; only detail actions can deactivate, with
  existing confirmation/error/inactive guards. Cards/search/pagination retained.
- Order detail cards: Order information, People, Locations, Status/timing,
  Repost information (always separate), other returned fields if any. Preserve
  every returned field, boolean/UTC formatting and copy IDs. Related names use
  Admin routes; separate ID copy controls. User table separates name/email/UID/
  roles/account/courier/available/reserved/total values into their own columns.
- Peer/backend review: existing Supplier coordinates/locationDescription and
  existing sample create/detail/list suffice. No backend source or endpoint
  required. Provider boundaries/limits go in admin-peer-api-request.md.
- Primary references: leafletjs.com/download.html, Leaflet v1.9.4 Marker source,
  github.com/komoot/photon and operations.osmfoundation.org/policies/tiles/.
  Public Photon allows reasonable requests without availability guarantees;
  public OSM requires visible attribution/default cache/referrer/no bulk fetch.
- TDD evidence: three new Admin regression assertions failed before implementation
  (map/card action, combined User fields, grouped/linkable Order details). Green
  after implementation; existing deactivation tests moved to the detailed view.
- Verification:173 frontend tests/36 files pass; final28 Admin regressions pass
  after the JSX-key lint fix. Tests include GeoJSON coordinate order/ranges,
  anonymous request contract, failed provider response, debounce/old-reply abort,
  keyboard selection, form selection/drag/manual synchronization and validation,
  actual Leaflet marker dragging/popup URL/unmount cleanup (synthetic events),
  grouped repost/unknown-field preservation, related-name navigation, card-action
  removal and retained detail confirmation/errors. TypeScript and production
  frontend Docker build pass. Lint0errors/3 pre-existing login warnings.
- External smoke: generic NUS Photon query returned coordinates/label; public
  browser CORS header permits the request. One identified campus OSM tile returned
  200 image/png. This does not establish provider SLA or browser end-to-end success.
- Runtime: only frontend rebuilt/recreated; healthy. Admin supplier list/detail
  and Order detail pages serve200 through gateway. Order container unchanged and
  healthy; no peer rebuild or volume removal. Patch whitespace check passes.
- Backend tests not rerun because backend source/contracts remain unchanged.
  Browser tool inventory has no browsers/apps, so authenticated responsive visual
  confirmation is unavailable. Real administrative peer integration remains pending.
- Affected artifacts: approved UI requirements, frontend map integration/design,
  diagrams/transient map types, source/dependencies/tests, documentation/indexes
  and AI disclosure changed. Backend contracts/models, workflow/skills and
  deployment/persistence/infrastructure configuration unchanged. No Git commit/push.
- Actual provider/SLA and authenticated responsive visual tests are distinct
  from stub/unit evidence. No schema, event, auth or infrastructure mutation.
