package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.friendoncampus.order.domain.*;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties={"app.orders.expiry.enabled=false","app.kafka.enabled=false","app.kafka.lifecycle-events.enabled=true"})
@Testcontainers
class DisputeReviewIntegrationTest {
 @Container @ServiceConnection static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:17-alpine");
 @MockitoBean JwtDecoder jwt;
 @Autowired OrderService orders;
 @Autowired DisputeReviewService reviews;
 @Autowired JdbcTemplate db;
 @Autowired OrderQueryService queries;
 final UUID requester=UUID.randomUUID(),courier=UUID.randomUUID();
 DisputeReviewService.Review finish(UUID id,UUID caseId,UUID operation,String disposition,String creditStatus){reviews.prepare(id,caseId,operation,disposition,UUID.randomUUID());return reviews.complete(id,caseId,operation,disposition,creditStatus);}
 UUID accepted(){
  UUID id=orders.createOrder(new CreateOrderCommand(requester,"TEST ONLY","Original issue",UUID.randomUUID(),"A",UUID.randomUUID(),"B",2,OffsetDateTime.now(ZoneOffset.UTC).plusDays(1))).getId();
  orders.confirmReservation(id,UUID.randomUUID());orders.accept(id,courier);return id;
 }
 @Test void freezeBlocksLifecycleAndResolutionFinishesHalfwayWithoutOrdinaryPayout(){
  UUID id=accepted(),caseId=UUID.randomUUID(),operation=UUID.randomUUID();
  assertThat(reviews.freeze(id,caseId,courier,false).participants()).contains(requester,courier);
  assertThat(reviews.freeze(id,caseId,requester,false).state()).isEqualTo("ACCEPTED");
  assertThatThrownBy(()->orders.pickUp(id,courier)).isInstanceOf(ResponseStatusException.class);
  assertThatThrownBy(()->orders.cancel(id,requester)).isInstanceOf(ResponseStatusException.class);
  assertThat(finish(id,caseId,operation,"RETURN_TO_REQUESTER","RELEASED").resolved()).isTrue();
  assertThat(finish(id,caseId,operation,"RETURN_TO_REQUESTER","RELEASED").state()).isEqualTo("COMPLETED");
  assertThat(db.queryForObject("SELECT terminal_reason FROM orders WHERE id=?",String.class,id)).isEqualTo("DISPUTE_RESOLVED");
  assertThat(db.queryForObject("SELECT count(*) FROM order_transitions WHERE order_id=? AND action='DISPUTE_RESOLVED'",Integer.class,id)).isEqualTo(1);
  assertThat(db.queryForObject("SELECT count(*) FROM outbox_events WHERE aggregate_id=? AND event_type='OrderCompleted'",Integer.class,id)).isZero();
  assertThatThrownBy(()->orders.complete(id,requester)).isInstanceOf(ResponseStatusException.class);
 }
 @Test void failedCreditAcknowledgementLeavesErrandFrozenAndOriginalOperationResumable(){
  UUID id=accepted(),caseId=UUID.randomUUID(),operation=UUID.randomUUID();reviews.freeze(id,caseId,requester,false);
  reviews.prepare(id,caseId,operation,"PAY_COURIER",UUID.randomUUID());
  assertThat(reviews.read(id,caseId).resolved()).isFalse();
  assertThat(reviews.read(id,caseId).state()).isEqualTo("ACCEPTED");
  assertThatThrownBy(()->reviews.prepare(id,caseId,UUID.randomUUID(),"RETURN_TO_REQUESTER",UUID.randomUUID())).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void anUnassignedErrandCanFinishAfterReviewWithoutInventingACourier(){
  UUID id=orders.createOrder(new CreateOrderCommand(requester,"TEST ONLY","Before acceptance",UUID.randomUUID(),"A",UUID.randomUUID(),"B",2,OffsetDateTime.now(ZoneOffset.UTC).plusDays(1))).getId();
  orders.confirmReservation(id,UUID.randomUUID());UUID caseId=UUID.randomUUID(),operation=UUID.randomUUID();reviews.freeze(id,caseId,requester,false);
  assertThat(finish(id,caseId,operation,"RETURN_TO_REQUESTER","RELEASED").state()).isEqualTo("COMPLETED");
  assertThat(orders.getOrder(id,requester).getCourierId()).isNull();
 }
 @Test void frozenOverdueErrandsCannotStarveTheExpiryBatch(){
  UUID id=accepted();orders.withdraw(id,courier);reviews.freeze(id,UUID.randomUUID(),requester,false);
  db.update("UPDATE orders SET pickup_deadline=CURRENT_TIMESTAMP-interval '1 day',created_at=CURRENT_TIMESTAMP-interval '2 days' WHERE id=?",id);
  assertThat(orders.findOverdueOpenOrderIds(1)).doesNotContain(id);
  assertThat(orders.expireIfStillOverdue(id)).isFalse();
 }
 @Test void historicalCourierCanReadAndFindAResolvedReviewInPastEvenIfAlreadyCancelled(){
  UUID id=accepted();orders.withdraw(id,courier);orders.cancel(id,requester);
  db.update("UPDATE orders SET credit_status='RELEASED' WHERE id=?",id);
  UUID caseId=UUID.randomUUID(),operation=UUID.randomUUID();reviews.freeze(id,caseId,requester,false);
  assertThat(queries.findDelivered(courier,MyOrdersFilter.from("review",null),new OrderPaging(0,20)).getContent()).extracting(Order::getId).contains(id);
  assertThat(orders.getOrder(id,courier).getReviewCaseId()).isEqualTo(caseId);
  assertThat(finish(id,caseId,operation,"KEEP_EXISTING","RELEASED").state()).isEqualTo("CANCELLED");
  assertThat(queries.findDelivered(courier,MyOrdersFilter.PAST,new OrderPaging(0,20)).getContent()).extracting(Order::getId).contains(id);
 }
 @Test void freezingAndPickupSerializeSoNoPickupCanCommitAfterTheFreezeAcknowledgement() throws Exception {
  UUID id=accepted(),caseId=UUID.randomUUID();var start=new java.util.concurrent.CountDownLatch(1);
  var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
  try {
   var freeze=pool.submit(()->{start.await();return reviews.freeze(id,caseId,requester,false);});
   var pickup=pool.submit(()->{start.await();try{orders.pickUp(id,courier);return true;}catch(ResponseStatusException ex){return false;}});
   start.countDown();freeze.get(15,java.util.concurrent.TimeUnit.SECONDS);boolean picked=pickup.get(15,java.util.concurrent.TimeUnit.SECONDS);
   assertThat(reviews.read(id,caseId).state()).isEqualTo(picked?"PICKED_UP":"ACCEPTED");
   assertThatThrownBy(()->orders.deliver(id,courier)).isInstanceOf(ResponseStatusException.class);
  } finally {pool.shutdownNow();}
 }
 @Test void unrelatedPartyAndUnconfirmedPriorCreditsCannotFreeze(){
  UUID id=accepted();assertThatThrownBy(()->reviews.freeze(id,UUID.randomUUID(),UUID.randomUUID(),false)).isInstanceOf(ResponseStatusException.class);
  orders.pickUp(id,courier);orders.deliver(id,courier);orders.complete(id,requester);
  assertThatThrownBy(()->reviews.freeze(id,UUID.randomUUID(),requester,false)).isInstanceOf(ResponseStatusException.class);
 }
}
