package com.cs3219.foc.user.integration;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.BindMode;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.output.Slf4jLogConsumer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.regions.providers.AwsRegionProvider;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sqs.SqsClient;

@ActiveProfiles("test")
@Import(AbstractIntegrationTest.Containers.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class AbstractIntegrationTest {
    @TestConfiguration(proxyBeanMethods = false)
    public static class Containers {
        @Bean
        @ServiceConnection
        PostgreSQLContainer postgres() {
            return new PostgreSQLContainer("postgres:18-alpine");
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    public static class Aws {
        @Bean
        GenericContainer<?> floci() {
            return new GenericContainer<>(DockerImageName.parse("floci/floci:2.3.0-compat"))
                    .withExposedPorts(4566)
                    .withEnv("AWS_REGION", "ap-southeast-1")
                    .withEnv("FOC_NAME_PREFIX", "foc-test")
                    .withEnv("FOC_USER_BUCKET", "foc-user-integration")
                    .withEnv("FOC_SUPPLIER_BUCKET", "foc-supplier-integration")
                    .withEnv("FLOCI_SERVICES_S3_ENFORCE_AUTH", "true")
                    .withEnv("FLOCI_INIT_HOOKS_TIMEOUT_SECONDS", "180")
                    .withLogConsumer(new Slf4jLogConsumer(LoggerFactory.getLogger("foc.test.floci")))
                    .withFileSystemBind(
                            Path.of(System.getProperty("foc.root"), "infra/docker/floci/init-resources.sh")
                                    .toString(),
                            "/etc/localstack/init/ready.d/10-foc-resources.sh",
                            BindMode.READ_ONLY)
                    .waitingFor(Wait.forSuccessfulCommand("test -f /tmp/foc-resources-ready"))
                    .withStartupTimeout(Duration.ofMinutes(4));
        }

        @Bean
        DynamicPropertyRegistrar awsProperties(GenericContainer<?> floci) {
            return registry -> {
                var endpoint = "http://" + floci.getHost() + ":" + floci.getMappedPort(4566);
                registry.add("spring.cloud.aws.s3.endpoint", () -> endpoint);
                registry.add("spring.cloud.aws.sns.endpoint", () -> endpoint);
                registry.add("spring.cloud.aws.sqs.endpoint", () -> endpoint);
            };
        }

        @Bean
        SnsClient sns(GenericContainer<?> floci, AwsCredentialsProvider credentials, AwsRegionProvider region) {
            return SnsClient.builder()
                    .endpointOverride(URI.create("http://" + floci.getHost() + ":" + floci.getMappedPort(4566)))
                    .region(region.getRegion())
                    .credentialsProvider(credentials)
                    .build();
        }

        @Bean
        SqsClient sqs(GenericContainer<?> floci, AwsCredentialsProvider credentials, AwsRegionProvider region) {
            return SqsClient.builder()
                    .endpointOverride(URI.create("http://" + floci.getHost() + ":" + floci.getMappedPort(4566)))
                    .region(region.getRegion())
                    .credentialsProvider(credentials)
                    .build();
        }
    }
}
