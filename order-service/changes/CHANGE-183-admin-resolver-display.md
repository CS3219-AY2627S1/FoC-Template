# CHANGE-183 - Admin resolver identity in report details

2026-11-09. Owner: Yao Xiang, `hfix/report-ui-fixing`.

User-approved Admin Reports presentation: show Resolution fields in the same account-first order as participant sections: Admin name, Admin ID, Admin reply, Resolved time. Reuse SummaryFields, Participant profile links and CopyId. Resolve the saved resolvedBy through the existing authenticated User record-name API; never substitute the currently signed-in administrator. General reports without an associated Order also resolve the admin name. Extend useOrderDisplayNames with optional extra account IDs; existing callers and deleted/unavailable/abort handling remain intact. Historical missing resolver IDs show Not available. Names remain display enrichment and are not persisted with the Report.

Files: frontend/src/components/reports/reports-page.tsx and its test; frontend/src/hooks/use-order-display-names.ts and its test. Admin mode only; no normal-user Report UI, backend, API contract, model, schema, saga, authorization, dependency, configuration, cloud or data changes.

Verification: two new regression tests failed before implementation (19 existing passed), then all21 focused tests passed. Tests establish lookup of the recorded resolver without an Order, name-to-profile navigation, full-ID copying and account field order. Full frontend ESLint and Next route generation plus TypeScript pass. Browser/container/staging were not exercised; human visual review remains pending. No commit/push.

| Project D1 reference | Requirement | Implementation | Test | Result |
| --- | --- | --- | --- | --- |
| Existing Admin Reports presentation; no new D1 capability | Identify the resolving admin consistently with participant accounts | ReportCase / useOrderDisplayNames | Reports resolver case and extra-account hook regression | Passed (21 focused tests) |

No new architecture decision: existing authenticated display enrichment and shared field styling reused. Existing resolution concurrency behavior was reviewed in the preceding advisory turn and is unchanged; this patch does not improve concurrent-conflict messaging.
