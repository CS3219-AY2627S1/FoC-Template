/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation tests.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class ReportCreationLifecycleMigrationTest {
    @Container static final PostgreSQLContainer<?> DB=new PostgreSQLContainer<>("postgres:15-alpine");
    private Flyway migration(String schema,String target){var c=Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).schemas(schema);if(target!=null)c.target(target);return c.load();}
    private JdbcTemplate sql(){return new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()));}

    @Test void cleanSchemaHasCreationLifecycleAndDeduplication(){
        Flyway flyway=migration("creation_clean",null);flyway.migrate();
        assertEquals("20",flyway.info().current().getVersion().toString());
        assertNotNull(sql().queryForObject("select to_regclass('creation_clean.order_report_creation_lifecycles')::text",String.class));
        assertNotNull(sql().queryForObject("select to_regclass('creation_clean.order_report_creation_compensations')::text",String.class));
    }

    @Test void upgradeFromNineteenPreservesHoldsAndCreatesNoLifecycleRows(){
        migration("creation_upgrade","19").migrate();
        sql().update("""
                insert into creation_upgrade.orders(id,requester_id,item_description,pickup_supplier_id,
                    delivery_supplier_id,offered_credits,status,created_at,expires_at,
                    delivery_time_limit_minutes,version,completion_hold)
                values ('existing-order','owner','books','pickup','delivery',5,'DELIVERED',now(),now(),30,7,true)
                """);
        sql().update("""
                insert into creation_upgrade.order_completion_holds(report_id,order_id,requester_id,placed_at)
                values ('existing-report','existing-order','owner',now())
                """);
        Flyway latest=migration("creation_upgrade",null);latest.migrate();
        assertEquals("20",latest.info().current().getVersion().toString());
        assertEquals(0,sql().queryForObject("select count(*) from creation_upgrade.order_report_creation_lifecycles",Integer.class));
        assertEquals(1,sql().queryForObject("select count(*) from creation_upgrade.order_completion_holds where report_id='existing-report' and released_at is null",Integer.class));
        assertTrue(sql().queryForObject("select completion_hold from creation_upgrade.orders where id='existing-order'",Boolean.class));
    }
}
