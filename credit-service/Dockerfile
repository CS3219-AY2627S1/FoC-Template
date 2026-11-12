# syntax=docker/dockerfile:1

FROM maven:3.9.11-eclipse-temurin-17-alpine AS build

WORKDIR /workspace

COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline


COPY src ./src
RUN mvn package -B -DskipTests \
    && cp target/*.jar /workspace/app.jar

FROM build AS contract-tests
RUN mvn -B -Dtest=ReservationContractTests test

FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

RUN addgroup -S app \
    && adduser -S app -G app

COPY --from=build --chown=app:app /workspace/app.jar ./app.jar

USER app:app

EXPOSE 8080

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]












