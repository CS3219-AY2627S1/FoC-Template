# CHANGE-021: Spring Boot Flyway Runtime Fix

## Status

Completed for the local Order Service container path.

## Observed failure

The Order Service image built, but a clean local PostgreSQL container failed at
startup because Hibernate validation could not find `command_receipts`. The
packaged migration was present, but Flyway had not run.

## Root cause

Spring Boot 4.1.1 exposes Flyway auto-configuration through the separate
`spring-boot-flyway` module. The application already declared Flyway core and
the PostgreSQL database support, but not this Boot auto-configuration module.

## Change

Added `org.springframework.boot:spring-boot-flyway` to
`order-service/pom.xml`. No sibling service source, shared Compose peer block,
or external infrastructure file was changed.

## Verification

- Order image rebuilt successfully.
- A clean local PostgreSQL volume started with the Order Service and Firebase
  emulator.
- Readiness returned `{"status":"UP"}`.
- Order OpenAPI was served at `/api/orders/v3/api-docs`.
- Flyway created `flyway_schema_history`, `orders`, `order_checkpoints`, and
  `command_receipts`; migration version 1 completed successfully.
- Docker Maven test run passed: 5 tests run, 0 failures, 0 errors, 0 skipped.

## Remaining scope

This fix verifies the Order local persistence path only. It does not resolve
peer-service MongoDB configuration, the empty Admin Service Dockerfile,
frontend role/mode decisions, cross-service contract tests, or Cloud Run
deployment.
