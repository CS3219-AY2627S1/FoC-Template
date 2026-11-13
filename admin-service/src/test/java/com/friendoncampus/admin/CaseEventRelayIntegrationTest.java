package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.clients.producer.*;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.kafka.KafkaContainer;
import tools.jackson.databind.json.JsonMapper;

/** TEST ONLY outbox fixtures in disposable real PostgreSQL/Kafka; no Chat projection claimed. */
@Testcontainers(disabledWithoutDocker=true)
class CaseEventRelayIntegrationTest {
    @Container static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:16-alpine");
    @Container static KafkaContainer broker=new KafkaContainer("apache/kafka:4.3.1")
        .withEnv("KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR","1").withEnv("KAFKA_TRANSACTION_STATE_LOG_MIN_ISR","1");
    static DriverManagerDataSource source;
    static JdbcTemplate db;
    static final JsonMapper json=JsonMapper.builder().build();
    static final UUID actor=UUID.randomUUID();
    static final String transactionId="admin-case-events-integration";
    @BeforeAll static void setup() throws Exception {
        source=new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());db=new JdbcTemplate(source);
        Flyway.configure().dataSource(source).load().migrate();
        try(var admin=AdminClient.create(Map.of("bootstrap.servers",broker.getBootstrapServers()))){
            admin.createTopics(List.of(new NewTopic("admin.events",3,(short)1))).all().get(20,TimeUnit.SECONDS);
        }
    }
    @BeforeEach void clean(){db.execute("TRUNCATE admin_cases CASCADE");}
    Map<String,Object> properties(){
        return Map.of("bootstrap.servers",broker.getBootstrapServers(),"key.serializer",StringSerializer.class,"value.serializer",StringSerializer.class);
    }
    KafkaCaseEventSender sender(){return new KafkaCaseEventSender(properties(),transactionId);}
    CaseEventRelay relay(CaseEventSender sender){return new CaseEventRelay(db,sender,new DataSourceTransactionManager(source),1);}
    String payload(UUID id,UUID event,long seq,String type){
        Map<String,Object> data=new LinkedHashMap<>();data.put("caseId",id);data.put("orderId",id);data.put("sourceSequence",seq);
        UUID owner=UUID.randomUUID();
        if(type.equals("CaseOpened"))data.put("reporterId",actor);
        else if(type.equals("CaseActionCompleted")){
            data.put("operationId",UUID.randomUUID());data.put("ownerEventId",owner);data.put("targetUserId",actor);data.put("result","APPLIED");
        }else data.put("reviewerId",actor);
        if(type.equals("CaseResolved"))data.put("resolvedAt",Instant.now().toString());
        var e=CreditActionService.envelope(event,type,"AdminCase",id,seq,Instant.now(),"admin-service",id,type.equals("CaseActionCompleted")?owner:null,actor,data);
        if(type.equals("CaseOpened"))e.put("actor",Map.of("type","USER","userId",actor,"role","REQUESTER"));
        return json.writeValueAsString(e);
    }
    UUID insert(UUID id,long seq,String type){return insert(db,id,seq,type,null);}
    UUID insert(JdbcTemplate target,UUID id,long seq,String type,String override){
        target.update("INSERT INTO admin_cases(id,order_id,correlation_id,state,reviewer_id,revision,source_sequence) VALUES (?,?,?,'UNDER_REVIEW',?,4,4) ON CONFLICT DO NOTHING",id,id,id,actor);
        UUID event=UUID.randomUUID();String wire=override==null?payload(id,event,seq,type):override;
        target.update("INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES (?,?,?,?, 'admin.events',?,clock_timestamp())",event,id,seq,type,wire);
        return event;
    }
    List<ConsumerRecord<String,String>> records(UUID id,int count){
        var props=new HashMap<String,Object>();props.put("bootstrap.servers",broker.getBootstrapServers());props.put("group.id","test-only-"+UUID.randomUUID());
        props.put("enable.auto.commit",false);props.put("isolation.level","read_committed");props.put("auto.offset.reset","earliest");
        try(var consumer=new KafkaConsumer<String,String>(props,new StringDeserializer(),new StringDeserializer())){
            var partitions=List.of(new TopicPartition("admin.events",0),new TopicPartition("admin.events",1),new TopicPartition("admin.events",2));
            consumer.assign(partitions);consumer.seekToBeginning(partitions);
            List<ConsumerRecord<String,String>> found=new ArrayList<>();long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(found.size()<count&&System.nanoTime()<end)for(var record:consumer.poll(Duration.ofMillis(250)))if(record.key().equals(id.toString()))found.add(record);
            assertEquals(count,found.size());return found;
        }
    }
    @Test void publishesAllStoredTypesInCaseOrderWithoutChangingIdentityOrPayload(){
        UUID id=UUID.randomUUID();List<UUID> events=new ArrayList<>();long seq=1;
        for(String type:List.of("CaseOpened","CaseClaimed","CaseActionCompleted","CaseResolved"))events.add(insert(id,seq++,type));
        var relay=relay(sender());for(int n=0;n<4;n++)assertEquals(CaseEventRelay.Result.SENT,relay.publishOnce());
        assertEquals(CaseEventRelay.Result.IDLE,relay.publishOnce());
        var received=records(id,4);
        for(int n=0;n<4;n++){
            assertEquals(events.get(n).toString(),json.readTree(received.get(n).value()).path("eventId").asText());
            assertEquals(n+1,json.readTree(received.get(n).value()).path("data").path("sourceSequence").asLong());
            assertEquals(db.queryForObject("SELECT payload FROM admin_case_outbox WHERE event_id=?",String.class,events.get(n)),received.get(n).value());
            assertEquals(received.get(0).partition(),received.get(n).partition());
        }
        assertEquals(4,db.queryForObject("SELECT count(*) FROM admin_case_outbox WHERE published_at IS NOT NULL",Integer.class));
        assertThrows(RuntimeException.class,()->db.update("UPDATE admin_case_outbox SET payload='{}' WHERE event_id=?",events.get(0)));
    }
    @Test void lostDatabaseCommitReplaysOriginalEventBeforeTheNextAfterRestart(){
        UUID id=UUID.randomUUID();UUID first=insert(id,1,"CaseOpened"),second=insert(id,2,"CaseClaimed");
        db.execute("ALTER TABLE admin_case_outbox ADD CONSTRAINT test_lost_mark CHECK (published_at IS NULL) NOT VALID");
        try{assertThrows(RuntimeException.class,()->relay(sender()).publishOnce());}
        finally{db.execute("ALTER TABLE admin_case_outbox DROP CONSTRAINT test_lost_mark");}
        assertEquals(0,db.queryForObject("SELECT count(*) FROM admin_case_outbox WHERE published_at IS NOT NULL",Integer.class));
        var restarted=relay(sender());assertEquals(CaseEventRelay.Result.SENT,restarted.publishOnce());assertEquals(CaseEventRelay.Result.SENT,restarted.publishOnce());
        assertEquals(List.of(first.toString(),first.toString(),second.toString()),records(id,3).stream().map(r->json.readTree(r.value()).path("eventId").asText()).toList());
    }
    @Test void concurrentPublishersCannotOvertakeAndDoNotLockBusinessCases() throws Exception {
        UUID id=UUID.randomUUID();insert(id,1,"CaseOpened");insert(id,2,"CaseClaimed");
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var real=sender();
        var first=relay((c,p,lease)->{entered.countDown();try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException();}catch(InterruptedException e){throw new IllegalStateException(e);}real.send(c,p,lease);});
        var pool=Executors.newSingleThreadExecutor();
        try{
            var work=pool.submit(first::publishOnce);assertTrue(entered.await(5,TimeUnit.SECONDS));
            assertEquals(CaseEventRelay.Result.BUSY,relay(sender()).publishOnce());
            assertEquals(1,db.update("UPDATE admin_cases SET revision=revision+1 WHERE id=?",id));
            release.countDown();assertEquals(CaseEventRelay.Result.SENT,work.get(25,TimeUnit.SECONDS));
            assertEquals(CaseEventRelay.Result.SENT,relay(sender()).publishOnce());assertEquals(2,records(id,2).size());
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void replacementEpochFencesLateProducerAndReadCommittedHidesItsUncommittedRecord() throws Exception {
        UUID id=UUID.randomUUID();UUID event=insert(id,1,"CaseOpened");insert(id,2,"CaseClaimed");
        var settings=new HashMap<>(properties());settings.put("transactional.id",transactionId);settings.put("max.block.ms",5000);
        try(var stale=new KafkaProducer<String,String>(settings)){
            stale.initTransactions();stale.beginTransaction();
            stale.send(new ProducerRecord<>("admin.events",id.toString(),db.queryForObject("SELECT payload FROM admin_case_outbox WHERE event_id=?",String.class,event))).get(10,TimeUnit.SECONDS);
            assertEquals(CaseEventRelay.Result.SENT,relay(sender()).publishOnce());
            assertThrows(RuntimeException.class,stale::commitTransaction);
            assertEquals(CaseEventRelay.Result.SENT,relay(sender()).publishOnce());
            assertEquals(List.of(1L,2L),records(id,2).stream().map(r->json.readTree(r.value()).path("data").path("sourceSequence").asLong()).toList());
        }
    }
    @Test void brokerOutagePreservesPendingAndRecoveryUsesOriginalEvent() throws Exception {
        UUID id=UUID.randomUUID();UUID event=insert(id,1,"CaseOpened");
        var docker= DockerClientFactory.instance().client();docker.pauseContainerCmd(broker.getContainerId()).exec();
        try{assertEquals(CaseEventRelay.Result.FAILED,relay(sender()).publishOnce());}
        finally{docker.unpauseContainerCmd(broker.getContainerId()).exec();}
        assertNull(db.queryForObject("SELECT published_at FROM admin_case_outbox WHERE event_id=?",Object.class,event));
        assertEquals("BROKER_UNCONFIRMED",db.queryForObject("SELECT last_error FROM admin_case_outbox WHERE event_id=?",String.class,event));
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(40);CaseEventRelay.Result recovered;
        do {
            db.update("UPDATE admin_case_outbox SET next_attempt_at=clock_timestamp() WHERE event_id=?",event);
            recovered=relay(sender()).publishOnce();
            if(recovered==CaseEventRelay.Result.SENT)break;
            Thread.sleep(1000); // Unpause is not the same as coordinator readiness.
        }while(System.nanoTime()<deadline);
        assertEquals(CaseEventRelay.Result.SENT,recovered);
        assertEquals(event.toString(),json.readTree(records(id,1).get(0).value()).path("eventId").asText());
    }
    @Test void workerResumingAfterLostDatabaseLockCannotPublishWithANewerEpoch() throws Exception {
        UUID id=UUID.randomUUID();insert(id,1,"CaseOpened");insert(id,2,"CaseClaimed");
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        var backend=new java.util.concurrent.atomic.AtomicInteger();
        var suspended=relay((c,p,lease)->{
            backend.set(db.queryForObject("SELECT pg_backend_pid()",Integer.class));entered.countDown();
            try{if(!release.await(20,TimeUnit.SECONDS))throw new IllegalStateException();}
            catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
            sender().send(c,p,lease);
        });
        var pool=Executors.newSingleThreadExecutor();
        try{
            var work=pool.submit(suspended::publishOnce);assertTrue(entered.await(5,TimeUnit.SECONDS));
            assertEquals(Boolean.TRUE,db.queryForObject("SELECT pg_terminate_backend(?)",Boolean.class,backend.get()));
            assertEquals(CaseEventRelay.Result.SENT,relay(sender()).publishOnce());
            assertEquals(CaseEventRelay.Result.SENT,relay(sender()).publishOnce());
            release.countDown();assertThrows(ExecutionException.class,()->work.get(15,TimeUnit.SECONDS));
            assertEquals(List.of(1L,2L),records(id,2).stream().map(r->json.readTree(r.value()).path("data").path("sourceSequence").asLong()).toList());
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void gapsAndMalformedBacklogBlockOnlyTheirCase() {
        UUID gap=UUID.randomUUID();UUID missing=insert(gap,2,"CaseClaimed");
        List<String> sent=new ArrayList<>();var relay=new CaseEventRelay(db,(c,p,lease)->{lease.run();sent.add(p);},new DataSourceTransactionManager(source),3600);
        assertEquals(CaseEventRelay.Result.BLOCKED,relay.publishOnce());
        assertEquals("SOURCE_SEQUENCE_GAP",db.queryForObject("SELECT last_error FROM admin_case_outbox WHERE event_id=?",String.class,missing));
        UUID good=UUID.randomUUID();insert(good,1,"CaseOpened");assertEquals(CaseEventRelay.Result.SENT,relay.publishOnce());
        UUID bad=UUID.randomUUID();UUID invalid=insert(db,bad,1,"CaseOpened","{}");insert(bad,2,"CaseClaimed");
        assertEquals(CaseEventRelay.Result.BLOCKED,relay.publishOnce());assertEquals(CaseEventRelay.Result.IDLE,relay.publishOnce());assertEquals(1,sent.size());
        assertEquals("INVALID_STORED_EVENT",db.queryForObject("SELECT last_error FROM admin_case_outbox WHERE event_id=?",String.class,invalid));
    }
    @Test void migrationIncludesOldPendingRowsAndPreservesConfirmedRows(){
        String schema="legacy_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);
        var legacy=new DriverManagerDataSource(postgres.getJdbcUrl()+(postgres.getJdbcUrl().contains("?")?"&":"?")+"currentSchema="+schema,postgres.getUsername(),postgres.getPassword());
        Flyway.configure().dataSource(legacy).defaultSchema(schema).target("7").load().migrate();
        var old=new JdbcTemplate(legacy);UUID id=UUID.randomUUID();UUID first=insert(old,id,1,"CaseOpened",null),second=insert(old,id,2,"CaseClaimed",null);
        old.update("UPDATE admin_case_outbox SET published_at=clock_timestamp() WHERE event_id=?",first);
        Flyway.configure().dataSource(legacy).defaultSchema(schema).load().migrate();
        var relay=new CaseEventRelay(old,new KafkaCaseEventSender(properties(),"admin-case-events-legacy"),new DataSourceTransactionManager(legacy),1);
        assertEquals(CaseEventRelay.Result.SENT,relay.publishOnce());assertEquals(CaseEventRelay.Result.IDLE,relay.publishOnce());
        assertEquals(second.toString(),json.readTree(records(id,1).get(0).value()).path("eventId").asText());
        assertEquals(0L,old.queryForObject("SELECT attempts FROM admin_case_outbox WHERE event_id=?",Long.class,first));
    }
}
