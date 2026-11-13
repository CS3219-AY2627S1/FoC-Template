# User Service

## User-created events

Registration publishes `UserCreatedEvent` within the user transaction. Spring Modulith's JDBC publication registry records it in `event_publication` in that same transaction. After commit, `SnsUserCreatedEventPublisher` sends it with `SnsOperations` to the user SNS topic. A failed publish stays in the registry and is retried.

`EventPublicationRecoveryJob` retries failed publications through the common registry API every 30 seconds. Framework staleness checks also recover publications interrupted by a service restart. The publisher keeps the same event ID on retry.

User owns publication. Credit owns account creation and consumes `UserCreatedEvent` from its SQS queue. Local SNS and SQS are provided by Floci on port 4566 (`docker compose up -d`).

There is no existing-user backfill. New registrations produce events. Initial admin provisioning publishes the same `UserCreatedEvent` when it creates the admin. Re-running provisioning leaves an existing admin unchanged and does not publish another event. Users inserted directly through SQL do not produce events. For a test administrator created that way that needs credits, register the user normally before assigning the admin role.

## Local admin setup

Set `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_NAME`, and `INITIAL_ADMIN_PASSWORD` in
your local `.env` using [`.env.example`](../.env.example). The email must use
`u.nus.edu` or `nus.edu.sg`, and the password must have at least eight characters.
Generate JWT keys following [container setup](../docs/containers.md#setup), or
set `JWT_PRIVATE_KEY_FILE` and `JWT_PUBLIC_KEY_FILE` to existing PEM files.

From the repository root:

```bash
docker compose run --build --rm admin-init
```

This starts PostgreSQL and Floci, waits for them to become healthy, and runs the
User Service image with the `dev,admin-init` profiles. Flyway creates the user
schema, the application creates a verified admin and publishes `UserCreatedEvent`,
then the container exits. No application port is exposed. An existing admin is
preserved; an email belonging to a non-admin causes setup to fail.

The locally running User Service retries any outstanding event publications;
Credit Service creates the credit account when it consumes the event. Container
deployments have a separate [admin setup command](../docs/containers.md#first-deployment).

## Tests

Run `./gradlew :user-service:check` from the repository root with Docker running. Testcontainers starts PostgreSQL and Floci, and Spring Boot's service connection supplies the database, so runs need no database environment variables. Cross-service tests: [e2e-tests](../e2e-tests/README.md).
