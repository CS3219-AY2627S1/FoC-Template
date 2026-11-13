package com.friendoncampus.credit.integration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.kafka.KafkaContainer;
import tools.jackson.databind.json.JsonMapper;

/** Disposable real Credit database/listener/broker; User eligibility is an explicit test fixture. */
@SpringBootTest(properties={"app.admin-commands.enabled=true","app.admin-commands.outbox-delay=3600000",
        "spring.kafka.properties.security.protocol=PLAINTEXT"})
@Testcontainers
class AdminCreditKafkaIntegrationTest {
    @Container static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:17-alpine");
    @Container static KafkaContainer kafka=new KafkaContainer("apache/kafka:4.3.1")
            .withEnv("KAFKA_HEAP_OPTS","-Xms128m -Xmx384m").withEnv("KAFKA_OPTS","-XX:ActiveProcessorCount=2")
            .withStartupTimeout(Duration.ofMinutes(3));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r)throws Exception{
        r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);
        r.add("spring.kafka.bootstrap-servers",kafka::getBootstrapServers);
        try(var admin=AdminClient.create(Map.of("bootstrap.servers",kafka.getBootstrapServers()))){
            admin.createTopics(List.of(new NewTopic("admin.credit.commands",3,(short)1),new NewTopic("admin.credit.commands.DLT",1,(short)1),new NewTopic("credit.admin.events",3,(short)1))).all().get(30,TimeUnit.SECONDS);
        }
    }
    @Autowired AdminCreditCorrectionService service;
    @Autowired AdminCreditKafka.Transport transport;
    @Autowired AdminCreditOutbox outbox;
    @Autowired KafkaTemplate<String,String> producer;
    @Autowired JdbcTemplate db;
    @Autowired com.friendoncampus.credit.service.CreditReservationService reservations;
    @MockitoBean AdminActorClient actors;
    final JsonMapper json=JsonMapper.builder().build();
    UUID actor,target;
    @BeforeEach void setup(){
        db.execute("TRUNCATE credit_admin_quarantine,credit_accounts,credit_operations CASCADE");actor=UUID.randomUUID();target=UUID.randomUUID();
        db.update("INSERT INTO credit_accounts(user_id,available_balance,reserved_balance) VALUES (?,10,3)",target);
        when(actors.eligible(any())).thenReturn(true);
    }
    Map<String,Object> command(long amount){
        Map<String,Object> e=new LinkedHashMap<>();e.put("eventId",UUID.randomUUID());e.put("eventType","AdminCreditCorrectionRequested");e.put("eventVersion",1);e.put("aggregateType","AdminAction");e.put("aggregateId",target);e.put("aggregateVersion",1);e.put("occurredAt",Instant.now().toString());e.put("producer","admin-service");e.put("correlationId",UUID.randomUUID());e.put("causationId",null);e.put("actor",Map.of("type","USER","role","ADMIN","userId",actor));
        e.put("data",new LinkedHashMap<>(Map.of("operationId",UUID.randomUUID(),"caseId",UUID.randomUUID(),"orderId",UUID.randomUUID(),"caseRevision",2,"targetUserId",target,"requestedBy",actor,"amount",amount,"reason","TEST ONLY correction")));return e;
    }
    @SuppressWarnings("unchecked") Map<String,Object> data(Map<String,Object> c){return (Map<String,Object>)c.get("data");}
    UUID op(Map<String,Object> c){return (UUID)data(c).get("operationId");}
    String wire(Map<String,Object> c){return json.writeValueAsString(c);}
    String outcome(Map<String,Object> c){return db.queryForObject("SELECT payload FROM credit_admin_operations WHERE operation_id=?",String.class,op(c));}
    int balance(){return db.queryForObject("SELECT available_balance FROM credit_accounts WHERE user_id=?",Integer.class,target);}
    void waitForOperation(UUID operation)throws Exception{
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);
        while(System.nanoTime()<end){if(db.queryForObject("SELECT count(*) FROM credit_admin_operations WHERE operation_id=?",Integer.class,operation)==1)return;Thread.sleep(100);}
        fail("Real Credit listener did not record the command");
    }
    @Test void actualListenerPublishesOriginalOutcomeAndDuplicateCannotRepeatTheEffect()throws Exception{
        var c=command(4);producer.send("admin.credit.commands",target.toString(),wire(c)).get(15,TimeUnit.SECONDS);waitForOperation(op(c));
        assertEquals(14,balance());assertEquals(3,db.queryForObject("SELECT reserved_balance FROM credit_accounts WHERE user_id=?",Integer.class,target));
        String original=outcome(c);
        try(var reader=new KafkaConsumer<String,String>(Map.of("bootstrap.servers",kafka.getBootstrapServers(),"group.id","TEST-ONLY-"+UUID.randomUUID(),"auto.offset.reset","earliest","enable.auto.commit",false),new StringDeserializer(),new StringDeserializer())){
            reader.subscribe(List.of("credit.admin.events"));transport.publish();boolean found=false;long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(!found&&System.nanoTime()<end)for(var r:reader.poll(Duration.ofMillis(200)))if(op(c).toString().equals(json.readTree(r.value()).path("data").path("operationId").asText())){assertEquals(original,r.value());assertEquals(target.toString(),r.key());found=true;}
            assertTrue(found,"No real broker outcome observed");
        }
        c.put("eventId",UUID.randomUUID());when(actors.eligible(actor)).thenThrow(new IllegalStateException("TEST ONLY User outage"));
        assertTrue(service.receive(target.toString(),wire(c)));assertEquals(14,balance());assertEquals(original,outcome(c));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM credit_ledger_entries WHERE operation_id=?",Integer.class,op(c)));
    }
    @Test void debitRejectionsAndConflictsAreDurableAndReservedBalanceIsUntouched(){
        var debit=command(-5);assertTrue(service.receive(target.toString(),wire(debit)));assertEquals(5,balance());
        var rejected=command(-6);assertTrue(service.receive(target.toString(),wire(rejected)));
        assertEquals("INSUFFICIENT_AVAILABLE_CREDITS",json.readTree(outcome(rejected)).path("data").path("reasonCode").asText());
        db.update("UPDATE credit_accounts SET available_balance=100 WHERE user_id=?",target);service.receive(target.toString(),wire(rejected));assertEquals(100,balance());
        data(debit).put("amount",-2);assertFalse(service.receive(target.toString(),wire(debit)));assertEquals(100,balance());
        assertEquals(1,db.queryForObject("SELECT count(*) FROM credit_admin_quarantine",Integer.class));
    }
    @Test void missingAccountsRevokedActorsAndOverflowNeverProduceLedgerEffects(){
        when(actors.eligible(actor)).thenReturn(false);var revoked=command(1);service.receive(target.toString(),wire(revoked));
        assertEquals("ACTOR_NOT_AUTHORIZED",json.readTree(outcome(revoked)).path("data").path("reasonCode").asText());
        when(actors.eligible(actor)).thenReturn(true);var overflow=command(Integer.MAX_VALUE);service.receive(target.toString(),wire(overflow));
        assertEquals("NUMERIC_LIMIT",json.readTree(outcome(overflow)).path("data").path("reasonCode").asText());
        db.update("DELETE FROM credit_accounts WHERE user_id=?",target);var missing=command(1);service.receive(target.toString(),wire(missing));
        assertEquals("ACCOUNT_NOT_FOUND",json.readTree(outcome(missing)).path("data").path("reasonCode").asText());
        assertEquals(0,db.queryForObject("SELECT count(*) FROM credit_ledger_entries",Integer.class));
    }
    @Test void outcomeStorageFailureRollsBackLedgerEffectAndAllReceipts(){
        var c=command(1);db.execute("ALTER TABLE credit_admin_outbox ADD CONSTRAINT test_outbox_unavailable CHECK(false) NOT VALID");
        try{assertThrows(RuntimeException.class,()->service.receive(target.toString(),wire(c)));}
        finally{db.execute("ALTER TABLE credit_admin_outbox DROP CONSTRAINT test_outbox_unavailable");}
        assertEquals(10,balance());assertEquals(0,db.queryForObject("SELECT count(*) FROM credit_operations",Integer.class));assertEquals(0,db.queryForObject("SELECT count(*) FROM credit_admin_inbox",Integer.class));
    }
    @Test void brokerOutageRetainsOriginalOutboxForRecovery()throws Exception{
        var c=command(1);service.receive(target.toString(),wire(c));String original=outcome(c);
        var docker=DockerClientFactory.instance().client();docker.pauseContainerCmd(kafka.getContainerId()).exec();
        try{transport.publish();assertEquals(1,db.queryForObject("SELECT count(*) FROM credit_admin_outbox WHERE published_at IS NULL",Integer.class));}
        finally{docker.unpauseContainerCmd(kafka.getContainerId()).exec();}
        db.update("UPDATE credit_admin_outbox SET next_attempt_at=CURRENT_TIMESTAMP");transport.publish();
        assertEquals(0,db.queryForObject("SELECT count(*) FROM credit_admin_outbox WHERE published_at IS NULL",Integer.class));assertEquals(original,outcome(c));assertEquals(11,balance());
    }
    @Test void malformedAmountsAreQuarantinedWithoutInventingAnOutcome(){
        var zero=command(0);assertFalse(service.receive(target.toString(),wire(zero)));
        var fractional=command(1);data(fractional).put("amount",0.5);assertFalse(service.receive(target.toString(),wire(fractional)));
        var oversizedVersion=command(1);oversizedVersion.put("eventVersion",new java.math.BigInteger("18446744073709551617"));assertFalse(service.receive(target.toString(),wire(oversizedVersion)));
        assertEquals(10,balance());assertEquals(0,db.queryForObject("SELECT count(*) FROM credit_admin_operations",Integer.class));
        assertEquals(3,db.queryForObject("SELECT count(*) FROM credit_admin_quarantine",Integer.class));
    }
    @Test void anEmptyCheckpointCannotHideExistingLedgerEffectsWithoutProducerEvidence(){
        var exports=new com.friendoncampus.credit.service.CreditEvidenceExportService(org.springframework.jdbc.core.simple.JdbcClient.create(db));
        assertEquals(0,exports.read(UUID.randomUUID(),null,100).checkpoint().committedSequence());
        UUID order=UUID.randomUUID();reservations.reserve(UUID.randomUUID(),order,target,1);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->exports.read(order,null,100));
    }
}
