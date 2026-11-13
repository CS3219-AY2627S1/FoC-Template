# ADR-056 - Report hold contract and admin provider links

Accepted independent scope: Yao Xiang on order-service/admin-ui-linking, 2026-10-28. CHANGE-159.

- Align requester active list/atomic hold route, body, scoped SQL lock and error contract with the supplied Reporting handoff.
- User explicitly chose current authoritative snapshots on retries; do not add V18 or freeze placement facts.
- Explicit admin No penalty overrides provisional stored scoring for cancellation; a selected addition uses the highest stored/selected policy. Keep provisional audit; record final outcome separately.
- Holds retain ordinary funding/penalty guards and allow courier delivery progression; admin cancellation remains the override.
- Link source-ready Credit balance and User profile/promotion/deactivation with provider authorization and independent Credit loading. Do not enable the missing directory or Report API.
- Synchronous Report resolution coordinator is deliberately deferred pending non-callback resolve/result/conditional fenced restore contracts. Existing direct hold release stays admin-protected; it does not resolve Report status.

No migration, sibling backend, shared configuration, topic or GCP changes. Details, proposed saga and known risks: [Reporting/Order integration](../reporting-order-integration.md). Existing durable Credit recovery remains unchanged.
