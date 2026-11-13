package com.friendoncampus.user.messaging;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.friendoncampus.user.domain.*;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.service.*;
import com.friendoncampus.user.support.JwtTestProperties;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@Testcontainers(disabledWithoutDocker=true)
class UserSanctionIntegrationTest {
    static { System.setProperty("api.version","1.44"); }
    @Container static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        JwtTestProperties.register(r);
        r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);
    }
    @Autowired UserSanctionService sanctions;
    @Autowired UserSanctionOutbox outbox;
    @Autowired AdminLifecycleService lifecycle;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    final JsonMapper json=JsonMapper.builder().build();
    User actor,target;
    @BeforeEach void setup() {
        db.execute("TRUNCATE users,user_sanction_operations,user_sanction_inbox,user_sanction_outbox,user_sanction_quarantine,user_account_audit CASCADE");
        actor=user(true);target=user(false);
    }
    User user(boolean admin) {String name=UUID.randomUUID().toString().substring(0,12);User u=User.register(name+"@u.nus.edu",name,name,"hash");u.activate();if(admin)u.promoteToAdmin();return users.save(u);}
    Map<String,Object> command(UUID actor,UUID target) {
        return new LinkedHashMap<>(Map.ofEntries(
            Map.entry("eventId",UUID.randomUUID()),Map.entry("eventType","AdminUserBanRequested"),Map.entry("eventVersion",1),
            Map.entry("aggregateType","AdminAction"),Map.entry("aggregateId",target),Map.entry("aggregateVersion",1),
            Map.entry("occurredAt",Instant.now().toString()),Map.entry("producer","admin-service"),Map.entry("correlationId",UUID.randomUUID()),
            Map.entry("actor",Map.of("type","USER","role","ADMIN","userId",actor)),
            Map.entry("data",new LinkedHashMap<>(Map.of("operationId",UUID.randomUUID(),"caseId",UUID.randomUUID(),"orderId",UUID.randomUUID(),"caseRevision",1,"targetUserId",target,"requestedBy",actor,"reason","TEST ONLY reviewed case")))));
    }
    String wire(Map<String,Object> c) {c.put("causationId",null);return json.writeValueAsString(c);}
    @SuppressWarnings("unchecked") UUID op(Map<String,Object> c) {return (UUID)((Map<String,Object>)c.get("data")).get("operationId");}
    String result(Map<String,Object> c,String field) {return json.readTree(db.queryForObject("SELECT payload FROM user_sanction_operations WHERE operation_id=?",String.class,op(c))).path("data").path(field).asText();}
    @Test void duplicateAfterReactivationRepublishesOriginalOutcomeWithoutRebanning() {
        var c=command(actor.getId(),target.getId());String original=wire(c);
        assertTrue(sanctions.receive(target.getId().toString(),original));assertEquals(UserStatus.BANNED,users.findById(target.getId()).orElseThrow().getStatus());
        String outcome=db.queryForObject("SELECT payload FROM user_sanction_operations WHERE operation_id=?",String.class,op(c));
        var first=outbox.claim().get(0);outbox.confirmed(first);
        lifecycle.reactivate(actor.getId(),target.getId(),"TEST ONLY appeal reviewed");
        assertTrue(sanctions.receive(target.getId().toString(),original));
        assertEquals(UserStatus.ACTIVE,users.findById(target.getId()).orElseThrow().getStatus());
        assertEquals(outcome,outbox.claim().get(0).payload());
        assertEquals(1,db.queryForObject("SELECT count(*) FROM user_account_audit WHERE operation_id=?",Integer.class,op(c)));
        assertEquals("APPLIED",result(c,"result"));
    }
    @Test void oversizedWireVersionCannotWrapAroundToTheSupportedVersion(){
        var c=command(actor.getId(),target.getId());c.put("eventVersion",new java.math.BigInteger("18446744073709551617"));
        assertFalse(sanctions.receive(target.getId().toString(),wire(c)));
        assertEquals(UserStatus.ACTIVE,users.findById(target.getId()).orElseThrow().getStatus());
        assertEquals(0,db.queryForObject("SELECT count(*) FROM user_sanction_operations",Integer.class));
    }
    @Test void noChangeAndBusinessRejectionsAreDurableAndSelfAccessIsProtected() {
        var self=command(actor.getId(),actor.getId());sanctions.receive(actor.getId().toString(),wire(self));
        assertEquals("SELF_SANCTION_FORBIDDEN",result(self,"reasonCode"));
        assertEquals(UserStatus.ACTIVE,users.findById(actor.getId()).orElseThrow().getStatus());
        lifecycle.ban(actor.getId(),target.getId());var c=command(actor.getId(),target.getId());sanctions.receive(target.getId().toString(),wire(c));
        assertEquals("NO_CHANGE",result(c,"result"));assertEquals("BANNED",result(c,"previousStatus"));
        User stale=user(true);lifecycle.demote(actor.getId(),stale.getId());
        var rejected=command(stale.getId(),target.getId());String request=wire(rejected);sanctions.receive(target.getId().toString(),request);
        assertEquals("ACTOR_NOT_AUTHORIZED",result(rejected,"reasonCode"));
        sanctions.receive(target.getId().toString(),request);assertEquals("REJECTED",result(rejected,"result"));
    }
    @Test void conflictingAndForgedInputsCannotChangeAccountOrStoredResult() {
        var c=command(actor.getId(),target.getId());String original=wire(c);assertTrue(sanctions.receive(target.getId().toString(),original));
        assertFalse(sanctions.receive(UUID.randomUUID().toString(),original));
        c.put("producer","credit-service");assertFalse(sanctions.receive(target.getId().toString(),wire(c)));
        c.put("producer","admin-service");c.put("eventId",UUID.randomUUID());
        @SuppressWarnings("unchecked") var data=(Map<String,Object>)c.get("data");data.put("reason","Different operation input");
        assertFalse(sanctions.receive(target.getId().toString(),wire(c)));
        assertEquals("APPLIED",result(c,"result"));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM user_account_audit WHERE operation_id=?",Integer.class,op(c)));
    }
    @Test void auditFailureRollsBackEffectInboxOperationAndOutboxTogether() {
        var c=command(actor.getId(),target.getId());
        db.execute("ALTER TABLE user_account_audit ADD CONSTRAINT test_unavailable_audit CHECK (false) NOT VALID");
        try { assertThrows(RuntimeException.class,()->sanctions.receive(target.getId().toString(),wire(c))); }
        finally { db.execute("ALTER TABLE user_account_audit DROP CONSTRAINT test_unavailable_audit"); }
        assertEquals(UserStatus.ACTIVE,users.findById(target.getId()).orElseThrow().getStatus());
        assertEquals(0,db.queryForObject("SELECT count(*) FROM user_sanction_operations",Integer.class));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM user_sanction_inbox",Integer.class));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM user_sanction_outbox",Integer.class));
    }
    @Test void replayDuringInFlightPublishCannotBeLostByOldAcknowledgment() {
        var c=command(actor.getId(),target.getId());String request=wire(c);sanctions.receive(target.getId().toString(),request);
        var delivery=outbox.claim().get(0);sanctions.receive(target.getId().toString(),request);outbox.confirmed(delivery);
        assertEquals(1,db.queryForObject("SELECT count(*) FROM user_sanction_outbox WHERE published_at IS NULL",Integer.class));
        db.update("UPDATE user_sanction_outbox SET lease_until=CURRENT_TIMESTAMP-INTERVAL '1 second'");
        var retry=outbox.claim().get(0);assertEquals(delivery.payload(),retry.payload());outbox.confirmed(retry);
        assertEquals(0,db.queryForObject("SELECT count(*) FROM user_sanction_outbox WHERE published_at IS NULL",Integer.class));
    }
    @Test void concurrentCrossBansPreserveAnActiveAdministrator() throws Exception {
        User second=user(true);var a=command(actor.getId(),second.getId());var b=command(second.getId(),actor.getId());
        var pool=Executors.newFixedThreadPool(2);
        try {
            var x=pool.submit(()->sanctions.receive(second.getId().toString(),wire(a)));
            var y=pool.submit(()->sanctions.receive(actor.getId().toString(),wire(b)));
            assertTrue(x.get(15,TimeUnit.SECONDS));assertTrue(y.get(15,TimeUnit.SECONDS));
            assertEquals(1,users.countByRolesContainingAndStatus(UserRole.ADMIN,UserStatus.ACTIVE));
            assertEquals(Set.of("APPLIED","REJECTED"),Set.of(result(a,"result"),result(b,"result")));
        } finally {pool.shutdownNow();}
    }

    @Test void aConcurrentProfileEditCannotUndoACommittedBan() throws Exception {
        var loaded=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newSingleThreadExecutor();
        try {
            var profile=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactions).execute(s->{
                User stale=users.findById(target.getId()).orElseThrow();loaded.countDown();
                try {if(!release.await(15,TimeUnit.SECONDS))throw new IllegalStateException("Profile fixture timed out");}
                catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IllegalStateException(ex);}
                stale.changeUsername("ReviewedProfile","reviewedprofile");return users.save(stale).getId();
            }));
            assertTrue(loaded.await(10,TimeUnit.SECONDS));
            var c=command(actor.getId(),target.getId());assertTrue(sanctions.receive(target.getId().toString(),wire(c)));
            release.countDown();profile.get(15,TimeUnit.SECONDS);
            User stored=users.findById(target.getId()).orElseThrow();assertEquals("ReviewedProfile",stored.getUsername());
            assertEquals(UserStatus.BANNED,stored.getStatus());
        } finally {release.countDown();pool.shutdownNow();}
    }
}
