# ADR-057 — Ready Admin APIs and local-only Reports

Accepted: Yao Xiang, 2026-10-28, branch order-service/admin-ui-linking. CHANGE-160.

CHANGE-160 / ADR-057 (Yao Xiang, 2026-10-28): all non-Report Admin sections use ready provider APIs in base Compose, HTTP-peer Compose, staging and production. Generic /api/orders/admin-mock routes and frontend transport are removed. User search retains the category dropdown with ID only, adapting existing admin profile lookup into a single-result page; blank/clear makes no peer call and name search remains pending. Reports alone retain /api/orders/admin-mock/reports with independent ORDER_REPORT_DEMO_ENABLED / FOC_REPORT_API_MODE settings gated by local environment plus Auth emulator; cloud Reports remain Coming soon. Report-only fixture store/mapper replace generic Admin mock CRUD. No schema, score, Order lifecycle, provider authorization or sibling backend changes. Feedback now contains only pending work; historical records are archived in the same docs folder.

The previous base-Compose generic Admin mock option (ADR-039/CHANGE-119/122) is superseded for Orders, Users, Suppliers and Credit. Preserving a single shared mock switch would bypass real role checks locally and hide missing provider behavior. Independent Report gating retains that unfinished UI prototype without generic provider fallbacks. A real locally registered admin account is required in both Compose modes. Source/API tests do not prove cloud deployment readiness.

No new User search route is invented or called: the missing paginated/name contract remains a request. Only404 becomes an empty exact-ID result;401/403/5xx remain visible. Existing profile Credit loading stays independent. No data migration, cloud mutation or new dependency.
