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
class PenaltyOutcomeMigrationTest {
    @Container private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("penalty_migration").withUsername("order_test").withPassword("order_test_password");
    @ParameterizedTest @ValueSource(booleans={false,true})
    void cleanAndV12UpgradePreserveExistingOrdersWithoutInventingPenaltyHistory(boolean upgrade) throws Exception {
        String schema=upgrade?"upgrade_penalty":"clean_penalty";
        if(upgrade){
            database(schema,"12").migrate();
            try(Connection c=connection(); Statement s=c.createStatement()){
                s.execute("set search_path to "+schema);
                s.execute("insert into orders(id,requester_id,item_description,pickup_supplier_id,delivery_supplier_id,offered_credits,status,created_at,expires_at,delivery_time_limit_minutes,version) values ('legacy','owner','books','p','d',5,'COMPLETED',now(),now(),30,7)");
            }
        }
        database(schema,"latest").migrate();
        try(Connection c=connection(); Statement s=c.createStatement()){
            s.execute("set search_path to "+schema);
            try(ResultSet r=s.executeQuery("select count(*) from order_penalty_outcomes")){assertTrue(r.next());assertEquals(0,r.getLong(1));}
            try(ResultSet r=s.executeQuery("select count(*) from order_penalty_adjustments")){assertTrue(r.next());assertEquals(0,r.getLong(1));}
            if(upgrade)try(ResultSet r=s.executeQuery("select status,courier_assignment_id from orders where id='legacy'")){assertTrue(r.next());assertEquals("COMPLETED",r.getString(1));assertNull(r.getObject(2));}
            try(ResultSet r=s.executeQuery("select indexname from pg_indexes where schemaname='"+schema+"' and indexname='ux_penalty_adjustment_pending'")){assertTrue(r.next());}
        }
    }
    private Flyway database(String schema,String target){return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target(target).load();}
    private Connection connection()throws SQLException{return DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());}
}
