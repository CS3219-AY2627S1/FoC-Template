package com.friendoncampus.user.messaging;

import static org.junit.jupiter.api.Assertions.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.clients.producer.*;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.serialization.StringSerializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.kafka.KafkaContainer;
import com.friendoncampus.user.domain.*;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.service.AdminLifecycleService;
import com.friendoncampus.user.support.JwtTestProperties;
import tools.jackson.databind.json.JsonMapper;

/** Real User listener/domain/outbox and Kafka. Accounts/command publisher are disposable fixtures. */
@SpringBootTest(properties={"app.sanctions.enabled=true","app.events.security-protocol=PLAINTEXT","app.sanctions.outbox-delay=3600000"})
@Testcontainers
class UserSanctionKafkaIntegrationTest {
    @Container static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:16-alpine");
    @Container static KafkaContainer broker=new KafkaContainer("apache/kafka:4.3.1")
            .withEnv("KAFKA_HEAP_OPTS","-Xms128m -Xmx384m").withEnv("KAFKA_OPTS","-XX:ActiveProcessorCount=2").withStartupTimeout(Duration.ofMinutes(3));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r)throws Exception{
        JwtTestProperties.register(r);r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);r.add("app.events.bootstrap-servers",broker::getBootstrapServers);
        try(var admin=AdminClient.create(Map.of("bootstrap.servers",broker.getBootstrapServers()))){admin.createTopics(List.of(new NewTopic("admin.user.commands",3,(short)1),new NewTopic("admin.user.commands.DLT",1,(short)1),new NewTopic("user.admin.events",3,(short)1))).all().get(30,TimeUnit.SECONDS);}
    }
    @Autowired UserRepository users;
    @Autowired AdminLifecycleService lifecycle;
    @Autowired UserSanctionKafka.SanctionTransport transport;
    @Autowired JdbcTemplate db;
    final JsonMapper json=JsonMapper.builder().build();
    User actor,target;
    @BeforeEach void setup(){db.execute("TRUNCATE users,user_sanction_operations,user_sanction_inbox,user_sanction_outbox,user_sanction_quarantine,user_account_audit CASCADE");actor=user(true);target=user(false);}
    User user(boolean admin){String name=UUID.randomUUID().toString().substring(0,12);User value=User.register(name+"@u.nus.edu",name,name,"TEST ONLY");value.activate();if(admin)value.promoteToAdmin();return users.save(value);}
    Map<String,Object> command(UUID target,UUID operation){
        Map<String,Object> e=new LinkedHashMap<>(Map.of("eventId",UUID.randomUUID(),"eventType","AdminUserBanRequested","eventVersion",1,"aggregateType","AdminAction","aggregateId",target,"aggregateVersion",1,"occurredAt",Instant.now().toString(),"producer","admin-service","correlationId",UUID.randomUUID(),"actor",Map.of("type","USER","role","ADMIN","userId",actor.getId())));
        e.put("causationId",null);e.put("data",Map.of("operationId",operation,"caseId",UUID.randomUUID(),"orderId",UUID.randomUUID(),"caseRevision",2,"targetUserId",target,"requestedBy",actor.getId(),"reason","TEST ONLY sanction acceptance"));return e;
    }
    void send(UUID target,String payload)throws Exception{
        // The test publisher represents Admin; User's production principal cannot forge these commands.
        try(var producer=new KafkaProducer<String,String>(Map.of("bootstrap.servers",broker.getBootstrapServers(),"acks","all"),new StringSerializer(),new StringSerializer())){producer.send(new ProducerRecord<>("admin.user.commands",target.toString(),payload)).get(15,TimeUnit.SECONDS);}
    }
    void waitFor(UUID operation,long generation)throws Exception{
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);
        while(System.nanoTime()<end){var rows=db.queryForList("SELECT dispatch_version FROM user_sanction_outbox WHERE operation_id=?",Long.class,operation);if(!rows.isEmpty()&&rows.get(0)>=generation)return;Thread.sleep(100);}fail("User listener did not record the original operation/generation");
    }
    @Test void actualListenerAppliesBanAndReplaysItsOriginalBrokerOutcomeAfterReactivation()throws Exception{
        UUID operation=UUID.randomUUID();String command=json.writeValueAsString(command(target.getId(),operation));send(target.getId(),command);waitFor(operation,1);
        assertEquals(UserStatus.BANNED,users.findById(target.getId()).orElseThrow().getStatus());
        String original=db.queryForObject("SELECT payload FROM user_sanction_operations WHERE operation_id=?",String.class,operation);
        try(var observer=new KafkaConsumer<String,String>(Map.of("bootstrap.servers",broker.getBootstrapServers(),"group.id","TEST-ONLY-"+UUID.randomUUID(),"auto.offset.reset","earliest","enable.auto.commit",false),new StringDeserializer(),new StringDeserializer())){
            observer.subscribe(List.of("user.admin.events"));transport.publish();boolean found=false;long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(!found&&System.nanoTime()<end)for(var record:observer.poll(Duration.ofMillis(200)))if(operation.toString().equals(json.readTree(record.value()).path("data").path("operationId").asText())){assertEquals(original,record.value());found=true;}
            assertTrue(found,"No actual User outcome observed on Kafka");
        }
        lifecycle.reactivate(actor.getId(),target.getId(),"TEST ONLY reviewed appeal");send(target.getId(),command);waitFor(operation,2);
        assertEquals(UserStatus.ACTIVE,users.findById(target.getId()).orElseThrow().getStatus());
        assertEquals(original,db.queryForObject("SELECT payload FROM user_sanction_outbox WHERE operation_id=?",String.class,operation));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM user_account_audit WHERE operation_id=?",Integer.class,operation));
    }
    @Test void realCommandConsumerRejectsSelfSanctionWithoutMutatingTheAdministrator()throws Exception{
        UUID operation=UUID.randomUUID();send(actor.getId(),json.writeValueAsString(command(actor.getId(),operation)));waitFor(operation,1);
        var outcome=json.readTree(db.queryForObject("SELECT payload FROM user_sanction_operations WHERE operation_id=?",String.class,operation));
        assertEquals("SELF_SANCTION_FORBIDDEN",outcome.path("data").path("reasonCode").asText());assertEquals(UserStatus.ACTIVE,users.findById(actor.getId()).orElseThrow().getStatus());
    }
}
