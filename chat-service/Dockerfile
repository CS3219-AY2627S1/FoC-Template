FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /workspace
COPY pom.xml ./
RUN mvn --batch-mode --no-transfer-progress dependency:go-offline
COPY src ./src
RUN mvn --batch-mode --no-transfer-progress clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 spring \
    && useradd --system --uid 10001 --gid 10001 --no-create-home spring
COPY --from=builder --chown=10001:10001 /workspace/target/chat-service-*.jar app.jar
USER 10001:10001
EXPOSE 8085
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
  CMD curl --fail --silent http://localhost:8085/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
