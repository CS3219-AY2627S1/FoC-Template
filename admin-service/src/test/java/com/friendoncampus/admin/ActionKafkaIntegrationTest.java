package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.kafka.KafkaContainer;
import tools.jackson.databind.json.JsonMapper;

/** Real broker/DB transport with TEST-ONLY Credit/User outcomes, not owner domain acceptance. */
@SpringBootTest(properties={"app.kafka.enabled=true","app.case-events.initial-delay=3600000","app.kafka.outbox-delay=3600000"})
@Testcontainers(disabledWithoutDocker=true)
class ActionKafkaIntegrationTest {
    @Container static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:16-alpine");
    @Container static KafkaContainer broker=new KafkaContainer("apache/kafka:4.3.1");
    @DynamicPropertySource static void setup(DynamicPropertyRegistry r)throws Exception{
        r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);
        r.add("spring.kafka.bootstrap-servers",broker::getBootstrapServers);
        try(var admin=AdminClient.create(Map.of("bootstrap.servers",broker.getBootstrapServers()))){
            admin.createTopics(List.of(new NewTopic("admin.credit.commands",1,(short)1),new NewTopic("admin.user.commands",1,(short)1),new NewTopic("credit.admin.events",1,(short)1),new NewTopic("credit.admin.events.DLT",1,(short)1),new NewTopic("user.admin.events",1,(short)1),new NewTopic("user.admin.events.DLT",1,(short)1))).all().get(15,TimeUnit.SECONDS);
        }
    }
    @Autowired CreditActionService actions;@Autowired ActionKafkaTransport transport;@Autowired JdbcTemplate db;@Autowired KafkaTemplate<String,String> kafka;
    @MockitoBean UserEligibilityClient users;
    @MockitoBean ChatTimelineClient timelines;
    final JsonMapper json=JsonMapper.builder().build();
    @BeforeEach void clearTestRows(){
        db.execute("TRUNCATE admin_cases CASCADE");
        // Explicit test-owned complete history; broker and database remain real.
        when(timelines.fetch(any(),any(),anyString(),isNull(),eq(100))).thenAnswer(call->{
            UUID id=call.getArgument(0), order=call.getArgument(1);
            UUID requester=db.queryForObject("SELECT reporter_id FROM admin_statements WHERE case_id=?",UUID.class,id);
            var e=(tools.jackson.databind.node.ObjectNode)json.readTree(EvidenceFixtures.serialize(EvidenceFixtures.timeline())
                .replace(EvidenceFixtures.CASE.toString(),id.toString()).replace(EvidenceFixtures.ORDER.toString(),order.toString()).replace(EvidenceFixtures.ACTOR.toString(),requester.toString()));
            ((tools.jackson.databind.node.ObjectNode)e.path("coverage")).put("asOf",Instant.now().toString());
            for(var cp:e.path("coverage").path("checkpoints"))((tools.jackson.databind.node.ObjectNode)cp).put("checkedAt",Instant.now().toString());
            return e;
        });
    }
    @Test void banCommandsAndUserOutcomeInboxStillUseTheirSeparateTransport() throws Exception {
        UUID caseId=UUID.randomUUID(),order=UUID.randomUUID(),target=UUID.randomUUID(),actor=UUID.randomUUID();
        when(users.find(any())).thenAnswer(call->new UserEligibilityClient.Eligibility(call.getArgument(0),true,true));
        db.update("INSERT INTO admin_cases(id,order_id,state,reviewer_id,revision) VALUES (?,?,'UNDER_REVIEW',?,1)",caseId,order,actor);
        db.update("INSERT INTO admin_case_participants(case_id,user_id) VALUES (?,?)",caseId,target);
        db.update("INSERT INTO admin_statements(case_id,reporter_id,description,submitted_at,eligibility_revision) VALUES (?,?,'TEST ONLY',CURRENT_TIMESTAMP,'TEST-ONLY')",caseId,target);
        var jwt=Jwt.withTokenValue("test-only").header("alg","RS256").subject(actor.toString()).claim("role","ADMIN").build();
        var accepted=actions.create(jwt,caseId,UUID.randomUUID(),"BAN",target,null,"TEST ONLY command regression");
        UUID operation=UUID.fromString(json.readTree(accepted.body()).path("operationId").asText());
        try(var consumer=new KafkaConsumer<String,String>(Map.of("bootstrap.servers",broker.getBootstrapServers(),"group.id","test-only-ban-observer","auto.offset.reset","earliest","enable.auto.commit",false),new StringDeserializer(),new StringDeserializer())){
            consumer.subscribe(List.of("admin.user.commands"));transport.publish();var first=next(consumer);
            assertEquals(target.toString(),first.key());var command=json.readTree(first.value());
            assertEquals("AdminUserBanRequested",command.path("eventType").asText());
            Map<String,Object> data=new LinkedHashMap<>();data.put("operationId",operation);data.put("caseId",caseId);data.put("orderId",order);data.put("targetUserId",target);data.put("requestedBy",actor);data.put("completedAt",Instant.now());data.put("result","REJECTED");data.put("reasonCode","LAST_ADMIN_PROTECTED");
            var outcome=CreditActionService.envelope(UUID.randomUUID(),"AdminUserBanRejected","AdminAction",target,1,Instant.now(),"user-service",UUID.fromString(command.path("correlationId").asText()),UUID.fromString(command.path("eventId").asText()),actor,data);
            // Test-only owner result, not an actual User account mutation.
            String wire=json.writeValueAsString(outcome);kafka.send("user.admin.events",target.toString(),wire).get(15,TimeUnit.SECONDS);kafka.send("user.admin.events",target.toString(),wire).get(15,TimeUnit.SECONDS);
            long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(!"REJECTED".equals(actions.read(jwt,caseId,operation).status())&&System.nanoTime()<end)Thread.sleep(100);
            assertEquals("REJECTED",actions.read(jwt,caseId,operation).status());assertEquals("LAST_ADMIN_PROTECTED",actions.read(jwt,caseId,operation).reasonCode());
            assertEquals(1,db.queryForObject("SELECT count(*) FROM admin_action_inbox",Integer.class));
        }
    }
    @Test void originalCommandIsRedeliveredAndOnlyValidatedOwnerOutcomeFinishesAction()throws Exception{
        assertFalse(kafka.isTransactional(),"Lifecycle transactions must not change command producer semantics");
        UUID caseId=UUID.randomUUID(),order=UUID.randomUUID(),target=UUID.randomUUID(),actor=UUID.randomUUID();
        when(users.find(any())).thenAnswer(call->new UserEligibilityClient.Eligibility(call.getArgument(0),true,true));
        db.update("INSERT INTO admin_cases(id,order_id,state,reviewer_id,revision) VALUES (?,?,'UNDER_REVIEW',?,1)",caseId,order,actor);
        db.update("INSERT INTO admin_case_participants(case_id,user_id) VALUES (?,?)",caseId,target);
        db.update("INSERT INTO admin_statements(case_id,reporter_id,description,submitted_at,eligibility_revision) VALUES (?,?,'TEST ONLY',CURRENT_TIMESTAMP,'TEST-ONLY')",caseId,target);
        var jwt=Jwt.withTokenValue("test-only").header("alg","RS256").subject(actor.toString()).claim("role","ADMIN").build();
        var accepted=actions.create(jwt,caseId,UUID.randomUUID(),"CREDIT_ADJUSTMENT",target,json.valueToTree(-5),"TEST ONLY wire verification");
        UUID operation=UUID.fromString(json.readTree(accepted.body()).path("operationId").asText());
        try(var consumer=new KafkaConsumer<String,String>(Map.of("bootstrap.servers",broker.getBootstrapServers(),"group.id","test-only-command-observer","auto.offset.reset","earliest","enable.auto.commit",false),new StringDeserializer(),new StringDeserializer())){
            consumer.subscribe(List.of("admin.credit.commands"));transport.publish();var first=next(consumer);
            assertEquals(target.toString(),first.key());assertEquals("PENDING",actions.read(jwt,caseId,operation).status());
            db.update("UPDATE admin_actions SET deadline_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE operation_id=?",operation);
            db.update("UPDATE admin_action_outbox SET next_attempt_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE operation_id=?",operation);
            transport.publish();var second=next(consumer);assertEquals(first.value(),second.value());assertEquals("UNKNOWN",actions.read(jwt,caseId,operation).status());
            var command=json.readTree(first.value());Map<String,Object> data=new LinkedHashMap<>();
            data.put("operationId",operation);data.put("caseId",caseId);data.put("orderId",order);data.put("targetUserId",target);data.put("requestedBy",actor);data.put("amount",-5);data.put("completedAt",Instant.now());data.put("result","REJECTED");data.put("reasonCode","INSUFFICIENT_AVAILABLE_CREDITS");
            var outcome=CreditActionService.envelope(UUID.randomUUID(),"AdminCreditCorrectionRejected","AdminAction",target,1,Instant.now(),"credit-service",UUID.fromString(command.path("correlationId").asText()),UUID.fromString(command.path("eventId").asText()),actor,data);
            String wire=json.writeValueAsString(outcome);kafka.send("credit.admin.events",target.toString(),wire).get(15,TimeUnit.SECONDS);kafka.send("credit.admin.events",target.toString(),wire).get(15,TimeUnit.SECONDS);
            long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(!"REJECTED".equals(actions.read(jwt,caseId,operation).status())&&System.nanoTime()<end)Thread.sleep(100);
            assertEquals("REJECTED",actions.read(jwt,caseId,operation).status());assertEquals(1,db.queryForObject("SELECT count(*) FROM admin_action_inbox",Integer.class));
            assertEquals(1,db.queryForObject("SELECT count(*) FROM admin_case_outbox WHERE event_type='CaseActionCompleted'",Integer.class));
            assertEquals("INSUFFICIENT_AVAILABLE_CREDITS",actions.read(jwt,caseId,operation).reasonCode());
        }
    }
    private ConsumerRecord<String,String> next(KafkaConsumer<String,String> consumer){long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);while(System.nanoTime()<end){var records=consumer.poll(Duration.ofMillis(250));if(!records.isEmpty())return records.iterator().next();}throw new AssertionError("No command received");}
}
