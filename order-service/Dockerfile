# syntax=docker/dockerfile:1

# ---- Build: compile and extract the layered Spring Boot jar -------------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY foc-common/pom.xml foc-common/pom.xml
COPY order-service/pom.xml order-service/pom.xml
# Need user-service because of its dependency on foc-common
COPY user-service/pom.xml user-service/pom.xml
RUN chmod +x mvnw

COPY foc-common/src/ foc-common/src/
COPY order-service/src/ order-service/src/
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -ntp -q -pl order-service -am package -DskipTests \
 && cp order-service/target/order-service-0.0.1-SNAPSHOT.jar app.jar \
 && java -Djarmode=tools -jar app.jar extract --layers --launcher --destination extracted

# ---- Runtime: JRE only, non-root ---------------------------------------
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 --no-create-home spring
USER spring

COPY --from=build /workspace/extracted/dependencies/ ./
COPY --from=build /workspace/extracted/spring-boot-loader/ ./
COPY --from=build /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build /workspace/extracted/application/ ./

ENV PORT=8080 \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=10 \
 CMD wget -qO- "http://127.0.0.1:${PORT}/actuator/health/readiness" >/dev/null || exit 1
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
