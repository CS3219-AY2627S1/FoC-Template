# Timestamp: 2026-11-08

# Key Prompt:

The Supplier backend implementation is complete. Using the existing implementation as the source of truth, help me draft tests for the author-defined Supplier CRUD, filtering, availability, selection-validation, and administrator-access behaviour. Do not change production code or add new requirements.

Specifically, draft tests for the following:

- No filters should produce no `WHERE` clause and no parameters.
- Status `all` should add no condition, `operational` should bind true, and `not-operational` should bind false.
- Service type filtering should use PostgreSQL array overlap and keep the selected service types as a bound array.
- An explicitly empty service type array should return `WHERE FALSE` with no parameters.
- Combined status and service type filters should use the correct parameter order.
- Test Supplier selection when the Supplier exists and no service type is provided.
- Test `SUPPLIER_NOT_FOUND`, inactive Supplier, and service type not offered.
- Test availability for normal operating hours, equal opening and closing times, overnight hours, and an operationally disabled Supplier.
- Use a fixed time so the test does not depend on when it is run.

# Key Prompt 2:

The Supplier filtering and service tests are complete. Now add tests for the author-defined administrator access behaviour.

- Verify that both `admin` and `super-admin` can create, update, and delete Suppliers without a User Service profile lookup.
- Inspect the Supplier router and verify that POST, PUT, and DELETE use the Cognito administrator middleware.
- Verify that an unverified user cannot read Suppliers and that the Supplier service method is not called.

TEST SETUP AND EXCLUSIONS

- Use the existing Vitest and Node assertion conventions.
- Mock the controller service or repository only where needed.
- Do not start PostgreSQL, call the Errand Service, add new roles or filters, or modify production code to make the tests pass.

# Usage Scenario:

Generated and debugged tests for the author-defined Supplier filtering, availability, selection validation, CRUD service behaviour, and administrator access after implementation was complete.
