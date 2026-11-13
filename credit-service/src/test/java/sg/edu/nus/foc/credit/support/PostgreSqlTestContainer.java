/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated PostgreSQL Testcontainers support based on the service integration-test requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

public final class PostgreSqlTestContainer {

    private PostgreSqlTestContainer() {
    }

    public static void register(DynamicPropertyRegistry registry) {
        String externalUrl = System.getProperty("credit.test.datasource.url", "").trim();
        if (!externalUrl.isEmpty()) {
            registry.add("spring.datasource.url", () -> externalUrl);
            registry.add("spring.datasource.username",
                    () -> System.getProperty("credit.test.datasource.username", "credit_test"));
            registry.add("spring.datasource.password",
                    () -> System.getProperty("credit.test.datasource.password", "credit_test"));
            return;
        }
        registry.add("spring.datasource.url", ContainerHolder.CONTAINER::getJdbcUrl);
        registry.add("spring.datasource.username", ContainerHolder.CONTAINER::getUsername);
        registry.add("spring.datasource.password", ContainerHolder.CONTAINER::getPassword);
    }

    private static final class ContainerHolder {
        private static final PostgreSQLContainer CONTAINER = createContainer();

        private static PostgreSQLContainer createContainer() {
            PostgreSQLContainer container = new PostgreSQLContainer(
                    DockerImageName.parse("postgres:15-alpine"));
            container.withDatabaseName("credit_test");
            container.withUsername("credit_test");
            container.withPassword("credit_test");
            container.start();
            return container;
        }
    }
}
