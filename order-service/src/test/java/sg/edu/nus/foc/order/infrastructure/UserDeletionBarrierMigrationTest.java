package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class UserDeletionBarrierMigrationTest {
    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");

    @Test
    void cleanDatabaseHasConsistentBarrierConstraints() {
        Flyway migration = flyway("clean", null);
        migration.migrate();
        assertEquals("20", migration.info().current().getVersion().toString());
        JdbcTemplate sql = sql();
        sql.update("insert into clean.order_user_deletion_guards(user_id) values ('student')");
        assertThrows(DataIntegrityViolationException.class, () -> sql.update(
                "update clean.order_user_deletion_guards set blocked=true where user_id='student'"));
        sql.update("update clean.order_user_deletion_guards set blocked=true,operation_id='op' where user_id='student'");
        assertTrue(sql.queryForObject("select blocked from clean.order_user_deletion_guards where user_id='student'", Boolean.class));
    }

    @Test
    void v16UpgradePreservesPendingFinancialEvidenceAndDoesNotInventDeletedUsers() {
        flyway("upgrade", "16").migrate();
        JdbcTemplate sql = sql();
        sql.update("insert into upgrade.order_commands(command_id,actor_id,kind,order_id,input_hash,payload) "
                + "values ('old','owner','CREATE',?,'hash','{}'::jsonb)", UUID.randomUUID().toString());
        Flyway migration = flyway("upgrade", null);
        migration.migrate();
        assertEquals("20", migration.info().current().getVersion().toString());
        assertEquals("PENDING", sql.queryForObject("select status from upgrade.order_commands where command_id='old'", String.class));
        assertEquals("RETRY", sql.queryForObject("select recovery_policy from upgrade.order_commands where command_id='old'", String.class));
        assertEquals(0, sql.queryForObject("select count(*) from upgrade.order_user_deletion_guards", Integer.class));
    }

    private Flyway flyway(String schema, String target) {
        org.flywaydb.core.api.configuration.FluentConfiguration configuration = Flyway.configure()
                .dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword()).schemas(schema);
        if (target != null) configuration.target(target);
        return configuration.load();
    }

    private JdbcTemplate sql() {
        return new JdbcTemplate(new DriverManagerDataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword()));
    }
}
