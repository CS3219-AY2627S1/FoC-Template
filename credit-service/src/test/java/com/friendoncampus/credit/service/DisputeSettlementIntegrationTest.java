package com.friendoncampus.credit.service;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;

@SpringBootTest(properties={"app.kafka.enabled=false"})
@Testcontainers
class DisputeSettlementIntegrationTest {
 @Container static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:17-alpine");
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);}
 @Autowired DisputeSettlementService disputes;
 @Autowired InitialCreditAllocationService allocations;
 @Autowired CreditReservationService reservations;
 @Autowired JdbcTemplate db;
 UUID account(){UUID id=UUID.randomUUID();allocations.allocate(UUID.randomUUID(),id);return id;}
 int balance(UUID id,String column){return db.queryForObject("SELECT "+column+" FROM credit_accounts WHERE user_id=?",Integer.class,id);}
 @Test void returningHoldHasOneEffectAndBodyBoundOriginalReceipt(){
  UUID requester=account(),courier=account(),order=UUID.randomUUID(),caseId=UUID.randomUUID(),op=UUID.randomUUID(),admin=UUID.randomUUID();
  reservations.reserve(UUID.randomUUID(),order,requester,4);
  String first=disputes.settle(op,caseId,order,admin,requester,courier,"RETURN_TO_REQUESTER");
  assertThat(disputes.settle(op,caseId,order,admin,requester,courier,"RETURN_TO_REQUESTER")).isEqualTo(first);
  assertThat(balance(requester,"available_balance")).isEqualTo(10);assertThat(balance(requester,"reserved_balance")).isZero();
  assertThat(db.queryForObject("SELECT count(*) FROM credit_ledger_entries WHERE operation_id=?",Integer.class,op)).isEqualTo(1);
  assertThat(db.queryForObject("SELECT count(*) FROM credit_outbox_events WHERE payload_json::jsonb->>'operationId'=?",Integer.class,op.toString())).isEqualTo(1);
  assertThatThrownBy(()->disputes.settle(op,caseId,order,admin,requester,UUID.randomUUID(),"RETURN_TO_REQUESTER")).isInstanceOf(ResponseStatusException.class);
  assertThatThrownBy(()->disputes.settle(UUID.randomUUID(),caseId,order,admin,requester,courier,"RETURN_TO_REQUESTER")).isInstanceOf(ResponseStatusException.class);
 }
 @Test void payingCourierSettlesReservedBalanceAndCannotKeepAnActiveHold(){
  UUID requester=account(),courier=account(),order=UUID.randomUUID(),caseId=UUID.randomUUID(),op=UUID.randomUUID(),admin=UUID.randomUUID();
  reservations.reserve(UUID.randomUUID(),order,requester,4);
  assertThatThrownBy(()->disputes.settle(op,caseId,order,admin,requester,courier,"KEEP_EXISTING")).isInstanceOf(ResponseStatusException.class);
  assertThat(balance(requester,"reserved_balance")).isEqualTo(4);
  disputes.settle(op,caseId,order,admin,requester,courier,"PAY_COURIER");
  assertThat(balance(requester,"reserved_balance")).isZero();assertThat(balance(courier,"available_balance")).isEqualTo(14);
  assertThat(db.queryForObject("SELECT count(*) FROM credit_ledger_entries WHERE operation_id=?",Integer.class,op)).isEqualTo(2);
 }
 @Test void receiptFailureRollsBackTheFinancialEffectAndOutbox(){
  UUID requester=account(),order=UUID.randomUUID(),caseId=UUID.randomUUID(),op=UUID.randomUUID(),admin=UUID.randomUUID();
  reservations.reserve(UUID.randomUUID(),order,requester,4);
  db.execute("ALTER TABLE credit_dispute_receipts ADD CONSTRAINT test_receipt_failure CHECK(false) NOT VALID");
  try{assertThatThrownBy(()->disputes.settle(op,caseId,order,admin,requester,null,"RETURN_TO_REQUESTER")).isInstanceOf(RuntimeException.class);}
  finally{db.execute("ALTER TABLE credit_dispute_receipts DROP CONSTRAINT test_receipt_failure");}
  assertThat(balance(requester,"available_balance")).isEqualTo(6);assertThat(balance(requester,"reserved_balance")).isEqualTo(4);
  assertThat(db.queryForObject("SELECT count(*) FROM credit_ledger_entries WHERE operation_id=?",Integer.class,op)).isZero();
  assertThat(db.queryForObject("SELECT count(*) FROM credit_outbox_events WHERE payload_json::jsonb->>'operationId'=?",Integer.class,op.toString())).isZero();
 }
}
