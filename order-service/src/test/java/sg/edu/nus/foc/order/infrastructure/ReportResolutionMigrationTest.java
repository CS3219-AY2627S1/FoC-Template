package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class ReportResolutionMigrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:15-alpine");
    private Flyway migration(String schema, String target) {
        var config = Flyway.configure().dataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword()).schemas(schema);
        if (target != null) config.target(target);
        return config.load();
    }
    private JdbcTemplate sql() { return new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword())); }

    @Test void cleanSchemaHasDurableResolutionJournalAndResultInbox() {
        migration("report_clean", null).migrate();
        assertNotNull(sql().queryForObject("select to_regclass('report_clean.order_report_resolutions')::text", String.class));
        assertNotNull(sql().queryForObject("select to_regclass('report_clean.order_report_resolution_results')::text", String.class));
    }

    @Test void upgradePreservesExistingCommandsAndDoesNotInventResolutionWork() {
        migration("report_upgrade", "17").migrate();
        sql().update("insert into report_upgrade.order_commands(command_id,actor_id,kind,order_id,input_hash,payload) values ('old','owner','CREATE',?,'hash','{}'::jsonb)", UUID.randomUUID().toString());
        Flyway latest = migration("report_upgrade", null); latest.migrate();
        assertEquals("20", latest.info().current().getVersion().toString());
        assertEquals("PENDING", sql().queryForObject("select status from report_upgrade.order_commands where command_id='old'", String.class));
        assertEquals(0, sql().queryForObject("select count(*) from report_upgrade.order_report_resolutions", Integer.class));
    }
}
