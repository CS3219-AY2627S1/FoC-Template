package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class AutomaticRepostMigrationTest {
    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");

    @Test
    void upgradingV15PreservesOldIntentAndDefaultsToNonDelegatedExecution() {
        Flyway.configure().dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword())
                .target("15").load().migrate();
        JdbcTemplate sql = new JdbcTemplate(new DriverManagerDataSource(
                DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword()));
        sql.update("insert into order_commands(command_id,actor_id,kind,order_id,input_hash,payload) "
                + "values ('old','owner','CREATE',?,'hash','{}'::jsonb)", UUID.randomUUID().toString());
        Flyway.configure().dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword()).load().migrate();
        assertFalse(Boolean.TRUE.equals(sql.queryForObject(
                "select automatic_execution from order_commands where command_id='old'", Boolean.class)));
        assertEquals("RETRY", sql.queryForObject("select recovery_policy from order_commands where command_id='old'", String.class));
        assertEquals("PENDING", sql.queryForObject("select status from order_commands where command_id='old'", String.class));
        assertThrows(DataIntegrityViolationException.class,
                () -> sql.update("update order_commands set automatic_execution=true where command_id='old'"));
        sql.update("update order_commands set kind='REPOST',candidate_order_id=?,recovery_policy='COMPENSATE',"
                + "automatic_execution=true where command_id='old'", UUID.randomUUID().toString());
        assertTrue(Boolean.TRUE.equals(sql.queryForObject(
                "select automatic_execution from order_commands where command_id='old'", Boolean.class)));
    }
}
