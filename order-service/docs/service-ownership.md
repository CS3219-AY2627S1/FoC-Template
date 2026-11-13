# Service Ownership

| Service | Owns | Order Service constraint |
|---|---|---|
| User Service | Accounts, authentication, roles, courier eligibility, penalty score/policy, suspension | Verify through contracts; publish facts only; never calculate penalties or modify User data |
| Supplier Service | Suppliers, activation, campus pickup/delivery locations, catalogue details | Store IDs only; validate and resolve current details through contracts |
| Order Service | Creation, lifecycle/status, assignment, transitions, checkpoints/history, supplier references, repost links, order flags, outcome facts | Sole writer of Order data |
| Credit Service | Balances, reservations, releases, transfers, settlement, deductions, credit policy | Request reservation/outcome processing; never calculate settlement or modify Credit data |
| Admin Service | Monitoring, reports/cases, decisions, user and supplier/catalogue administration | Expose explicit facts/actions; Admin must not write Order data directly |

## Nice-to-have ownership

- NTH1 Administrator Dashboard: Admin Service.
- NTH2 Penalty System: User Service.
- NTH3 Report System: Admin Service.
- NTH4 Errand Reposting: Order Service.
- NTH5 CI/CD and cloud deployment: platform/deployment process.

## Frontend responsibility boundary

- The shared top-level Next.js application owns presentation and client-side workflow coordination for `ADMIN` and `USER` Requester/Courier experiences.
- Frontend authentication, permission, and mode checks are not authoritative. User Service and each called backend enforce identity, roles/authorities, and protected operations.
- Order Service owns Order business rules and data even when a responsive UI exposes them. Do not move microservice business logic into Next.js.

No service may directly write another service's database.
