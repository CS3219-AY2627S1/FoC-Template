package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class OrderStoredTimingMigrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("timing_migration").withUsername("order_test").withPassword("order_test_password");

    @Test
    void cleanDatabaseHasTimingIndexAndConsistentDecisionConstraint() throws Exception {
        Flyway flyway = database("timing_clean", "10");
        flyway.migrate();
        assertEquals("10", flyway.info().current().getVersion().getVersion());
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("set search_path to timing_clean");
            insertOrder(statement, "fresh", "ACCEPTED");
            assertThrows(SQLException.class, () -> statement.execute("update orders set admin_penalty_decision='WAIVED' where id='fresh'"));
            assertThrows(SQLException.class, () -> statement.execute("update orders set admin_penalty_decision='UNKNOWN' where id='fresh'"));
            statement.execute("update orders set admin_penalty_decision='WAIVED', admin_penalty_amount=0, admin_resolution_at=now() where id='fresh'");
            assertThrows(SQLException.class, () -> statement.execute("update orders set admin_penalty_reason='OVERDUE_DELIVERY' where id='fresh'"));
            try (ResultSet result = statement.executeQuery("select count(*) from pg_indexes where schemaname='timing_clean' and indexname='ix_orders_auto_completion'")) {
                assertTrue(result.next());
                assertEquals(1, result.getInt(1));
            }
        }
    }

    @Test
    void upgradeUsesCurrentAttemptStartRatherThanAcceptanceAndPreservesEvidence() throws Exception {
        database("timing_upgrade", "9").migrate();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("set search_path to timing_upgrade");
            insertOrder(statement, "delivered", "DELIVERED");
            insertOrder(statement, "unknown", "DELIVERED");
            insertOrder(statement, "accepted", "ACCEPTED");
            insertOrder(statement, "cancelled", "CANCELLED");
            checkpoint(statement, "delivered", "ACCEPTED", "09:00:00", "courier");
            checkpoint(statement, "delivered", "IN_PROGRESS", "09:01:00", "courier");
            checkpoint(statement, "delivered", "DELIVERED", "09:10:00", "courier");
            checkpoint(statement, "delivered", "ACCEPTED", "10:00:00", "courier");
            checkpoint(statement, "delivered", "IN_PROGRESS", "11:00:00", "courier");
            checkpoint(statement, "delivered", "DELIVERED", "11:20:00", "courier");
            checkpoint(statement, "delivered", "IN_PROGRESS", "12:00:00", "other-courier");
            checkpoint(statement, "unknown", "ACCEPTED", "10:00:00", "courier");
            checkpoint(statement, "unknown", "DELIVERED", "11:20:00", "courier");
            checkpoint(statement, "accepted", "ACCEPTED", "10:00:00", "courier");
            checkpoint(statement, "cancelled", "ACCEPTED", "10:00:00", "courier");
            checkpoint(statement, "cancelled", "IN_PROGRESS", "11:00:00", "courier");
            statement.execute("insert into command_receipts(id,operation,command_id,order_id,recorded_at) values ('receipt','ADMIN_CANCEL','ADMIN_CANCEL:cancelled','cancelled','2026-10-17T11:10:00Z')");
            statement.execute("insert into order_event_outbox(event_id,order_id,event_type,event_version,order_version,payload,state,created_at,next_attempt_at) values ('event','delivered','OrderCompletionTaskEvent',1,7,'{\"legacy\":true}','PENDING',now(),now())");
        }
        Flyway upgraded = database("timing_upgrade", "10");
        upgraded.migrate();
        assertEquals("10", upgraded.info().current().getVersion().getVersion());
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("set search_path to timing_upgrade");
            try (ResultSet result = statement.executeQuery("select * from orders where id='delivered'")) {
                assertTrue(result.next());
                assertEquals(Instant.parse("2026-10-17T11:30:00Z"), result.getTimestamp("delivery_deadline_at").toInstant());
                assertEquals(Instant.parse("2026-10-17T11:20:00Z"), result.getTimestamp("delivered_at").toInstant());
                assertEquals("DELIVERED", result.getString("status"));
                assertEquals(7, result.getLong("version"));
            }
            try (ResultSet result = statement.executeQuery("select * from orders where id in ('unknown','accepted')")) {
                while (result.next()) {
                    assertNull(result.getTimestamp("delivery_deadline_at"));
                    assertNull(result.getTimestamp("delivered_at"));
                }
            }
            try (ResultSet result = statement.executeQuery("select * from orders where id='cancelled'")) {
                assertTrue(result.next());
                assertEquals(Instant.parse("2026-10-17T11:10:00Z"), result.getTimestamp("admin_resolution_at").toInstant());
                assertNull(result.getString("admin_penalty_decision"));
            }
            try (ResultSet result = statement.executeQuery("select payload,event_id from order_event_outbox")) {
                assertTrue(result.next());
                assertEquals("{\"legacy\":true}", result.getString("payload"));
                assertEquals("event", result.getString("event_id"));
            }
        }
    }

    private static void insertOrder(Statement statement, String id, String status) throws SQLException {
        statement.execute("insert into orders (id,requester_id,courier_id,item_description,pickup_supplier_id,delivery_supplier_id,offered_credits,status,created_at,expires_at,delivery_time_limit_minutes,version) values ('"
                + id + "','requester','courier','books','pickup','delivery',5,'" + status + "','2026-10-17T08:00:00Z','2026-10-17T15:00:00Z',30,7)");
    }

    private static void checkpoint(Statement statement, String id, String status, String time, String actor) throws SQLException {
        statement.execute("insert into order_checkpoints(id,order_id,status,occurred_at,actor_id) values ('"
                + java.util.UUID.randomUUID() + "','" + id + "','" + status + "','2026-10-17T" + time + "Z','" + actor + "')");
    }

    private static Flyway database(String schema, String target) {
        return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target(target).load();
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }
}
