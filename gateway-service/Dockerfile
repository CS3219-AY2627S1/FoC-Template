FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /workspace

COPY pom.xml ./
RUN mvn --batch-mode --no-transfer-progress dependency:go-offline

COPY src ./src
RUN mvn --batch-mode --no-transfer-progress clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy AS runtime

WORKDIR /app

RUN groupadd --system spring && useradd --system --gid spring --no-create-home spring

COPY --from=builder --chown=spring:spring /workspace/target/gateway-service-*.jar app.jar

USER spring:spring

EXPOSE 8088

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
