package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import sg.edu.nus.foc.order.application.CourierPenaltySequenceStore;

class CourierPenaltySequenceIntegrationTest {
    static PostgreSQLContainer<?> container;
    static String url;
    static String username;
    static String password;
    static JdbcTemplate jdbc;
    static TransactionTemplate tx;
    static CourierPenaltySequenceStore sequences;

    @BeforeAll static void database() {
        url = System.getenv("PENALTY_TEST_POSTGRES_URL");
        if (url == null) {
            container = new PostgreSQLContainer<>("postgres:15-alpine"); container.start();
            url = container.getJdbcUrl(); username = container.getUsername(); password = container.getPassword();
        } else {
            if (!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/penalty_sequence_test"))
                throw new IllegalArgumentException("Only an isolated loopback penalty_sequence_test database is allowed");
            username = "postgres"; password = "";
        }
        var dataSource = new DriverManagerDataSource(url, username, password);
        Flyway.configure().dataSource(dataSource).load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        sequences = new CourierPenaltySequenceStore(jdbc);
    }
    @AfterAll static void stop() { if (container != null) container.stop(); }
    @BeforeEach void clear() { jdbc.execute("truncate courier_penalty_event_sequences,courier_penalty_sequences"); }

    @Test void migratedToTwentyOneWithoutBackfillingLegacyEvents() {
        assertEquals("21", Flyway.configure().dataSource(url,username,password).load().info().current().getVersion().toString());
        assertEquals(0, jdbc.queryForObject("select count(*) from courier_penalty_event_sequences", Integer.class));
    }
    @Test void upgradeFromTwentyPreservesPublishedLegacyPayloadWithoutAssigningASequence() {
        String schema="sequence_upgrade_"+UUID.randomUUID().toString().replace("-", "");
        Flyway.configure().dataSource(url,username,password).schemas(schema).target("20").load().migrate();
        jdbc.update("insert into "+schema+".orders(id,requester_id,item_description,pickup_supplier_id,delivery_supplier_id,offered_credits,status,created_at,expires_at,delivery_time_limit_minutes,version) values ('legacy','owner','books','pickup','delivery',2,'COMPLETED',now(),now(),30,1)");
        String event=UUID.randomUUID().toString();
        jdbc.update("insert into "+schema+".order_event_outbox(event_id,order_id,event_type,event_version,order_version,payload,state,attempt_count,created_at,next_attempt_at) values (?,'legacy','PenaltyScoreAdditionEvent',1,1,'{\"legacy\":true}','PUBLISHED',1,now(),now())",event);
        var migrated=Flyway.configure().dataSource(url,username,password).schemas(schema).load();migrated.migrate();
        assertEquals("21",migrated.info().current().getVersion().toString());
        assertEquals("{\"legacy\":true}",jdbc.queryForObject("select payload from "+schema+".order_event_outbox where event_id=?",String.class,event));
        assertEquals(0,jdbc.queryForObject("select count(*) from "+schema+".courier_penalty_event_sequences",Integer.class));
    }
    @Test void rollbackLeavesNoGapAndEventIdentityRetainsItsPosition() {
        String event = UUID.randomUUID().toString();
        assertThrows(IllegalStateException.class, () -> tx.execute(status -> {
            assertEquals(1, sequences.assign("courier", event)); throw new IllegalStateException("business write failed");
        }));
        assertEquals(1L, tx.<Long>execute(status -> sequences.assign("courier", event)));
        assertEquals(1L, tx.<Long>execute(status -> sequences.assign("courier", event)));
        assertEquals(2L, tx.<Long>execute(status -> sequences.assign("courier", UUID.randomUUID().toString())));
        assertThrows(RuntimeException.class, () -> tx.<Long>execute(status -> sequences.assign("other", event)));
    }
    @Test void concurrentContainersGetContiguousPositionsAcrossDifferentOrders() throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(6);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Long>> jobs = new ArrayList<>();
            for (int i=0;i<12;i++) jobs.add(workers.submit(() -> {
                start.await(); return tx.<Long>execute(status -> sequences.assign("courier", UUID.randomUUID().toString()));
            }));
            start.countDown(); Set<Long> actual = new HashSet<>();
            for (var job:jobs) actual.add(job.get(20,TimeUnit.SECONDS));
            assertEquals(Set.of(1L,2L,3L,4L,5L,6L,7L,8L,9L,10L,11L,12L), actual);
            assertEquals(1L, tx.<Long>execute(status -> sequences.assign("independent", UUID.randomUUID().toString())));
        } finally { workers.shutdownNow(); }
    }
}
