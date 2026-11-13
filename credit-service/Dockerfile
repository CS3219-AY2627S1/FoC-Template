# syntax=docker/dockerfile:1
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-09-25
# Mode: Boilerplate generation.
# Scope: Generated container build boilerplate for the team-finalized Credit Service.
# Author review: I validated correctness.

# ---- Build: compile and extract the layered jar ------------------------------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

# Dependencies first, so they are cached until pom.xml changes.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -ntp -q dependency:go-offline

COPY src/ src/
# Tests run in CI (they need Docker for Testcontainers), not during the image build.
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -ntp -q package -DskipTests \
 && cp target/*.jar app.jar \
 && java -Djarmode=tools -jar app.jar extract --layers --launcher --destination extracted

# ---- Runtime: JRE only, non-root -------------------------------------------
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 --no-create-home spring
USER spring

# Least- to most-frequently changing layers for better image caching.
COPY --from=build /workspace/extracted/dependencies/ ./
COPY --from=build /workspace/extracted/spring-boot-loader/ ./
COPY --from=build /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build /workspace/extracted/application/ ./

ENV PORT=8080 \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
