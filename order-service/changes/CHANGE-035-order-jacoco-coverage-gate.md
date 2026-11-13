# CHANGE-035 — Order Service JaCoCo coverage gate

- Date: 2026-09-30
- Status: Configured; initial threshold failure resolved by CHANGE-036
- Scope: Order Service Maven verification
- Approved by: Project workflow requirement NFR3.1.1

## Change

Added \`jacoco-maven-plugin\` 0.8.15 to \`order-service/pom.xml\`. The build now:

- instruments tests during the Maven test phase;
- writes an HTML/XML report during \`verify\`;
- excludes only the Spring Boot application bootstrap class; and
- enforces at least 80% line and 80% branch coverage.

## Verification

\`./mvnw verify\` under Java 21 executed all 12 Order Service tests successfully,
then failed the JaCoCo check because the current test suite covers:

- 128/318 lines: 40.25%;
- 60/209 branches: 28.71%.

The threshold was not lowered. CHANGE-036 added the required unit, controller,
integration-style, and contract tests; the current Order verification gate
passes at 89.29% lines and 83.25% branches.

## Remaining work

The generated report remains available at
\`order-service/target/site/jacoco/index.html\`. Keep the 80% line/branch
threshold in force for future changes and rerun \`./mvnw verify\` after
meaningful Order Service modifications.
