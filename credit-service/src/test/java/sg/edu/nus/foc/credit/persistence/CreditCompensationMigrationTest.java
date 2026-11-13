/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated Credit compensation migration upgrade coverage from the approved handoff.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class CreditCompensationMigrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:15-alpine")
            .withDatabaseName("credit_compensation_migration")
            .withUsername("credit_test")
            .withPassword("credit_test_password");

    @Test
    void migratesACleanDatabaseToTheCorrectiveVersion() throws Exception {
        String schema = "compensation_clean";

        flyway(schema, null).migrate();

        assertThat(latestVersion(schema)).isEqualTo("10");
        assertThat(columnExists(schema, "credit_command_records", "effect_revision")).isTrue();
    }

    @Test
    void upgradesVersionEightWithOnlyProvableLegacyEffects() throws Exception {
        String schema = "compensation_upgrade";
        flyway(schema, MigrationVersion.fromVersion("8")).migrate();
        seedLegacyRows(schema);

        flyway(schema, null).migrate();

        assertThat(latestVersion(schema)).isEqualTo("10");
        assertThat(longValue(schema, "select min(mutation_revision) from credit_reservations"))
                .isEqualTo(1L);
        assertThat(longValue(schema, "select max(mutation_revision) from credit_reservations"))
                .isEqualTo(1L);

        assertThat(effectRevision(schema, "reserve-current")).isEqualTo(1L);
        assertThat(effectRevision(schema, "reserve-assigned")).isNull();
        assertThat(effectRevision(schema, "reserve-settled")).isNull();

        assertThat(effectRevision(schema, "assign-current")).isEqualTo(1L);
        assertThat(effectRevision(schema, "assign-old")).isNull();
        assertThat(effectRevision(schema, "assign-new")).isEqualTo(1L);
        assertThat(effectRevision(schema, "assign-mismatch")).isNull();
        assertThat(effectRevision(schema, "clear-old")).isNull();
        assertThat(textValue(schema, "select courier_assignment_identity from credit_reservations "
                + "where order_id = 'order-assign-current'")).isEqualTo("assign-current");
    }

    private void seedLegacyRows(String schema) throws Exception {
        try (Connection connection = connection()) {
            insertAccount(connection, schema, "requester");
            insertAccount(connection, schema, "courier");
            insertAccount(connection, schema, "other-courier");

            insertCommand(connection, schema, "reserve-current", "RESERVE", "requester",
                    "order-reserve-current", 5L);
            insertCommand(connection, schema, "reserve-assigned", "RESERVE", "requester",
                    "order-reserve-assigned", 6L);
            insertCommand(connection, schema, "reserve-settled", "RESERVE", "requester",
                    "order-reserve-settled", 7L);
            insertCommand(connection, schema, "assigned-current", "ASSIGN_COURIER", "courier",
                    "order-reserve-assigned", null);
            insertCommand(connection, schema, "assign-current", "ASSIGN_COURIER", "courier",
                    "order-assign-current", null);
            insertCommand(connection, schema, "assign-old", "ASSIGN_COURIER", "courier",
                    "order-assign-superseded", null);
            insertCommand(connection, schema, "assign-new", "ASSIGN_COURIER", "courier",
                    "order-assign-superseded", null);
            insertCommand(connection, schema, "assign-mismatch", "ASSIGN_COURIER", "other-courier",
                    "order-assign-mismatch", null);
            insertCommand(connection, schema, "clear-old", "CLEAR_COURIER", "courier",
                    "order-clear-old", null);

            insertReservation(connection, schema, "order-reserve-current", null, 5L,
                    "RESERVED", "reserve-current", null);
            insertReservation(connection, schema, "order-reserve-assigned", "courier", 6L,
                    "RESERVED", "reserve-assigned", "assigned-current");
            insertReservation(connection, schema, "order-reserve-settled", null, 7L,
                    "REFUNDED", "reserve-settled", null);
            insertReservation(connection, schema, "order-assign-current", "courier", 8L,
                    "RESERVED", null, "assign-current");
            insertReservation(connection, schema, "order-assign-superseded", "courier", 9L,
                    "RESERVED", null, "assign-new");
            insertReservation(connection, schema, "order-assign-mismatch", "courier", 10L,
                    "RESERVED", null, "assign-mismatch");
            insertReservation(connection, schema, "order-clear-old", null, 11L,
                    "RESERVED", null, null);
        }
    }

    private void insertAccount(Connection connection, String schema, String userId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("insert into " + schema
                + ".credit_accounts(user_id,total_balance,reserved_balance,created_at,updated_at) "
                + "values (?,50,0,now(),now())")) {
            statement.setString(1, userId);
            statement.executeUpdate();
        }
    }

    private void insertCommand(Connection connection, String schema, String commandId,
                               String operation, String actorId, String orderId, Long amount)
            throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("insert into " + schema
                + ".credit_command_records(command_id,operation,actor_id,order_id,amount,payload_hash,"
                + "highest_generation,outcome,code,created_at,updated_at,completed_at) "
                + "values (?,?,?,?,?,'legacy-hash',1,'APPLIED','SUCCEEDED',now(),now(),now())")) {
            statement.setString(1, commandId);
            statement.setString(2, operation);
            statement.setString(3, actorId);
            statement.setString(4, orderId);
            if (amount == null) {
                statement.setObject(5, null);
            } else {
                statement.setLong(5, amount);
            }
            statement.executeUpdate();
        }
    }

    private void insertReservation(Connection connection, String schema, String orderId,
                                   String courierId, long amount, String status,
                                   String reserveCommandId, String assignmentCommandId)
            throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("insert into " + schema
                + ".credit_reservations(order_id,requester_id,courier_id,amount,status,created_at,"
                + "updated_at,refunded_at,reserve_command_id,courier_assignment_command_id) "
                + "values (?,'requester',?,?,?,now(),now(),?, ?, ?)")) {
            statement.setString(1, orderId);
            statement.setString(2, courierId);
            statement.setLong(3, amount);
            statement.setString(4, status);
            statement.setObject(5, "REFUNDED".equals(status) ? java.time.OffsetDateTime.now() : null);
            statement.setString(6, reserveCommandId);
            statement.setString(7, assignmentCommandId);
            statement.executeUpdate();
        }
    }

    private Flyway flyway(String schema, MigrationVersion target) {
        org.flywaydb.core.api.configuration.FluentConfiguration configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema)
                .defaultSchema(schema)
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private String latestVersion(String schema) throws Exception {
        return textValue(schema, "select version from flyway_schema_history where success "
                + "order by installed_rank desc limit 1");
    }

    private boolean columnExists(String schema, String table, String column) throws Exception {
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(
                "select exists(select 1 from information_schema.columns where table_schema=? "
                        + "and table_name=? and column_name=?)")) {
            statement.setString(1, schema);
            statement.setString(2, table);
            statement.setString(3, column);
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getBoolean(1);
            }
        }
    }

    private Long effectRevision(String schema, String commandId) throws Exception {
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(
                "select effect_revision from " + schema + ".credit_command_records where command_id=?")) {
            statement.setString(1, commandId);
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getObject(1, Long.class);
            }
        }
    }

    private Long longValue(String schema, String sql) throws Exception {
        try (Connection connection = connection()) {
            connection.setSchema(schema);
            try (Statement statement = connection.createStatement();
                    ResultSet result = statement.executeQuery(sql)) {
                result.next();
                return result.getObject(1, Long.class);
            }
        }
    }

    private String textValue(String schema, String sql) throws Exception {
        try (Connection connection = connection()) {
            connection.setSchema(schema);
            try (Statement statement = connection.createStatement();
                    ResultSet result = statement.executeQuery(sql)) {
                result.next();
                return result.getString(1);
            }
        }
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
                POSTGRES.getPassword());
    }
}
