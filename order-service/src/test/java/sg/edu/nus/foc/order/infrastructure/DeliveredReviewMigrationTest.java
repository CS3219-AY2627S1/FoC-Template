package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class DeliveredReviewMigrationTest {
    @Container private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("review_migration").withUsername("order_test").withPassword("order_test_password");
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void cleanAndV11UpgradeBackfillOnlyKnownDeliveryFacts(boolean upgrade) throws Exception {
        String schema = upgrade ? "review_upgrade" : "review_clean";
        if (upgrade) {
            database(schema, "11").migrate();
            try (Connection connection = connection(); Statement statement = connection.createStatement()) {
                statement.execute("set search_path to " + schema);
                statement.execute("insert into orders(id,requester_id,item_description,pickup_supplier_id,delivery_supplier_id,offered_credits,status,created_at,expires_at,delivery_time_limit_minutes,version,delivery_deadline_at,delivered_at) values ('late','owner','books','p','d',5,'DELIVERED',now(),now(),30,7,now()-interval '1 hour',now()),('unknown','owner','books','p','d',5,'DELIVERED',now(),now(),30,8,null,null)");
                statement.execute("insert into order_completion_holds(report_id,order_id,requester_id,placed_at) values ('report','late','owner',now())");
            }
        }
        Flyway migrated = database(schema, "12"); migrated.migrate(); migrated.validate();
        assertEquals("12", migrated.info().current().getVersion().getVersion());
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("set search_path to " + schema);
            if (upgrade) {
                try (ResultSet row = statement.executeQuery("select delivery_overdue,overdue_penalty_waived,version from orders where id='late'")) {
                    assertTrue(row.next()); assertTrue(row.getBoolean(1)); assertFalse(row.getBoolean(2)); assertEquals(7, row.getLong(3));
                }
                try (ResultSet row = statement.executeQuery("select delivery_overdue from orders where id='unknown'")) { assertTrue(row.next()); assertNull(row.getObject(1)); }
                try (ResultSet row = statement.executeQuery("select released_at,released_by from order_completion_holds where report_id='report'")) { assertTrue(row.next()); assertNull(row.getObject(1)); assertNull(row.getObject(2)); }
                assertThrows(SQLException.class, () -> statement.execute("update orders set overdue_penalty_waived=true where id='late'"));
            }
        }
    }
    private Flyway database(String schema, String target) {
        return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target(target).load();
    }
    private Connection connection() throws SQLException { return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()); }
}
