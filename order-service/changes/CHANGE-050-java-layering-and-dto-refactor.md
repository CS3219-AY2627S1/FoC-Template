# CHANGE-050: Java layering, DTO, and readability refactor

- Date: 2026-10-01
- Developer: Yao Xiang
- Status: Implemented; full Order Service test suite and JaCoCo coverage verified in CHANGE-054
- Change type: Design refinement
- Scope: Order Service Java source and directly affected tests

## Approved direction

The developer explicitly required conventional Java spacing, explicit local types instead of `var`, traditional request and response DTO classes, Lombok-generated boilerplate, and separation between application orchestration and database-specific repository operations.

## Implementation

- Replaced the nested record-based `OrderDtos` container with named request and response DTO classes under `api/dto/request/` and `api/dto/response/`.
- Added domain repository interfaces for orders, checkpoints, and command receipts.
- Added infrastructure persistence adapters and isolated Spring Data JPA interfaces and derived query methods in `infrastructure/`.
- Replaced application-layer Spring Data query calls with use-case-oriented repository operations.
- Replaced `var` with explicit types.
- Applied Lombok-generated constructors and accessors where appropriate.
- Replaced response DTO `from(...)` factory methods with a Spring-managed MapStruct `OrderMapper` containing explicit `@Mapping` declarations for single-order and paginated responses.
- Preserved domain behavior methods and prevented public setters from bypassing aggregate lifecycle rules.
- Expanded compressed imports, fields, methods, branches, and statements into conventional Java formatting.

## Compatibility and architecture

- Public HTTP paths, JSON field names, validation constraints, lifecycle behavior, peer contracts, persistence schema, and database ownership are unchanged.
- No Flyway migration is required.
- The approved application-to-domain-repository-to-infrastructure direction is clearer and now enforced by package dependencies.
- Existing tests were updated to compile against the named DTOs and repository abstractions. The complete Order Service suite passed in CHANGE-054 verification.
- MapStruct 1.6.3 and its annotation processor generate type-safe response mapping code during compilation. `lombok-mapstruct-binding` preserves Lombok/MapStruct processor interoperability.

## Affected artifacts

- `src/main/java/sg/edu/nus/foc/order/api/`
- `src/main/java/sg/edu/nus/foc/order/application/`
- `src/main/java/sg/edu/nus/foc/order/domain/`
- `src/main/java/sg/edu/nus/foc/order/domain/repository/`
- `src/main/java/sg/edu/nus/foc/order/infrastructure/`
- Directly affected Order Service tests
- `AGENTS.md`, architecture evolution, change log, active work, and AI disclosure

## Verification

Static inspection confirmed that Order Service application and API packages contain no `var`, nested records, direct Spring Data imports, or derived `findBy...` calls. Java 21 production and test-source compilation passed. The full `mvn verify` recorded in CHANGE-054 passed all 57 tests and the configured JaCoCo coverage gates.
