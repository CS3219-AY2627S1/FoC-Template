# syntax=docker/dockerfile:1

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
# Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# ---- Build: compile and package the Spring Boot jar ----------------------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

# Resolve dependencies first so they are cached until pom.xml changes
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

# Tests are skipped here: the Testcontainers suites need a Docker daemon, so run them in CI instead
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests \
    && cp target/*.jar app.jar

# ---- Runtime: slim JRE, non-root -----------------------------------------
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Fixed uid so mounted files (e.g. the JWT keys) can be made readable to it
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app

COPY --from=build --chown=app:app /workspace/app.jar app.jar

USER app
EXPOSE 8080

# All configuration (datasource, JWT key locations, BOOTSTRAP_ADMIN_*) is supplied at runtime
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
