package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class AdminResolutionReasonMigrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("reason_migration").withUsername("order_test").withPassword("order_test_password");

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void cleanAndV10UpgradePreserveHistoricalOrders(boolean upgrade) throws Exception {
        String schema = upgrade ? "reason_upgrade" : "reason_clean";
        if (upgrade) {
            database(schema, "10").migrate();
            try (Connection connection = connection(); Statement statement = connection.createStatement()) {
                statement.execute("set search_path to " + schema);
                statement.execute("insert into orders(id,requester_id,item_description,pickup_supplier_id,delivery_supplier_id,offered_credits,status,created_at,expires_at,delivery_time_limit_minutes,version) values ('existing','requester','books','pickup','delivery',5,'OPEN',now(),now()+interval '1 hour',30,7)");
            }
        }
        Flyway migrated = database(schema, "11");
        migrated.migrate();
        assertEquals("11", migrated.info().current().getVersion().getVersion());
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("set search_path to " + schema);
            try (ResultSet columns = statement.executeQuery("select character_maximum_length,is_nullable from information_schema.columns where table_schema='" + schema + "' and table_name='orders' and column_name='admin_resolution_reason'")) {
                assertTrue(columns.next());
                assertEquals(1000, columns.getInt(1));
                assertEquals("YES", columns.getString(2));
            }
            if (upgrade) {
                try (ResultSet row = statement.executeQuery("select status,version,admin_resolution_reason from orders where id='existing'")) {
                    assertTrue(row.next());
                    assertEquals("OPEN", row.getString(1));
                    assertEquals(7, row.getInt(2));
                    assertNull(row.getString(3));
                }
            }
        }
    }

    private Flyway database(String schema, String target) {
        return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target(target).load();
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }
}
