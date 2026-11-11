---
name: Supplier Service Plan
overview: Implement the Friend on Campus supplier-service backend in Node/Express + Prisma, inside supplier-service only. Owns campus supplier listings, categories, admin moderation actions, and the public catalogue Order Service reads.
todos:
  - id: scaffold
    content: Scaffold Express app, Prisma/Postgres, Docker/compose, health, gateway header helpers
    status: completed
  - id: public-catalogue
    content: Public list/get approved suppliers with category filter and pagination for app and Order
    status: completed
  - id: user-submit
    content: Permitted-user create with lat/lng and HH:MM validation; pending status; createdBy + action log
    status: completed
  - id: admin-moderation
    content: Verified-admin edit, status transitions with rejection reason, delete, activity log
    status: completed
  - id: hardening
    content: Seed campus suppliers, tests for gateway rules, docs
    status: completed
isProject: false
---

# Supplier Service — requirements and implementation plan

Scope is only [`supplier-service/`](../supplier-service/), backend only. Do
not implement user, order, credit, admin, rating, badges, or UI code. Those
appear only as gateway headers this service trusts, or as HTTP callers
(Order / frontend) that read the catalogue.

## Already decided by author (Sahana Avantika)

- **Stack:** Node.js, Express, TypeScript, Prisma, PostgreSQL.
- **Public catalogue:** `GET /api/v1/supplier` and `GET /api/v1/supplier/{id}`
  need no gateway identity; approved-only for the list; used by Order to
  validate pickup locations.
- **Create:** permitted users (`x-permitted-action=true`) submit listings as
  `pending`; lat/lng bounds and `HH:MM` hours validated; categories via
  connectOrCreate; `createdByUserId` stored; `SupplierAction` `created` row.
- **Admin moderation:** verified admin (`x-is-admin` + permitted) can edit
  details, change status (`pending` / `approved` / `rejected`), delete, and
  read activity. Reject requires a trimmed reason (1–4000 chars) stored as
  `rejectionReason` and action `detail`. Approve/pending clears the reason.
- **Audit:** `SupplierAction` keeps create/edit/approve/reject/delete history
  (including after delete, with supplier name snapshot).
- **Auth mapping:** missing user id → 401; non-admin → 403; admin not
  permitted → 403 (different from Admin Service’s 404-not-403 pattern).
- **Seed:** campus supplier catalogue for local/dev use.

## What Cursor (Auto) may implement under that design

Routes, gateway helpers, Prisma schema/seed content, tests, Docker/compose,
config, and docs wording — without inventing new product requirements or
changing service boundaries.

Prisma **migration SQL files are not given in-file headers** (checksum /
deploy safety); see
[`supplier-service/prisma/migrations/AI_ASSISTANCE.md`](../supplier-service/prisma/migrations/AI_ASSISTANCE.md).
