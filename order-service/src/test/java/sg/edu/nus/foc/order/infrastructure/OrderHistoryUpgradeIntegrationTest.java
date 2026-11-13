package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

@Testcontainers(disabledWithoutDocker = true)
class OrderHistoryUpgradeIntegrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine");

    @Test
    void upgradesV2WithoutRekeyingReferencesAndPreservesRecoverableAbortedCourierHistory() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target("2").load().migrate();
        try (Connection connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
                POSTGRES.getPassword()); Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into orders (id, requester_id, item_description, pickup_supplier_id, "
                    + "delivery_supplier_id, offered_credits, status, created_at, expires_at, delivery_time_limit_minutes, version) "
                    + "values ('old-business-id','requester','item','pickup','delivery',5,'ABORTED',now()-interval '2 hours',"
                    + "now()-interval '1 hour',30,7)");
            statement.executeUpdate("insert into order_checkpoints (id,order_id,status,occurred_at,actor_id) "
                    + "values ('old-checkpoint','old-business-id','ABORTED',now(),'old-courier')");
            Flyway flyway = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
                    POSTGRES.getPassword()).load();
            flyway.migrate();
            flyway.validate();
            try (ResultSet current = statement.executeQuery("select id,row_id,status from orders")) {
                assertTrue(current.next());
                assertEquals("old-business-id", current.getString("id"));
                assertTrue(current.getObject("row_id") != null);
                assertEquals("EXPIRED", current.getString("status"));
            }
            try (ResultSet history = statement.executeQuery("select order_id,courier_id from order_courier_attempts")) {
                assertTrue(history.next());
                assertEquals("old-business-id", history.getString("order_id"));
                assertEquals("old-courier", history.getString("courier_id"));
            }
            statement.executeUpdate("insert into order_checkpoints (id,order_id,status,occurred_at,actor_id) "
                    + "values ('second-checkpoint','old-business-id','ABORTED',now(),'second-courier')");
            try (ResultSet references = statement.executeQuery("select count(*) from pg_constraint where "
                    + "contype='f' and confrelid='orders'::regclass")) {
                references.next();
                assertEquals(8, references.getInt(1), "Checkpoint, outbox, attempt, report hold, penalty, report resolution and report creation lifecycle foreign keys remain valid");
            }
        }
    }
}
