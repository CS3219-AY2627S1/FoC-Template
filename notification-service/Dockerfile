# syntax=docker/dockerfile:1
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-11-08
# Scope: Updated container configuration for chat notification integration.

FROM maven:3.9.11-eclipse-temurin-17-alpine AS build

WORKDIR /workspace

COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests \
    && cp target/*.jar /workspace/app.jar

FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app

COPY --from=build --chown=app:app /workspace/app.jar app.jar

USER app:app

EXPOSE 8080

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
