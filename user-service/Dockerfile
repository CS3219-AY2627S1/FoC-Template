FROM node:22-alpine AS frontend-builder

WORKDIR /workspace/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /workspace

COPY pom.xml ./
RUN mvn --batch-mode --no-transfer-progress dependency:go-offline

COPY src ./src
COPY --from=frontend-builder /workspace/frontend/dist ./frontend/dist
RUN mvn --batch-mode --no-transfer-progress clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system spring && useradd --system --gid spring --no-create-home spring

COPY --from=builder --chown=spring:spring /workspace/target/user-service-*.jar app.jar

USER spring:spring

EXPOSE 8081

HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=5 \
    CMD curl --fail --silent --output /dev/null http://127.0.0.1:8081/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
