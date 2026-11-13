# CHANGE-058: Restore Order Service startup with REST client auto-configuration

- Date: 2026-10-02
- Developer: Yao Xiang, Developer 1
- Status: IMPLEMENTED; `mvn verify` PASSED (87 tests; JaCoCo line and branch gates passed)
- Trigger: Order Service startup failed because `SecurityConfiguration.roleProvider` required a `RestClient.Builder` bean that was not present.

## Root cause and change

The project uses Spring Boot 4.1.1 and injects `RestClient.Builder` for HTTP-mode User Service role lookup. The dependency list included `spring-boot-starter-webmvc`, which provides the inbound MVC stack, but omitted `spring-boot-starter-restclient`, which supplies Spring Boot's REST client auto-configuration. As a result, Spring could not satisfy the role-provider method parameter while creating the application context.

Added `spring-boot-starter-restclient` and a focused test that loads `RestClientAutoConfiguration` and verifies a `RestClient.Builder` bean is created. This is a runtime dependency/configuration correction; no API or business behavior changed.

## Verification

- `RestClientBuilderAutoConfigurationTest`: passed.
- Existing `AdminOrderControllerSecurityTest` started the Spring test context with `SecurityConfiguration` active.
- Full `mvn verify`: 87 tests, zero failures/errors/skips; JaCoCo line and branch gates passed.
- Docker image rebuild and live container startup were not run in this task.

## Affected scope

Only the Order Service Maven dependencies, one regression test, and Order Service change/workflow records changed. No frontend, peer-service, database, or persistence files were changed.
