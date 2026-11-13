package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class OrderCompletionHoldMigrationTest {

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("hold_migration_test").withUsername("order_test").withPassword("order_test_password");

    @Test
    void cleanDatabaseReachesVersionNineWithAnEmptyHoldTable() throws Exception {
        Flyway flyway = database("hold_clean", "9");
        flyway.migrate();
        assertEquals("9", flyway.info().current().getVersion().getVersion());
        try (Connection connection = connection(); Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("select count(*) from hold_clean.order_completion_holds")) {
            assertTrue(result.next());
            assertEquals(0, result.getInt(1));
        }
    }

    @Test
    void upgradeFromEightPreservesExistingOrdersAndDefaultsToNoHold() throws Exception {
        database("hold_upgrade", "8").migrate();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into hold_upgrade.orders (id, requester_id, item_description, "
                    + "pickup_supplier_id, delivery_supplier_id, offered_credits, status, created_at, expires_at, "
                    + "delivery_time_limit_minutes, version) values "
                    + "('legacy-order','owner','books','p','d',5,'DELIVERED',now(),now()+interval '1 hour',30,7)");
        }
        Flyway upgraded = database("hold_upgrade", "9");
        upgraded.migrate();
        assertEquals("9", upgraded.info().current().getVersion().getVersion());
        try (Connection connection = connection(); Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("select completion_hold,status,version from hold_upgrade.orders where id='legacy-order'")) {
            assertTrue(result.next());
            assertFalse(result.getBoolean("completion_hold"));
            assertEquals("DELIVERED", result.getString("status"));
            assertEquals(7, result.getLong("version"));
        }
    }

    private static Flyway database(String schema, String target) {
        org.flywaydb.core.api.configuration.FluentConfiguration configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration");
        if (target != null) configuration.target(target);
        return configuration.load();
    }

    private static Connection connection() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }
}
