package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class OrderOutboxMigrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("order_outbox_test")
            .withUsername("order_test")
            .withPassword("order_test_password");

    @Test
    void appliesOutboxMigrationToCleanDatabase() throws Exception {
        Flyway flyway = flyway("outbox_clean");

        flyway.migrate();

        assertEquals("9", latestVersion("outbox_clean"));
        assertTrue(tableExists("outbox_clean", "order_commands"));
        assertTrue(tableExists("outbox_clean", "order_event_outbox"));
        assertTrue(indexExists("outbox_clean", "ix_order_event_outbox_due"));
        assertTrue(indexExists("outbox_clean", "ix_order_event_outbox_expired_lease"));
    }

    @Test
    void upgradesVersionOneDatabaseWithoutRewritingItsHistory() throws Exception {
        flyway("outbox_upgrade", MigrationVersion.fromVersion("1")).migrate();
        assertEquals("1", latestVersion("outbox_upgrade"));

        flyway("outbox_upgrade").migrate();

        assertEquals("9", latestVersion("outbox_upgrade"));
        assertTrue(tableExists("outbox_upgrade", "order_event_outbox"));
    }

    @Test
    void upgradesVersionFivePreservingPendingPayloadAndUnboundHistoricalReceipts() throws Exception {
        String schema = "review_upgrade";
        flyway(schema, MigrationVersion.fromVersion("5")).migrate();
        insertPendingOutboxEntry(schema);
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into " + schema + ".command_receipts "
                    + "(id,operation,command_id,order_id,recorded_at) values "
                    + "('00000000-0000-0000-0000-000000000105','COMPLETE','historical','order-claim',now())");
        }
        flyway(schema).migrate();
        assertEquals("9", latestVersion(schema));
        assertTrue(indexExists(schema, "ix_order_event_outbox_failed"));
        try (Connection connection = connection(); Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("select event_id,payload,state from " + schema + ".order_event_outbox")) {
            assertTrue(result.next());
            assertEquals("event-claim", result.getString("event_id"));
            assertEquals("{}", result.getString("payload"));
            assertEquals("PENDING", result.getString("state"));
            assertFalse(result.next());
        }
        try (Connection connection = connection(); Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("select actor_id,input_fingerprint,command_id from " + schema + ".command_receipts")) {
            assertTrue(result.next());
            assertEquals(null, result.getString("actor_id"));
            assertEquals(null, result.getString("input_fingerprint"));
            assertEquals("historical", result.getString("command_id"));
        }
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            assertEquals(1, statement.executeUpdate("update " + schema + ".order_event_outbox set state='FAILED',attempt_count=10 where event_id='event-claim'"));
        }
    }

    @Test
    void upgradesVersionThreeAndDisablesLegacyPlansWithoutInventingExpiry() throws Exception {
        String schema = "repost_upgrade";
        flyway(schema, MigrationVersion.fromVersion("3")).migrate();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into " + schema + ".orders "
                    + "(row_id,id,requester_id,item_description,pickup_supplier_id,delivery_supplier_id,"
                    + "offered_credits,status,created_at,expires_at,delivery_time_limit_minutes,enabled,"
                    + "due_at,credit_amount,delivery_duration_minutes,used) values "
                    + "('00000000-0000-0000-0000-000000000086','legacy','owner','item','p','d',1,'OPEN',"
                    + "now(),now()+interval '1 hour',15,true,now()+interval '2 hours',2,15,false)");
        }
        flyway(schema).migrate();
        assertEquals("9", latestVersion(schema));
        try (Connection connection = connection(); Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("select enabled,repost_expires_at,status,id from "
                        + schema + ".orders where id='legacy'")) {
            assertTrue(result.next());
            assertFalse(result.getBoolean("enabled"));
            assertEquals(null, result.getObject("repost_expires_at"));
            assertEquals("OPEN", result.getString("status"));
            assertEquals("legacy", result.getString("id"));
        }
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            assertThrows(java.sql.SQLException.class,
                    () -> statement.execute("update " + schema + ".orders set enabled=true where id='legacy'"));
            statement.execute("update " + schema + ".orders set enabled=true,due_at=expires_at,"
                    + "repost_expires_at=expires_at+interval '1 hour' where id='legacy'");
            assertThrows(java.sql.SQLException.class,
                    () -> statement.execute("update " + schema + ".orders set repost_expires_at=due_at where id='legacy'"));
        }
    }

    @Test
    void postgresSkipLockedClaimAllowsOnlyOneConcurrentDispatcher() throws Exception {
        flyway("outbox_claim").migrate();
        insertPendingOutboxEntry("outbox_claim");
        Instant now = Instant.now();
        String claimSql = "select event_id from outbox_claim.order_event_outbox where event_id = ? "
                + "and ((state = 'PENDING' and next_attempt_at <= ?) "
                + "or (state = 'IN_PROGRESS' and lease_until <= ?)) for update skip locked";

        try (Connection firstWorker = connection(); Connection secondWorker = connection()) {
            firstWorker.setAutoCommit(false);
            secondWorker.setAutoCommit(false);
            assertTrue(claimable(firstWorker, claimSql, now));
            assertFalse(claimable(secondWorker, claimSql, now));
            firstWorker.commit();
            assertTrue(claimable(secondWorker, claimSql, now));
            secondWorker.rollback();
        }
    }

    @Test
    void upgradesVersionSevenPreservingCommandsAndGuardingDistinctRepostCandidate() throws Exception {
        String schema = "manual_repost_upgrade";
        flyway(schema, MigrationVersion.fromVersion("7")).migrate();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into " + schema + ".order_commands(command_id,actor_id,kind,order_id,input_hash,payload) "
                    + "values ('old','owner','CREATE','existing-id','hash','{}')");
        }
        flyway(schema).migrate();
        assertEquals("9", latestVersion(schema));
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            try (ResultSet saved = statement.executeQuery("select order_id,payload,status,candidate_order_id from " + schema + ".order_commands where command_id='old'")) {
                assertTrue(saved.next());
                assertEquals("existing-id", saved.getString("order_id"));
                assertEquals("{}", saved.getString("payload"));
                assertEquals("PENDING", saved.getString("status"));
                assertEquals(null, saved.getString("candidate_order_id"));
            }
            String insert = "insert into " + schema + ".order_commands(command_id,actor_id,kind,order_id,input_hash,payload,candidate_order_id) values ";
            assertThrows(java.sql.SQLException.class, () -> statement.execute(insert + "('bad','owner','REPOST','orig','hash','{}',null)"));
            assertThrows(java.sql.SQLException.class, () -> statement.execute(insert + "('bad','owner','REPOST','orig','hash','{}','orig')"));
            statement.execute(insert + "('repost','owner','REPOST','orig','hash','{}','candidate')");
            assertThrows(java.sql.SQLException.class, () -> statement.execute(insert + "('competitor','owner','REPOST','orig','hash','{}','candidate2')"));
            assertThrows(java.sql.SQLException.class, () -> statement.execute(insert + "('reuse','owner','REPOST','orig2','hash','{}','candidate')"));
            assertTrue(indexExists(schema, "ux_order_command_pending_target"));
        }
    }

    private Flyway flyway(String schema) {
        return flyway(schema, null);
    }

    private Flyway flyway(String schema, MigrationVersion target) {
        org.flywaydb.core.api.configuration.FluentConfiguration configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema)
                .defaultSchema(schema)
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        } else {
            configuration.target("9"); // Historical V1–V9 characterization; V10 has its own upgrade tests.
        }
        return configuration.load();
    }

    private String latestVersion(String schema) throws Exception {
        try (Connection connection = connection();
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery(
                        "select version from " + schema + ".flyway_schema_history where success order by installed_rank desc limit 1")) {
            result.next();
            return result.getString(1);
        }
    }

    private boolean tableExists(String schema, String table) throws Exception {
        try (Connection connection = connection();
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery(
                        "select to_regclass('" + schema + "." + table + "') is not null")) {
            result.next();
            return result.getBoolean(1);
        }
    }

    private boolean indexExists(String schema, String index) throws Exception {
        try (Connection connection = connection();
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery(
                        "select to_regclass('" + schema + "." + index + "') is not null")) {
            result.next();
            return result.getBoolean(1);
        }
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private void insertPendingOutboxEntry(String schema) throws Exception {
        Instant createdAt = Instant.now().minusSeconds(1);
        try (Connection connection = connection();
                PreparedStatement order = connection.prepareStatement(
                        "insert into " + schema + ".orders (id, requester_id, item_description, pickup_supplier_id, "
                                + "delivery_supplier_id, offered_credits, status, created_at, expires_at, "
                                + "delivery_time_limit_minutes) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            order.setString(1, "order-claim");
            order.setString(2, "requester-1");
            order.setString(3, "item");
            order.setString(4, "pickup");
            order.setString(5, "delivery");
            order.setLong(6, 5);
            order.setString(7, "COMPLETED");
            order.setObject(8, OffsetDateTime.ofInstant(createdAt, ZoneOffset.UTC));
            order.setObject(9, OffsetDateTime.ofInstant(createdAt.plusSeconds(3600), ZoneOffset.UTC));
            order.setInt(10, 15);
            order.executeUpdate();
        }
        try (Connection connection = connection();
                PreparedStatement outbox = connection.prepareStatement(
                        "insert into " + schema + ".order_event_outbox "
                                + "(event_id, order_id, event_type, event_version, order_version, payload, state, "
                                + "attempt_count, created_at, next_attempt_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            outbox.setString(1, "event-claim");
            outbox.setString(2, "order-claim");
            outbox.setString(3, "OrderCompletionTaskEvent");
            outbox.setInt(4, 1);
            outbox.setLong(5, 1);
            outbox.setString(6, "{}");
            outbox.setString(7, "PENDING");
            outbox.setInt(8, 0);
            outbox.setObject(9, OffsetDateTime.ofInstant(createdAt, ZoneOffset.UTC));
            outbox.setObject(10, OffsetDateTime.ofInstant(createdAt, ZoneOffset.UTC));
            outbox.executeUpdate();
        }
    }

    private boolean claimable(Connection connection, String sql, Instant now) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, "event-claim");
            statement.setObject(2, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
            statement.setObject(3, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }
}
